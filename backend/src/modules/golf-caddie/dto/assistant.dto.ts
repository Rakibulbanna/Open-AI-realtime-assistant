import { z } from "zod";
import { PositionSchema, LieType } from "./shot-recommendation.dto";

/**
 * Assistant chat message schema
 */
export const AssistantMessageSchema = z.object({
   role: z.enum(["system", "user", "assistant", "function"]),
   content: z.string().optional(),
   name: z.string().optional(),
   function_call: z
      .object({
         name: z.string(),
         arguments: z.string(),
      })
      .optional(),
});

/**
 * Assistant chat request schema
 */
export const AssistantChatRequestSchema = z.object({
   messages: z.array(AssistantMessageSchema),
   courseId: z.string().optional(),
   holeNumber: z.number().int().min(1).max(18).optional(),
   playerProfile: z
      .object({
         handicap: z.number().min(0).max(54),
         clubDistances: z.object({
            Driver: z.number().min(0),
            "3Wood": z.number().min(0),
            "5Iron": z.number().min(0),
            "7Iron": z.number().min(0),
            "9Iron": z.number().min(0),
            PW: z.number().min(0),
            SW: z.number().min(0),
         }),
      })
      .optional(),
   currentPosition: PositionSchema.optional(),
   holePosition: PositionSchema.optional(),
   currentLie: z.nativeEnum(LieType).optional(),
   wind: z
      .object({
         speed_mps: z.number().min(0),
         direction_deg: z.number().min(0).max(360),
      })
      .optional(),
   obstacles: z
      .object({
         bunkersInLineOfPlay: z.boolean(),
         fairwayWidth: z.enum(["wide", "medium", "narrow"]),
      })
      .optional(),
});

/**
 * Function call response schema
 */
export const FunctionCallResponseSchema = z.object({
   functionName: z.string(),
   result: z.any(),
   success: z.boolean(),
   error: z.string().optional(),
});

/**
 * Assistant chat response schema
 */
export const AssistantChatResponseSchema = z.object({
   message: z.string(),
   functionCalls: z.array(FunctionCallResponseSchema).optional(),
   finishReason: z.enum(["stop", "length", "function_call", "content_filter"]).optional(),
});

// Types
export type AssistantMessageDto = z.infer<typeof AssistantMessageSchema>;
export type AssistantChatRequestDto = z.infer<typeof AssistantChatRequestSchema>;
export type FunctionCallResponseDto = z.infer<typeof FunctionCallResponseSchema>;
export type AssistantChatResponseDto = z.infer<typeof AssistantChatResponseSchema>;

