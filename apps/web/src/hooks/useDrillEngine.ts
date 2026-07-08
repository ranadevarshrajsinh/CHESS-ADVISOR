"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { getBestEnginePath } from "@/lib/engine/stockfish-loader";

export type DrillEngineStatus = "idle" | "initializing" | "ready" | "thinking" | "error";

// Stockfish UCI_Elo supports 1320-3190 only.
// Below 1320 we simulate weak play with Skill Level (0-10) + very short movetime.
// This combination gives approximately:
//   600 ELO → Skill 0 + 30ms  (~700 ELO in practice, closest Stockfish can get)
//   800 ELO → Skill 2 + 90ms
//  1000 ELO → Skill 5 + 200ms
//  1200 ELO → Skill 8 + 340ms
//  1320+    → Skill 20 + UCI_Elo + 500ms (precise)
function applyEloSettings(
  send: (cmd: string) => void,
  elo: number,
  movetimeRef: React.MutableRefObject<number>,
) {
  const clamped = Math.max(600, Math.min(2400, elo));

  if (clamped >= 1320) {
    movetimeRef.current = 500;
    send("setoption name Skill Level value 20");
    send("setoption name UCI_LimitStrength value true");
    send(`setoption name UCI_Elo value ${Math.min(clamped, 3190)}`);
  } else {
    const t = (clamped - 600) / (1320 - 600); // 0 → 1
    movetimeRef.current = Math.round(30 + t * 370);
    const skillLevel = Math.round(t * 10);
    send(`setoption name Skill Level value ${skillLevel}`);
    send("setoption name UCI_LimitStrength value false");
  }
}

export function useDrillEngine() {
  const workerRef  = useRef<Worker | null>(null);
  const movetimeRef = useRef(500);
  // statusRef mirrors the status state but is always current — avoids stale-closure
  // bugs when getMove / getEval are called in tight async loops.
  const statusRef  = useRef<DrillEngineStatus>("idle");
  const handlerRef = useRef<((line: string) => void) | null>(null);
  const [status, setStatus] = useState<DrillEngineStatus>("idle");

  const send = useCallback((cmd: string) => {
    workerRef.current?.postMessage(cmd);
  }, []);

  const setEngineStatus = useCallback((s: DrillEngineStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const waitFor = useCallback(
    (prefix: string): Promise<string> =>
      new Promise((resolve) => {
        handlerRef.current = (line: string) => {
          if (line.startsWith(prefix)) {
            handlerRef.current = null;
            resolve(line);
          }
        };
      }),
    [],
  );

  const init = useCallback(
    async (elo: number) => {
      workerRef.current?.terminate();
      workerRef.current = null;
      handlerRef.current = null;
      setEngineStatus("initializing");

      try {
        const { path } = getBestEnginePath();
        const worker = new window.Worker(path);
        workerRef.current = worker;
        worker.onmessage = (e: MessageEvent<string>) => {
          handlerRef.current?.(e.data);
        };

        send("uci");
        await waitFor("uciok");

        applyEloSettings(send, elo, movetimeRef);
        send("setoption name Hash value 16");
        send("isready");
        await waitFor("readyok");

        send("ucinewgame");
        send("isready");
        await waitFor("readyok");

        setEngineStatus("ready");
      } catch {
        setEngineStatus("error");
      }
    },
    [send, waitFor, setEngineStatus],
  );

  // Get engine's best move using the ELO-calibrated movetime
  const getMove = useCallback(
    async (fen: string, uciMoves: string[]): Promise<string | null> => {
      if (!workerRef.current || statusRef.current !== "ready") return null;
      setEngineStatus("thinking");

      const movesStr = uciMoves.length > 0 ? ` moves ${uciMoves.join(" ")}` : "";
      send(`position fen ${fen}${movesStr}`);
      send(`go movetime ${movetimeRef.current}`);

      const line = await waitFor("bestmove");
      const uciMove = line.split(" ")[1];
      setEngineStatus("ready");
      return uciMove && uciMove !== "(none)" ? uciMove : null;
    },
    [send, waitFor, setEngineStatus],
  );

  // Evaluate a position for post-game analysis.
  // Uses a fixed 300ms budget (separate from the drill movetime).
  // The `score cp` eval is unaffected by Skill Level — only the chosen move is skill-limited.
  const getEval = useCallback(
    async (fen: string): Promise<{ bestMove: string | null; score: number } | null> => {
      if (!workerRef.current || statusRef.current !== "ready") return null;
      setEngineStatus("thinking");
      send(`position fen ${fen}`);
      send("go movetime 300");

      return new Promise<{ bestMove: string | null; score: number }>((resolve) => {
        let lastScore = 0;
        handlerRef.current = (line: string) => {
          if (line.startsWith("info") && line.includes(" score cp ")) {
            const m = line.match(/score cp (-?\d+)/);
            if (m) lastScore = parseInt(m[1]);
          } else if (line.startsWith("bestmove")) {
            handlerRef.current = null;
            const uciMove = line.split(" ")[1];
            setEngineStatus("ready");
            resolve({
              bestMove: uciMove && uciMove !== "(none)" ? uciMove : null,
              score: lastScore,
            });
          }
        };
      });
    },
    [send, setEngineStatus],
  );

  const terminate = useCallback(() => {
    handlerRef.current = null;
    try { workerRef.current?.postMessage("quit"); } catch {}
    workerRef.current?.terminate();
    workerRef.current = null;
    setEngineStatus("idle");
  }, [setEngineStatus]);

  useEffect(() => () => terminate(), [terminate]);

  return { status, init, getMove, getEval, terminate };
}
