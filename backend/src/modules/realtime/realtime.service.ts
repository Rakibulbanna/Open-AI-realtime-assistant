import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
    RealtimeAgent,
    RealtimeSession,
} from "@openai/agents/realtime";
import { RunContext } from "@openai/agents-core";
import { v4 as uuid } from "uuid";
import { getSystemInstructions, getVoiceToneInstructions } from "../golf-caddie/utils/assistant-utils";

import { tool, Tool } from "@openai/agents";
import { FunctionHandlerService } from "../golf-caddie/services/function-handler.service";
import { AssistantFunctionNames } from "../golf-caddie/enums/assistant-functions.enum";
import { CustomLogger } from "@app/common/logger.service";

/** Context passed to realtime tools (state + optional NestJS services). */
// export interface RealtimeToolContext {
//     state: Record<string, unknown>;
//     services?: {
//         predictability?: { getSuggestion: (hole: unknown, start_lon: number, start_lat: number) => Promise<unknown> };
//         rounds?: { logClub: (args: unknown) => Promise<void>; markAtGreen: (args: unknown) => Promise<void>; saveHoleScore: (args: unknown) => Promise<void>; setWind: (args: unknown) => Promise<void> };
//         rulesRag?: { ask: (question: string, context?: unknown) => Promise<unknown> };
//     };
// }

// /** Extract our app context from RunContext (realtime passes unknown by default). */
function getCtx(ctx?: RunContext<any>): RunContext<any> | undefined {
    return ctx?.context as RunContext<any> | undefined;
}

export interface EmitEvent {
    audio?: ArrayBuffer;
    text?: string;
}
interface PredictabilityArgs {
    id_course: string;
    hole_number: number;
    start_lon: number;
    start_lat: number;
}
/**
 * Realtime Voice Agent Service
 */
// 7️⃣ Call Rulebook (RAG)
interface CallRulebookArgs {
    question: string;
    context?: { lie?: string; situation?: string };
}
@Injectable()
export class RealtimeService implements OnModuleDestroy {
    private sessions = new Map<string, RealtimeSession>();
    private listeners = new Map<string, (event: EmitEvent) => void>();
    private emitters = new Map<string, (eventName: string, payload: unknown) => void>();
    private predictabilityArgsBySessionId = new Map<string, PredictabilityArgs>();
    private micEnabledBySessionId = new Map<string, boolean>();
    private personality: string = "gordon ramsay";
    private readonly realtimeModel: string;
    private readonly apiKey: string;
    // private readonly logger = new CustomLogger(RealtimeService.name);
    constructor(private readonly functionHandlerService: FunctionHandlerService) {
        this.realtimeModel = process.env.OPENAI_REALTIME_MODEL!;
        this.apiKey = process.env.OPENAI_API_KEY!;
        if (!this.apiKey) {
            throw new Error("OPENAI_API_KEY environment variable is not set");
        }
        if (!this.realtimeModel) {
            throw new Error("OPENAI_REALTIME_MODEL environment variable is not set");
        }
    }
    // private readonly functionHandlerService: FunctionHandlerService
    // 1 Set Personality
    private setPersonalityTool = tool({
        name: "set_personality",
        description: "Sets the personality mode for the caddie (e.g., 'Gordon', 'Other')",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                persona_name: { type: "string", description: "Persona name to set" },
            },
            required: ["persona_name"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            try {
                const { persona_name } = input as { persona_name: string };
                // const c = getCtx(ctx);
                // if (c?.state) c.state.persona = persona_name;
                console.log("persona_name___", persona_name);
                const personality = persona_name?.toLowerCase()?.startsWith("gordon") ? "gordon ramsay" : persona_name;
                this.personality = personality;
                const response = await this.functionHandlerService.handleFunctionCall(AssistantFunctionNames.SET_PERSONALITY, { persona_name: personality });
                const voice = personality == "gordon ramsay" ? `${getVoiceToneInstructions()}\n\nVOICE TONE:\n${response.persona}` : response.persona;
                console.log("voice___", voice);
                return voice;
            } catch (error) {
                console.error("error____", error);
                throw new Error(error instanceof Error ? error.message : "Failed to set personality");
            }
        },
    });

    // 2 Get GPS Location
    private getGpsLocationTool = tool({
        name: "get_gps_location",
        description: "Gets the current GPS location of the player",
        strict: false,
        parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: true,
        },
        execute: async () => {
            return { lat: 23.8103, lng: 90.4125 };
        },
    });

    // 3 Get Predictability Suggestion
    private getPredictabilitySuggestionToolForSession(sessionId: string) {
        return tool({
            name: "get_predictability_suggestion",
            description: "Gets club recommendations based on hole and current position",
            strict: false,
            parameters: {
                type: "object",
                properties: {
                    id_course: { type: "string", description: "Course ID" },
                    hole_number: { type: "number", description: "Hole number" },
                    start_lon: { type: "number", description: "Starting longitude" },
                    start_lat: { type: "number", description: "Starting latitude" },
                },
                // Frontend sends these via socket event; OpenAI tool-call can omit them.
                required: [],
                additionalProperties: true,
            },
            execute: async (input) => {
                const fromFrontend = this.predictabilityArgsBySessionId.get(sessionId);
                const fromTool = (input ?? {}) as Partial<PredictabilityArgs>;
                console.log("fromFrontend___", fromFrontend);
                console.log("fromTool___", fromTool);
                const args: Partial<PredictabilityArgs> = {
                    ...fromFrontend,
                    ...fromTool,
                };

                if (
                    !args.id_course ||
                    !args.hole_number ||
                    !args.start_lon ||
                    !args.start_lat
                ) {
                    const message =
                        "I need your course context before I can suggest a safe and aggressive shot. Please send the `predictability_context` socket event with `id_course`, `hole_number`, `start_lon`, and `start_lat`, then ask again.";
                    // Tell frontend/UI explicitly what to do.
                    this.emitters.get(sessionId)?.("predictability_context_required", {
                        requiredEvent: "predictability_context",
                        requiredFields: ["id_course", "hole_number", "start_lon", "start_lat"],
                    });
                    // Also surface as regular text for user visibility.
                    this.emitters.get(sessionId)?.("text", message);
                    return { error: "PREDICTABILITY_CONTEXT_MISSING", message };
                }

                const result = await this.functionHandlerService.handleFunctionCall(
                    AssistantFunctionNames.GET_PREDICTABILITY_SUGGESTION,
                    args as PredictabilityArgs,
                );

                console.log("result___", JSON.stringify(result, null, 2));

                // Always forward full predictability engine JSON to frontend for UI rendering.
                this.emitters.get(sessionId)?.("predictability_suggestion", result);

                // const sample_response = {
                //     "safe": {
                //         "profile": "SAFE",
                //         "first_shot": {
                //             "club": "Lob Wedge",
                //             "swing": "Full",
                //             "aim_lonlat": {
                //                 "lon": 17.629840776491456,
                //                 "lat": 59.49620643798043
                //             },
                //             "distance_m": 49.8,
                //             "wind_adjusted": false,
                //             "wind_shot_plan": null
                //         }, "total_cost": -4.998,
                //         "reachable": true
                //     },
                //     "aggressive": {
                //         "profile": "AGGRESSIVE",
                //         "first_shot": {
                //             "club": "5 Iron",
                //             "swing": "Full",
                //             "aim_lonlat": {
                //                 "lon": 17.62842502331368,
                //                 "lat": 59.49530812680544
                //             },
                //             "distance_m": 149.6,
                //             "wind_adjusted": false,
                //             "wind_shot_plan": null
                //         }, "total_cost": -11.323,
                //         "reachable": true
                //     }
                // }
                let message = `For sessionId: ${sessionId}, Predictability Suggestion: `;
                if (result.safe && result.aggressive) {
                    if (result.safe.first_shot?.club) {
                        message += `Safe club: ${result.safe.first_shot?.club},`
                    }
                    if (result.safe.first_shot?.aim_lonlat?.lat && result.safe.first_shot?.aim_lonlat?.lon) {
                        message += `Aim lat: ${result.safe.first_shot?.aim_lonlat?.lat}, Aim lon: ${result.safe.first_shot?.aim_lonlat?.lon},`
                    }
                    if (result.safe.first_shot?.distance_m) {
                        message += `Distance: ${result.safe.first_shot?.distance_m} meters,`
                    }
                    if (result.safe.first_shot?.swing) {
                        message += `Swing: ${result.safe.first_shot?.swing},`
                    }
                    if (result.aggressive.first_shot?.club) {
                        message += `Aggressive club: ${result.aggressive.first_shot?.club},`
                    }
                    if (result.aggressive.first_shot?.aim_lonlat?.lat && result.aggressive.first_shot?.aim_lonlat?.lon) {
                        message += `Aim lat: ${result.aggressive.first_shot?.aim_lonlat?.lat}, Aim lon: ${result.aggressive.first_shot?.aim_lonlat?.lon},`
                    }
                    if (result.aggressive.first_shot?.distance_m) {
                        message += `Distance: ${result.aggressive.first_shot?.distance_m} meters,`
                    }
                    if (result.aggressive.first_shot?.swing) {
                        message += `Swing: ${result.aggressive.first_shot?.swing},`
                    }
                } else {
                    message += "No suggestion found";
                }
                console.log("message___", message);
                return message;
            },
        });
    }

    // 4 Set Used Club
    private setUsedClubTool = tool({
        name: "set_used_club",
        description: "Logs which club was used for a shot",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                hole_number: { type: "number" },
                shot_number: { type: "number" },
                club_name: { type: "string" },
                lie_type: { type: "string" },
                gps_position: {
                    type: "object",
                    properties: {
                        lat: { type: "number" },
                        lng: { type: "number" },
                    },
                    required: ["lat", "lng"],
                    additionalProperties: true,
                },
            },
            required: ["hole_number", "shot_number", "club_name", "lie_type", "gps_position"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            return await this.functionHandlerService.handleFunctionCall(AssistantFunctionNames.SET_USED_CLUB, input);
        },
    });

    // 5 Set At Green
    private setAtGreenTool = tool({
        name: "set_at_green",
        description: "Marks that the player has reached the green",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                hole_number: { type: "number" },
                gps_position: {
                    type: "object",
                    properties: { lat: { type: "number" }, lng: { type: "number" } },
                    required: ["lat", "lng"],
                    additionalProperties: true,
                },
            },
            required: ["hole_number", "gps_position"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            return await this.functionHandlerService.handleFunctionCall(AssistantFunctionNames.SET_AT_GREEN, input);
        },
    });

    // 6 Set All Strokes Database
    private setAllStrokesDatabaseTool = tool({
        name: "set_all_strokes_database",
        description: "Records final stroke count for a hole",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                hole_number: { type: "number" },
                total_strokes_for_hole: { type: "number" },
                putts_for_hole: { type: "number" },
            },
            required: ["hole_number", "total_strokes_for_hole", "putts_for_hole"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            return await this.functionHandlerService.handleFunctionCall(AssistantFunctionNames.SET_ALL_STROKES_DATABASE, input);
        },
    });


    // 7 Call Rulebook (RAG)
    private callRulebookTool = tool({
        name: "call_rulebook",
        description: "Queries the golf rules database (RAG)",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                question: { type: "string" },
                context: {
                    type: "object",
                    properties: {
                        lie: { type: "string" },
                        situation: { type: "string" },
                    },
                    required: [],
                    additionalProperties: true,
                },
            },
            required: ["question"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            try {
                const args = input as CallRulebookArgs;
                // console.log("input__", JSON.stringify(args, null, 2));
                // console.log("ctx__", JSON.stringify(ctx, null, 2));
                // const c = getCtx(ctx);
                // if (!c?.services?.rulesRag)
                //     throw new Error("Rules RAG service not available");
                // return await c.services.rulesRag.ask(args.question, args.context);
                const response = await this.functionHandlerService.handleCallRulebook({
                    question: args.question,
                });
                console.log("callRulebookTool answer__", JSON.stringify(response?.answer, null, 2));
                return response.answer;
                // let answer;
                // if (this.personality == "gordon ramsay") {
                //     answer = `${getVoiceToneInstructions()}\n\n${response.answer}`;
                // } else {
                //     answer = response?.answer || "No answer found";
                // }

                // return answer;
            } catch (error) {
                console.error("error____", error);
                throw new Error(error instanceof Error ? error.message : "Failed to call rulebook");
            }
        },
    });

    // 8 Set Wind Condition
    private setWindConditionTool = tool({
        name: "set_wind_condition",
        description: "Sets wind speed and direction for the current shot",
        strict: false,
        parameters: {
            type: "object",
            properties: {
                wind_speed: { type: "number" },
                wind_direction: { type: "number" },
            },
            required: ["wind_speed", "wind_direction"],
            additionalProperties: true,
        },
        execute: async (input, ctx) => {
            return await this.functionHandlerService.handleFunctionCall(AssistantFunctionNames.SET_WIND_CONDITION, input);
        },
    });


    async createSession(services?: any): Promise<string> {
        try {
            const sessionId = uuid();
            this.micEnabledBySessionId.set(sessionId, true);
            const getPredictabilitySuggestionTool =
                this.getPredictabilitySuggestionToolForSession(sessionId);
            const agent = new RealtimeAgent({
                name: "Backend Voice Agent",
                instructions: getSystemInstructions(),
                voice: "ash", // default voice
                tools: [
                    this.setPersonalityTool,
                    this.getGpsLocationTool,
                    getPredictabilitySuggestionTool,
                    this.setUsedClubTool,
                    this.setAtGreenTool,
                    this.setAllStrokesDatabaseTool,
                    this.callRulebookTool,
                    this.setWindConditionTool,
                ],
            });

            const session = new RealtimeSession(agent, {
                model: this.realtimeModel,
                config: {
                    turnDetection: {
                        type: 'semantic_vad',
                        eagerness: 'medium',
                        createResponse: true,
                        interruptResponse: true,
                    },
                }, context: { state: {}, services }
            });

            // Agent responses
            session.on("response", (event: any) => {
                console.log("response___", JSON.stringify(event, null, 2));
                const listener = this.listeners.get(sessionId);
                if (listener) listener({ audio: event.audio, text: event.text });
            });

            await session.connect({ apiKey: this.apiKey });
            this.sessions.set(sessionId, session);
            return sessionId;
        } catch (error) {
            console.error("error____", error);
            throw new Error(error instanceof Error ? error.message : "Failed to create session");
        }
    }

    setListener(sessionId: string, listener: (event: EmitEvent) => void) {
        this.listeners.set(sessionId, listener);
    }
    removeListener(sessionId: string) { this.listeners.delete(sessionId); }
    setEmitter(sessionId: string, emitter: (eventName: string, payload: unknown) => void) {
        this.emitters.set(sessionId, emitter);
    }
    removeEmitter(sessionId: string) { this.emitters.delete(sessionId); }

    setPredictabilityContext(sessionId: string, args: PredictabilityArgs) {
        this.predictabilityArgsBySessionId.set(sessionId, args);
    }
    clearPredictabilityContext(sessionId: string) {
        this.predictabilityArgsBySessionId.delete(sessionId);
    }

    setMicEnabled(sessionId: string, enabled: boolean) {
        this.micEnabledBySessionId.set(sessionId, enabled);
    }
    isMicEnabled(sessionId: string): boolean {
        return this.micEnabledBySessionId.get(sessionId) ?? true;
    }

    async sendAudio(sessionId: string, audio: Buffer) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        /**
   * 🛑 BARGE-IN
   * Cancel assistant speech immediately
   */
        this.sendRealtimeEvent(session, {
            type: "response.cancel",
        });

        /**
         * 🧹 Clear queued audio buffers
         */
        this.sendRealtimeEvent(session, {
            type: "input_audio_buffer.clear",
        });
        const arrayBuffer = new ArrayBuffer(audio.byteLength);
        new Uint8Array(arrayBuffer).set(audio);
        session.sendAudio(arrayBuffer);
    }
    private sendRealtimeEvent(session: RealtimeSession<any>, event: any) {
        const anySession = session as any;

        // RealtimeSession holds an internal websocket transport
        const ws =
            anySession?.socket ||
            anySession?._socket ||
            anySession?.transport?.socket;

        if (!ws || ws.readyState !== 1) return;

        ws.send(JSON.stringify(event));
    }
    sendText(sessionId: string, text: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.sendMessage(text);
    }


    getSession(sessionId: string) { return this.sessions.get(sessionId); }

    closeSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.close();
        this.sessions.delete(sessionId);
        this.listeners.delete(sessionId);
        this.emitters.delete(sessionId);
        this.predictabilityArgsBySessionId.delete(sessionId);
        this.micEnabledBySessionId.delete(sessionId);
    }

    onModuleDestroy() {
        for (const session of this.sessions.values()) session.close();
        this.sessions.clear();
        this.listeners.clear();
        this.emitters.clear();
        this.predictabilityArgsBySessionId.clear();
        this.micEnabledBySessionId.clear();
    }

}