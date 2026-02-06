import { useState, useRef, useCallback, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { startMicPcm } from "./micPcm";
import {
  playPcm16,
  stopPlayback,
  clearPlaybackQueue,
  suspendPlayback,
  resumePlayback,
} from "./playPcm";

const WS_URL = "http://localhost:8010";

type LogEntry = { ts: string; event: string; payload?: unknown };
type ConversationMessage = { role: "user" | "agent"; text: string };

function App() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const stopMicRef = useRef<(() => void) | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isUserSpeakingRef = useRef(false);
  const isAssistantMutedRef = useRef(false);
  const vadCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const addLog = useCallback((event: string, payload?: unknown) => {
    setLogs((prev) => [
      ...prev,
      { ts: new Date().toISOString().slice(11, 23), event, payload },
    ]);
  }, []);

  const setSpeakingState = useCallback(
    (speaking: boolean) => {
      if (speaking === isUserSpeakingRef.current) return;
      if (speaking) {
        isUserSpeakingRef.current = true;
        isAssistantMutedRef.current = true;
        stopPlayback();
        clearPlaybackQueue();
        suspendPlayback();
        addLog("vad_speech_start");
      } else {
        isUserSpeakingRef.current = false;
        isAssistantMutedRef.current = false;
        resumePlayback();
        addLog("vad_speech_end");
      }
    },
    [addLog],
  );

  const setupVad = useCallback(
    (stream: MediaStream) => {
      if (vadCleanupRef.current) {
        vadCleanupRef.current();
        vadCleanupRef.current = null;
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const data = new Float32Array(analyser.fftSize);
      source.connect(analyser);

      const threshold = 0.02;
      const startDebounceMs = 200;
      const stopDebounceMs = 300;
      let aboveSince: number | null = null;
      let belowSince: number | null = null;
      let rafId = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > threshold) {
          if (aboveSince === null) aboveSince = now;
          belowSince = null;
          if (
            !isUserSpeakingRef.current &&
            now - aboveSince >= startDebounceMs
          ) {
            setSpeakingState(true);
          }
        } else {
          if (belowSince === null) belowSince = now;
          aboveSince = null;
          if (isUserSpeakingRef.current && now - belowSince >= stopDebounceMs) {
            setSpeakingState(false);
          }
        }
        rafId = requestAnimationFrame(tick);
      };

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      rafId = requestAnimationFrame(tick);

      vadCleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        try {
          analyser.disconnect();
        } catch {
          // ignore disconnect errors
        }
        try {
          source.disconnect();
        } catch {
          // ignore disconnect errors
        }
        ctx.close();
      };
    },
    [setSpeakingState],
  );

  const connect = () => {
    if (socketRef.current?.connected) {
      addLog("already_connected");
      return;
    }
    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      path: "/socket.io/",
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      addLog("connect", { id: socket.id });
    });

    socket.on("connect_error", (err) => {
      addLog("connect_error", err.message);
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      setSessionId(null);
      setSessionStarted(false);
      setMicOn(false);
      addLog("disconnect", { reason });
    });

    socket.on("started", (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      setSessionStarted(true);
      addLog("started", data);
    });
    socket.on("audio_interrupted", () => {
      stopPlayback();
      clearPlaybackQueue();
      addLog("audio_interrupted");
    });

    socket.on("audio", (audioBuffer: ArrayBuffer) => {
      if (isUserSpeakingRef.current || isAssistantMutedRef.current) {
        addLog("audio_ignored_user_speaking", { size: audioBuffer.byteLength });
        return;
      }
      addLog("audio", { size: audioBuffer.byteLength });
      try {
        playPcm16(audioBuffer);
      } catch (e) {
        addLog("play_error", e instanceof Error ? e.message : String(e));
      }
    });

    socket.on("user_transcript", (text: string) => {
      if (text?.trim()) {
        setConversation((prev) => [
          ...prev,
          { role: "user", text: text.trim() },
        ]);
        addLog("user_transcript", { text });
      }
    });

    socket.on("text", (text: string) => {
      if (text?.trim()) {
        setConversation((prev) => [
          ...prev,
          { role: "agent", text: text.trim() },
        ]);
        addLog("text", { text });
      }
    });

    socket.on("error", (msg: string | { message?: string }) =>
      addLog("error", typeof msg === "string" ? msg : (msg?.message ?? msg)),
    );
  };

  const disconnect = () => {
    if (micOn && stopMicRef.current) {
      stopMicRef.current();
      stopMicRef.current = null;
      setMicOn(false);
    }
    if (vadCleanupRef.current) {
      vadCleanupRef.current();
      vadCleanupRef.current = null;
    }
    if (isUserSpeakingRef.current) {
      setSpeakingState(false);
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
  };

  const startSession = () => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit("start");
    addLog("emit:start");
  };

  const stopSession = () => {
    if (!socketRef.current?.connected) return;
    if (micOn && stopMicRef.current) {
      stopMicRef.current();
      stopMicRef.current = null;
      setMicOn(false);
    }
    socketRef.current.emit("stop");
    addLog("emit:stop");
    setSessionStarted(false);
    setSessionId(null);
  };

  const sendText = () => {
    const text = inputText.trim();
    if (!text || !socketRef.current?.connected || !sessionStarted) return;
    socketRef.current.emit("text_input", { text });
    setConversation((prev) => [...prev, { role: "user", text }]);
    setInputText("");
    addLog("emit:text_input", { text });
  };

  const toggleMic = async () => {
    if (micOn && stopMicRef.current) {
      stopMicRef.current();
      stopMicRef.current = null;
      setMicOn(false);
      if (vadCleanupRef.current) {
        vadCleanupRef.current();
        vadCleanupRef.current = null;
      }
      if (isUserSpeakingRef.current) {
        setSpeakingState(false);
      }
      addLog("mic_stopped");
      return;
    }
    if (!socketRef.current?.connected || !sessionStarted) {
      addLog("mic_error", "Connect and start session first");
      return;
    }
    try {
      const stop = await startMicPcm({
        onChunk: (arrayBuffer) => {
          if (!socketRef.current?.connected) return;
          const copy = arrayBuffer.slice(0);
          socketRef.current.emit("audio", copy);
        },
        onError: (err) => addLog("mic_error", err.message),
        onStream: (stream) => setupVad(stream),
      });
      stopMicRef.current = stop;
      setMicOn(true);
      addLog("mic_started");
    } catch (err) {
      addLog("mic_error", err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    return () => {
      if (vadCleanupRef.current) {
        vadCleanupRef.current();
        vadCleanupRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#f0f2f5",
      }}
    >
      {/* Header */}
      <header
        style={{
          flexShrink: 0,
          padding: "12px 16px",
          background: "#075e54",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Voice Chat</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#25d366" : "#8696a0",
            }}
          />
          <span style={{ fontSize: 13 }}>
            {connected
              ? sessionStarted
                ? "Ready"
                : "Connected"
              : "Disconnected"}
            {sessionStarted && sessionId && (
              <span style={{ marginLeft: 4, opacity: 0.8 }} title={sessionId}>
                •
              </span>
            )}
          </span>
          {micOn && (
            <span
              style={{
                fontSize: 11,
                background: "rgba(255,255,255,0.2)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Mic on
            </span>
          )}
        </div>
      </header>

      {/* Chat area */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {conversation.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#667781",
              fontSize: 14,
              textAlign: "center",
              padding: 24,
            }}
          >
            Connect → Start session → Start mic, then speak.
            <br />
            Your words and the agent reply will appear here.
          </div>
        )}
        {conversation.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 18,
                fontSize: 15,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
                ...(msg.role === "user"
                  ? {
                      background: "rgb(7, 73, 45)",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      // dark color
                      background: "rgb(95, 11, 87)",
                      borderBottomLeftRadius: 4,
                    }),
                // add a motion seems like the text is typing
                animation: "typing 1s ease-in-out",
                animationDelay: `${i * 0.1}s`,
                animationDuration: "1s",
                animationFillMode: "forwards",
                animationIterationCount: "infinite",
                animationDirection: "alternate",
                animationTimingFunction: "ease-in-out",
                animationPlayState: "running",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </main>

      {/* Text input + Send */}
      {sessionStarted && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            background: "#f0f2f5",
            borderTop: "1px solid #e9edef",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 20,
              border: "1px solid #e9edef",
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            onClick={sendText}
            disabled={!inputText.trim()}
            style={{
              ...btnStyle(!inputText.trim()),
              borderRadius: "50%",
              width: 44,
              height: 44,
              padding: 0,
              background: inputText.trim() ? "#075e54" : "#e9edef",
              color: inputText.trim() ? "#fff" : "#8696a0",
              border: "none",
            }}
          >
            Send
          </button>
        </div>
      )}

      {/* Controls */}
      <footer
        style={{
          flexShrink: 0,
          padding: 12,
          background: "#fff",
          borderTop: "1px solid #e9edef",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          onClick={connect}
          disabled={connected}
          style={btnStyle(connected)}
        >
          Connect
        </button>
        <button
          onClick={disconnect}
          disabled={!connected}
          style={btnStyle(!connected)}
        >
          Disconnect
        </button>
        <button
          onClick={startSession}
          disabled={!connected || sessionStarted}
          style={btnStyle(!connected || sessionStarted)}
        >
          Start session
        </button>
        <button
          onClick={stopSession}
          disabled={!connected || !sessionStarted}
          style={btnStyle(!connected || !sessionStarted)}
        >
          Stop session
        </button>
        <button
          onClick={toggleMic}
          disabled={!sessionStarted}
          style={{
            ...btnStyle(!sessionStarted),
            ...(micOn ? { background: "#dc3545", color: "#fff" } : {}),
          }}
        >
          {micOn ? "Stop mic" : "Start mic"}
        </button>
        <button
          onClick={() => setShowLog((s) => !s)}
          style={{ ...btnStyle(false), marginLeft: "auto" }}
        >
          {showLog ? "Hide log" : "Show log"}
        </button>
      </footer>

      {/* Event log (collapsible) */}
      {showLog && (
        <div
          style={{
            flexShrink: 0,
            maxHeight: 200,
            overflow: "auto",
            padding: 12,
            background: "#111",
            color: "#eee",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {logs.length === 0
            ? "(no events)"
            : logs.map((l, i) => (
                <div key={i}>
                  [{l.ts}] {l.event}
                  {l.payload != null ? ` ${JSON.stringify(l.payload)}` : ""}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: disabled ? "#e9edef" : "#fff",
    color: disabled ? "#8696a0" : "#111",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
  };
}

export default App;
