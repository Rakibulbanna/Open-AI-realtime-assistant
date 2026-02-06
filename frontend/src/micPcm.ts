/**
 * Captures microphone and produces PCM16 16kHz mono chunks for the Realtime Voice backend.
 * Uses AudioContext + ScriptProcessorNode; resamples from context sample rate to 16kHz.
 */

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

export type MicPcmCallbacks = {
  onChunk: (arrayBuffer: ArrayBuffer) => void;
  onError: (err: Error) => void;
  onStream?: (stream: MediaStream) => void;
};

export async function startMicPcm(callbacks: MicPcmCallbacks): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  callbacks.onStream?.(stream);
  const ctx = new AudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const source = ctx.createMediaStreamSource(stream);
  const sampleRate = ctx.sampleRate; // typically 48000 or 44100
  const ratio = sampleRate / TARGET_SAMPLE_RATE; // e.g. 3 for 48k -> 16k

  const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0); // Float32
    const outLength = Math.floor(input.length / ratio);
    const pcm16 = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const idx = i * ratio;
      const idx0 = Math.floor(idx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = idx - idx0;
      const sample = input[idx0] * (1 - frac) + input[idx1] * frac;
      const s16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      pcm16[i] = s16;
    }
    callbacks.onChunk(pcm16.buffer.slice(0));
  };

  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(processor);
  processor.connect(gain);
  gain.connect(ctx.destination);

  return () => {
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}
