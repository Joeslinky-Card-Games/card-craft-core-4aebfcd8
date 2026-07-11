// Lightweight browser notification + sound helpers for match events.
// Sounds are synthesized with the Web Audio API so no audio assets are needed.

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function tone(frequency: number, duration: number, when = 0, type: OscillatorType = "sine", gain = 0.15) {
  const ac = ctx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playChatSound() {
  tone(880, 0.12, 0, "triangle", 0.12);
  tone(1320, 0.14, 0.08, "triangle", 0.1);
}

export function playTurnSound() {
  tone(660, 0.18, 0, "sine", 0.18);
  tone(990, 0.22, 0.12, "sine", 0.16);
  tone(1320, 0.26, 0.24, "sine", 0.14);
}

let permissionAsked = false;
export function ensureNotificationPermission() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (permissionAsked) return;
  permissionAsked = true;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Only surface a system notification when the tab isn't focused; otherwise
  // the sound + in-app UI are enough.
  if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, tag, silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}