import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import {
  getSystemInstructions,
  assistantTools,
} from "../utils/assistant-utils";
import { FunctionHandlerService } from "./function-handler.service";
import {
  AssistantChatRequestDto,
  AssistantChatResponseDto,
  FunctionCallResponseDto,
} from "../dto/assistant.dto";

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly openai: OpenAI;
  private readonly model = "gpt-4o-mini";

  constructor(private readonly functionHandlerService: FunctionHandlerService,) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Build context information string for the AI
   * Informs the AI about available data in the request context
   */
  private buildContextInfo(request: AssistantChatRequestDto): string {
    const contextParts: string[] = [];

    if (request.currentPosition) {
      contextParts.push(
        `GPS coordinates are available: lat=${request.currentPosition.lat}, lng=${request.currentPosition.lng}`
      );
    }

    if (request.courseId && request.holeNumber) {
      contextParts.push(
        `Course ID: ${request.courseId}, Hole Number: ${request.holeNumber}`
      );
    }

    if (request.currentLie) {
      contextParts.push(`Current lie: ${request.currentLie}`);
    }

    if (request.wind) {
      contextParts.push(
        `Wind conditions: ${request.wind.speed_mps} m/s at ${request.wind.direction_deg}°`
      );
    }

    if (contextParts.length === 0) {
      return "No additional context data is available in this request.";
    }

    return `CURRENT REQUEST CONTEXT:\n${contextParts.join("\n")}\n\nIMPORTANT: If GPS coordinates (currentPosition) are already provided above, you can use them directly for get_predictability_suggestion without calling get_gps_location first. If hole data (courseId and holeNumber) are provided, you may need to fetch the hole geometry data to call get_predictability_suggestion.`;
  }

  /**
   * Convert assistant tools to OpenAI format
   */
  private getOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return assistantTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Process a chat message with the assistant
   * Handles function calling similar to the orderbutler implementation
   */
  async chat(
    request: AssistantChatRequestDto
  ): Promise<AssistantChatResponseDto> {
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

      // Add system message if not already present
      const hasSystemMessage = request.messages.some(
        (msg) => msg.role === "system"
      );
      if (!hasSystemMessage) {
        const systemInstructions = getSystemInstructions();
        const contextInfo = this.buildContextInfo(request);
        messages.push({
          role: "system",
          content: `${systemInstructions}\n\n${contextInfo}`,
        });
      }

      // Convert request messages to OpenAI format
      for (const msg of request.messages) {
        if (msg.role === "function") {
          if (!msg.name) {
            this.logger.warn("Function message missing name, skipping");
            continue;
          }
          messages.push({
            role: "function",
            name: msg.name,
            content: msg.content || "",
          });
        } else if (msg.role === "assistant" && msg.function_call) {
          messages.push({
            role: "assistant",
            content: msg.content || null,
            function_call: {
              name: msg.function_call.name,
              arguments: msg.function_call.arguments,
            },
          });
        } else {
          messages.push({
            role: msg.role as "system" | "user" | "assistant",
            content: msg.content || "",
          });
        }
      }

      // Make OpenAI API call with function calling
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: this.getOpenAITools(),
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 1000,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No response choice returned from OpenAI");
      }

      const functionCalls: FunctionCallResponseDto[] = [];

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const functionToolCalls = choice.message.tool_calls.filter(
          (tc) => tc.type === "function"
        );

        if (functionToolCalls.length === 0) {
          return {
            message: choice.message.content || "",
            functionCalls: [],
            finishReason: choice.finish_reason as any,
          };
        }

        messages.push({
          role: "assistant",
          content: choice.message.content,
          tool_calls: functionToolCalls,
        });

        for (const toolCall of functionToolCalls) {
          try {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || "{}");

            const result = await this.functionHandlerService.handleFunctionCall(
              functionName,
              args,
              request
            );

            functionCalls.push({
              functionName,
              result,
              success: true,
            });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            this.logger.error(
              `Error executing function ${toolCall.function.name}: ${errorMessage}`,
              error instanceof Error ? error.stack : undefined
            );
            functionCalls.push({
              functionName: toolCall.function.name,
              result: null,
              success: false,
              error: errorMessage,
            });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMessage }),
            });
          }
        }
        let message = null;
        let finishReason = null;
        if (functionCalls.length === 0) {
          const finalResponse = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            tools: this.getOpenAITools(),
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 1000,
          });

          const finalChoice = finalResponse.choices[0];
          if (!finalChoice) {
            throw new Error("No response choice returned from OpenAI final response");
          }
          message = finalChoice.message.content || "";
          finishReason = finalChoice.finish_reason as any;
        }

        return {
          message: message || "",
          functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
          finishReason: finishReason,
        };
      }

      return {
        message: choice.message.content || "",
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
        finishReason: choice.finish_reason as any,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Error in assistant chat: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw new Error(`Failed to process chat: ${errorMessage}`);
    }
  }

  /**
   * Process streaming chat (for future implementation)
   */
  async chatStream(
    request: AssistantChatRequestDto
  ): Promise<AsyncIterable<string>> {
    // TODO: Implement streaming if needed
    throw new Error("Streaming not yet implemented");
  }

  async createSession(): Promise<{ client_secret: string }> {
    const res = await fetch(
      // "https://api.openai.com/v1/realtime/sessions",
      // {
      //   method: "POST",
      //   headers: {
      //     Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     model: process.env.OPENAI_REALTIME_MODEL,
      //     voice: "alloy",
      //     tools: assistantTools.map((tool) => ({
      //       type: "function",
      //       name: tool.name,
      //       description: tool.description,
      //       parameters: tool.parameters,
      //     })),

      //     instructions: getSystemInstructions(),
      //   }),
      // },

      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: {
            anchor: "created_at",
            seconds: 600,
          },
          session: {
            type: "realtime",
            model: process.env.OPENAI_REALTIME_MODEL,
            instructions: getSystemInstructions(),
            audio: {
              input: {
                transcription: {
                  model: "whisper-1",
                },
              },
            },
            output_modalities: ["audio"],
            tracing: "auto",
            tools: assistantTools.map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })),
          },
        }),
      },
    );
    const session = await res.json();
    // 🔥 THIS LINE IS THE KEY
    // await this.toolHandler.attachToSession(session.id);
    // console.log("attached to session___", JSON.stringify(session, null, 2));
    // console.log("session___", JSON.stringify(session, null, 2));
    return {
      client_secret: session.value,
      // sessionId: session.id,
    };
  }
}
