import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { RealtimeService } from "./realtime.service";

type PredictabilityContextPayload = {
    id_course: string;
    hole_number: number;
    start_lon: number;
    start_lat: number;
};
@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class RealtimeGateway implements OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
    private interruptCount = 0;
    constructor(private readonly realtime: RealtimeService,

    ) { }

    /**
     * STEP 1
     * Frontend → Backend
     * event: "start"
     */
    @SubscribeMessage("start")
    async handleStart(@ConnectedSocket() client: Socket) {
        let sessionId: string;
        try {
            sessionId = await this.realtime.createSession();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create session";
            client.emit("error", message);
            return;
        }
        client.data.sessionId = sessionId;

        const session = this.realtime.getSession(sessionId);

        if (!session) {
            client.emit("error", "Failed to create voice session");
            return;
        }

        // Allow RealtimeService tools to emit arbitrary events to this socket session.
        this.realtime.setEmitter(sessionId, (eventName: string, payload: unknown) => {
            client.emit(eventName, payload);
        });

        /**
         * STEP 5
         * OpenAI → Backend → Frontend
         * Stream assistant audio chunks
         */
        session.on("audio", (event) => {
            if (event.type === "audio") {
                client.emit("audio", event.data);
            }
        });

        /**
         * Forward "response" events (audio) to client; agent text comes from agent_end
         */
        this.realtime.setListener(sessionId, (event) => {
            if (event.audio) client.emit("audio", event.audio);
            if (event.text) client.emit("text", event.text);
        });

        /**
        * SDK-driven interruption (server VAD)
        * Tell frontend to stop local playback immediately
        */
        session.on("audio_interrupted", () => {
            console.log("audio_interrupted____", ++this.interruptCount);
            client.emit("audio_interrupted");
        });

        /**
         * Agent reply text is emitted on agent_end (third arg = textOutput)
         */
        session.on("agent_end", (_context: unknown, _agent: unknown, textOutput: string) => {
            if (textOutput?.trim()) client.emit("text", textOutput.trim());
        });

        /**
         * Forward user speech-to-text (what you said) to client for UI display
         */
        session.on("transport_event", (event: { type?: string; transcript?: string }) => {
            if (event?.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
                client.emit("user_transcript", event.transcript);
            }
        });
        console.log("started__", sessionId);
        client.emit("started", { sessionId });
    }

    /**
     * Frontend → Backend
     * event: "mic_on"
     */
    @SubscribeMessage("mic_on")
    handleMicOn(@ConnectedSocket() client: Socket) {
        const sessionId = client.data.sessionId;
        if (!sessionId) return;
        this.realtime.setMicEnabled(sessionId, true);
        client.emit("mic_state", { enabled: true });
    }

    /**
     * Frontend → Backend
     * event: "mic_off"
     */
    @SubscribeMessage("mic_off")
    handleMicOff(@ConnectedSocket() client: Socket) {
        const sessionId = client.data.sessionId;
        if (!sessionId) return;
        this.realtime.setMicEnabled(sessionId, false);
        client.emit("mic_state", { enabled: false });
    }

    /**
     * Frontend → Backend
     * event: "predictability_context"
     * payload: { id_course, hole_number, start_lon, start_lat }
     *
     * Stored per socket sessionId and later used by OpenAI tool call.
     */
    @SubscribeMessage("predictability_context")
    handlePredictabilityContext(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: PredictabilityContextPayload,
    ) {
        const sessionId = client.data.sessionId;
        console.log("___handlePredictabilityContext___", sessionId, data);
        if (!sessionId) return;

        if (
            !data?.id_course ||
            !data?.hole_number ||
            !data?.start_lon ||
            !data?.start_lat
        ) {
            client.emit("error", "Missing required fields for predictability_context");
            return;
        }
        console.log("data___", data);
        this.realtime.setPredictabilityContext(sessionId, {
            id_course: data.id_course,
            hole_number: data.hole_number,
            start_lon: data.start_lon,
            start_lat: data.start_lat,
        });
        // tell openai to call the get_predictability_suggestion tool with the parameter data which is set in my backend
        this.realtime.sendText(sessionId,
            "For calling the get_predictability_suggestion tool, the parameter data which is set in my backend is: " + `course id: ${data.id_course}, hole number: ${data.hole_number}, start lon: ${data.start_lon}, start lat: ${data.start_lat}` + " and sessionId: " + sessionId + " .you can call the tool if the user asks for the predictability suggestion.");

        client.emit("predictability_context_saved", { success: true });
    }

    /**
     * STEP 3
     * Frontend → Backend
     * event: "audio"
     * payload: ArrayBuffer (PCM16 16kHz mono)
     */
    @SubscribeMessage("audio")
    async handleAudio(
        @ConnectedSocket() client: Socket,
        @MessageBody() audioChunk: ArrayBuffer | Buffer | undefined,
    ) {
        const sessionId = client.data.sessionId;
        // console.log("audio___", sessionId);

        if (!sessionId) return;
        if (!this.realtime.isMicEnabled(sessionId)) return;
        if (!audioChunk || (typeof ArrayBuffer !== "undefined" && !(audioChunk instanceof ArrayBuffer) && !Buffer.isBuffer(audioChunk))) {
            return;
        }

        const buf = Buffer.isBuffer(audioChunk) ? audioChunk : Buffer.from(audioChunk);
        // console.log("audioChunk___", buf.length);
        await this.realtime.sendAudio(sessionId, buf);
    }

    /**
     * Frontend → Backend
     * event: "text_input"
     * payload: { text: string }
     */
    @SubscribeMessage("text_input")
    handleTextInput(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { text: string },
    ) {
        const sessionId = client.data.sessionId;
        if (!sessionId || !data?.text?.trim()) return;
        this.realtime.sendText(sessionId, data.text.trim());
    }

    /**
     * STEP 8
     * Frontend → Backend
     * event: "stop"
     */
    @SubscribeMessage("stop")
    handleStop(@ConnectedSocket() client: Socket) {
        const sessionId = client.data.sessionId;
        if (!sessionId) return;

        this.realtime.closeSession(sessionId);
        // client.disconnect(true);
        client.emit("stopped");
    }

    /**
     * Handle sudden disconnect
     */
    handleDisconnect(client: Socket) {
        const sessionId = client.data.sessionId;
        if (!sessionId) return;

        this.realtime.closeSession(sessionId);
        client.disconnect(true);
    }
}
