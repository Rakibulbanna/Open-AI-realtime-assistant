/**
 * Play raw PCM16 mono via Web Audio API.
 * Backend (OpenAI Realtime) sends raw PCM, not MP3; the browser <audio> element
 * cannot play it. We decode PCM16 → Float32 and play via AudioContext.
 * Chunks are queued and played sequentially to avoid overlapping speech.
 */
const OUTPUT_SAMPLE_RATE = 24000; // OpenAI Realtime API output is typically 24kHz

let sharedContext: AudioContext | null = null;
const queue: ArrayBuffer[] = [];
let isPlaying = false;
let currentSource: AudioBufferSourceNode | null = null;

function getContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

function playNext(): void {
  if (isPlaying || queue.length === 0) return;
  isPlaying = true;
  const arrayBuffer = queue.shift()!;
  const ctx = getContext();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => { });
  }
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
  buffer.copyToChannel(float32, 0);
  const source = ctx.createBufferSource();
  currentSource = source;
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    isPlaying = false;
    currentSource = null;
    playNext();
  };
  source.start(0);
}

export function playPcm16(arrayBuffer: ArrayBuffer, _sampleRate = OUTPUT_SAMPLE_RATE): void {
  queue.push(arrayBuffer);
  playNext();
}

export function stopPlayback(): void {
  if (!currentSource) return;
  try {
    currentSource.stop();
  } catch {
    // ignore if already stopped
  }
  try {
    currentSource.disconnect();
  } catch {
    // ignore if already disconnected
  }
  currentSource = null;
  isPlaying = false;
}

export function clearPlaybackQueue(): void {
  queue.length = 0;
}

export function suspendPlayback(): void {
  if (!sharedContext || sharedContext.state !== "running") return;
  sharedContext.suspend().catch(() => { });
}

export function resumePlayback(): void {
  if (!sharedContext || sharedContext.state !== "suspended") return;
  sharedContext.resume().catch(() => { });
}
