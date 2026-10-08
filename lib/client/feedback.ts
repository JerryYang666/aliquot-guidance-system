/**
 * Sounds and vibration for scan results, so the aliquoter knows the outcome
 * without looking. Browsers start audio muted until the page is touched;
 * unlockAudio() is called on the first touch or key press.
 */
let context: AudioContext | null = null;

export function unlockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    // No Web Audio: stay silent.
  }
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const t = context.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export type Feedback = "ok" | "done" | "repeat" | "error";

export function signal(kind: Feedback) {
  switch (kind) {
    case "ok":
      tone(1320, 0, 0.12, "sine");
      navigator.vibrate?.(40);
      break;
    case "done":
      tone(1320, 0, 0.1, "sine");
      tone(1760, 0.12, 0.16, "sine");
      navigator.vibrate?.([40, 60, 40]);
      break;
    case "repeat":
      tone(880, 0, 0.1, "sine");
      break;
    case "error":
      tone(220, 0, 0.18, "square");
      tone(180, 0.22, 0.28, "square");
      navigator.vibrate?.([200, 100, 200]);
      break;
  }
}
