"use client";
import { useRef, useCallback } from "react";
import { useSettings } from "@/contexts/SettingsContext";

type SoundEvent = "move" | "capture" | "solved" | "wrong";

export function useChessSound() {
  const { soundEnabled } = useSettings();
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  const tone = useCallback((
    c: AudioContext,
    freq: number,
    endFreq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
  ) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = type;
    const t = c.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }, []);

  const play = useCallback((event: SoundEvent) => {
    if (!soundEnabled) return;
    const c = getCtx();
    if (!c) return;
    try {
      switch (event) {
        case "move":
          // Short woody tick: square wave sweeping down
          tone(c, 880, 440, 0.07, 0.22, "square");
          break;

        case "capture":
          // Heavier thud: sawtooth low sweep + square overtone
          tone(c, 360, 130, 0.13, 0.30, "sawtooth");
          tone(c, 720, 280, 0.06, 0.14, "square");
          break;

        case "solved":
          // Ascending 3-note chime: C5 → E5 → G5
          tone(c, 523, 523, 0.20, 0.20, "sine", 0.00);
          tone(c, 659, 659, 0.20, 0.20, "sine", 0.16);
          tone(c, 784, 784, 0.30, 0.20, "sine", 0.32);
          break;

        case "wrong":
          // Descending minor-6th: A4 → Eb4
          tone(c, 440, 440, 0.10, 0.16, "sine", 0.00);
          tone(c, 311, 311, 0.22, 0.14, "sine", 0.12);
          break;
      }
    } catch {
      // AudioContext failure — silently skip
    }
  }, [soundEnabled, getCtx, tone]);

  return { play };
}
