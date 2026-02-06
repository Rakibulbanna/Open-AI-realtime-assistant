# iCaddie Realtime Voice Agent Flow

This document describes the full workflow of the **Realtime Voice Agent** system in the iCaddie backend using **NestJS, OpenAI Realtime API, and Socket.IO**.

---

## **1. Setup**

- **Backend:**
  - `RealtimeService` → manages sessions, tools, audio, and agent.
  - `RealtimeGateway` → Socket.IO gateway.
  - Tools:
    - `setPersonalityTool`
    - `getGpsLocationTool`
    - `getPredictabilitySuggestionTool`
    - `setUsedClubTool`
    - `setAtGreenTool`
    - `setAllStrokesDatabaseTool`
    - `callRulebookTool`
    - `setWindConditionTool`

- **Frontend:** connects via Socket.IO to backend.

---

## **2. Frontend → Backend Events**

### **Step 0: Connect**

```ts
const socket = io("http://localhost:3000");
```

- Backend receives socket connection.
- No session is created yet.

---

### **Step 1: Start Session**

**Frontend:**

```ts
socket.emit("start");
```

**Backend (Gateway handleStart):**

```ts
const sessionId = await this.realtime.createSession();
client.data.sessionId = sessionId;
```

- Creates a **RealtimeSession**:
  - Agent instructions + voice
  - Tools
  - Session state object
  - Optional services (predictability, rounds, rulesRag)

**Backend emits:**

```ts
client.emit("started", { sessionId });
```

**Frontend receives:**

```ts
socket.on("started", ({ sessionId }) => console.log("Session started:", sessionId));
```

---

### **Step 2: Send Audio**

**Frontend:**

```ts
socket.emit("audio", audioChunk); // PCM16 16kHz ArrayBuffer
```

**Backend (Gateway handleAudio → RealtimeService sendAudio):**

```ts
const arrayBuffer = new ArrayBuffer(audio.byteLength);
new Uint8Array(arrayBuffer).set(audio);
session.sendAudio(arrayBuffer);
```

- Audio is sent to **OpenAI RealtimeAgent**.
- Agent converts audio → text → executes tools → generates response audio.

---

### **Step 3: Tool Calls (Internal)**

- Tools are executed automatically by the agent based on reasoning.
- Example:

```ts
await ctx.services.predictability.getSuggestion(args.hole, args.start_lon, args.start_lat);
```

- Result is returned internally to the agent.
- Optional: send confirmation to frontend via `tool_result` event.

---

### **Step 4: Agent Response → Frontend**

**RealtimeService listens:**

```ts
session.on("response", (event) => {
  const listener = this.listeners.get(sessionId);
  if (listener) listener({ audio: event.audio, text: event.text });
});
```

**Frontend receives:**

```ts
socket.on("audio", (audioBuffer) => {
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
});

socket.on("text", (text) => console.log("Agent says:", text));
```

---

### **Step 5: Repeat Steps 2–4**

- Frontend keeps sending audio chunks.
- Agent keeps responding in near real-time.
- Tools called automatically when needed.

---

### **Step 6: Stop Session**

**Frontend:**

```ts
socket.emit("stop");
```

**Backend (Gateway handleStop → RealtimeService closeSession):**

```ts
session.close();
this.sessions.delete(sessionId);
this.listeners.delete(sessionId);
client.disconnect(true);
```

- Session is cleaned up, memory freed.
- Backend no longer receives audio.

---

### **Step 7: Handle Disconnect**

**Backend (Gateway handleDisconnect):**

```ts
handleDisconnect(client) {
  const sessionId = client.data.sessionId;
  if (!sessionId) return;
  this.realtime.closeSession(sessionId);
}
```

- Ensures session is closed if user disconnects unexpectedly.

---

## **8. Event Summary Table**

| Step | Frontend Event | Backend Action | Backend → Frontend |
|------|----------------|----------------|-----------------|
| 0 | connect | store socket | - |
| 1 | `start` | create RealtimeSession | `started` with sessionId |
| 2 | `audio` | `sendAudio()` → OpenAI | - |
| 3 | - | Tools executed automatically | Tool results included in agent response |
| 4 | - | listen to `response` | `audio` & `text` emitted |
| 5 | repeat | send more audio | more `audio` & `text` |
| 6 | optional tool events | return status | `tool_result` (optional) |
| 7 | `stop` | close session | disconnect socket |
| 8 | sudden disconnect | close session | - |

---

## **9. Notes**

1. Tool results are handled internally; no explicit `toolResult()` or `respondToToolCall()` is needed.
2. `state` object persists session persona and other info.
3. Frontend should play audio chunks as received and display text optionally.
4. Session cleanup is essential on stop or disconnect.

---

## **10. Optional Frontend Example**

```ts
socket.on("audio", (audioBuffer) => {
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const audio = new Audio(URL.createObjectURL(blob));
  audio.play();
});

socket.on("text", (text) => console.log(text));
socket.emit("start");
```

---

**End of Document**

