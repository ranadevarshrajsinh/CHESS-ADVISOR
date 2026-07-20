import type {
  EngineWorker,
  EvaluateGameParams,
  GameEval,
  PositionEval,
} from "@/types/engine-types";
import { parseEvaluationResults } from "./helpers/parse-results";
import { computeAccuracy } from "./helpers/accuracy";
import { getMovesClassification } from "./helpers/move-classification";
import { computeEstimatedElo } from "./helpers/estimate-elo";
import { getEngineWorker, sendCommandsToWorker } from "./worker-loader";
import type { WorkerJob } from "@/types/engine-types";
import { Chess } from "chess.js";
import { fetchLichessCloudEval } from "./helpers/lichess-cloud-eval";

export class EnginePool {
  private workers: EngineWorker[] = [];
  private workerQueue: WorkerJob[] = [];
  private isReady = false;
  private enginePath: string;
  private multiPv = 3;
  private hashSize = 16;
  private evalCache = new Map<string, PositionEval>();

  private constructor(enginePath: string) {
    this.enginePath = enginePath;
  }

  public static async create(
    enginePath: string,
    settings?: { multiPv?: number; hashSize?: number }
  ): Promise<EnginePool> {
    const pool = new EnginePool(enginePath);
    if (settings?.multiPv) pool.multiPv = settings.multiPv;
    if (settings?.hashSize) pool.hashSize = settings.hashSize;
    await pool.addNewWorker();
    pool.isReady = true;
    return pool;
  }

  private acquireWorker(): EngineWorker | undefined {
    for (const worker of this.workers) {
      if (!worker.isReady) continue;
      worker.isReady = false;
      return worker;
    }
    return undefined;
  }

  private async releaseWorker(worker: EngineWorker) {
    const nextJob = this.workerQueue.shift();
    if (!nextJob) {
      worker.isReady = true;
      return;
    }

    const res = await sendCommandsToWorker(
      worker,
      nextJob.commands,
      nextJob.finalMessage,
      nextJob.onNewMessage
    );

    this.releaseWorker(worker);
    nextJob.resolve(res);
  }

  private async setMultiPv(multiPv: number) {
    if (multiPv === this.multiPv) return;
    if (multiPv < 2 || multiPv > 6) {
      throw new Error(`Invalid MultiPV value : ${multiPv}`);
    }

    await this.sendCommandsToEachWorker(
      [`setoption name MultiPV value ${multiPv}`, "isready"],
      "readyok"
    );

    this.multiPv = multiPv;
  }

  private throwErrorIfNotReady() {
    if (!this.isReady) {
      throw new Error("Engine is not ready");
    }
  }

  public shutdown(): void {
    this.isReady = false;
    this.workerQueue = [];
    this.evalCache.clear();

    for (const worker of this.workers) {
      this.terminateWorker(worker);
    }
    this.workers = [];
  }

  private terminateWorker(worker: EngineWorker) {
    worker.isReady = false;
    worker.uci("quit");
    worker.terminate();
  }

  public async stopAllCurrentJobs(): Promise<void> {
    const abandonedJobs = [...this.workerQueue];
    this.workerQueue = [];

    for (const worker of this.workers) {
      worker.listen = () => null;
    }

    for (const job of abandonedJobs) {
      job.resolve([]);
    }

    await this.sendCommandsToEachWorker(["stop", "isready"], "readyok");

    for (const worker of this.workers) {
      this.releaseWorker(worker);
    }
  }

  private async sendCommands(
    commands: string[],
    finalMessage: string,
    onNewMessage?: (messages: string[]) => void
  ): Promise<string[]> {
    const worker = this.acquireWorker();

    if (!worker) {
      return new Promise((resolve) => {
        this.workerQueue.push({
          commands,
          finalMessage,
          onNewMessage,
          resolve,
        });
      });
    }

    const res = await sendCommandsToWorker(
      worker,
      commands,
      finalMessage,
      onNewMessage
    );

    this.releaseWorker(worker);
    return res;
  }

  private async sendCommandsToEachWorker(
    commands: string[],
    finalMessage: string,
    onNewMessage?: (messages: string[]) => void
  ): Promise<void> {
    await Promise.all(
      this.workers.map(async (worker) => {
        await sendCommandsToWorker(
          worker,
          commands,
          finalMessage,
          onNewMessage
        );
        this.releaseWorker(worker);
      })
    );
  }

  private addNewWorker = async () => {
    const worker = getEngineWorker(this.enginePath);

    await sendCommandsToWorker(worker, ["uci"], "uciok");
    await sendCommandsToWorker(
      worker,
      [
        `setoption name Hash value ${this.hashSize}`,
        `setoption name MultiPV value ${this.multiPv}`,
        "isready",
      ],
      "readyok"
    );
    await sendCommandsToWorker(worker, ["ucinewgame", "isready"], "readyok");

    this.workers.push(worker);
    this.releaseWorker(worker);
  };

  private async setWorkersNb(workersNb: number) {
    if (workersNb === this.workers.length) return;

    if (workersNb < 1) {
      throw new Error(
        `Number of workers must be greater than 0, got ${workersNb} instead`
      );
    }

    if (workersNb < this.workers.length) {
      const workersToRemove = this.workers.slice(workersNb);
      this.workers = this.workers.slice(0, workersNb);

      for (const worker of workersToRemove) {
        this.terminateWorker(worker);
      }
      return;
    }

    const workersNbToCreate = workersNb - this.workers.length;

    await Promise.all(
      new Array(workersNbToCreate).fill(0).map(() => this.addNewWorker())
    );
  }

  public async evaluateGame({
    fens,
    uciMoves,
    depth = 16,
    multiPv = this.multiPv,
    setEvaluationProgress,
    playersRatings,
    workersNb = 1,
  }: EvaluateGameParams): Promise<GameEval> {
    this.throwErrorIfNotReady();
    this.isReady = false;
    setEvaluationProgress?.(1);

    await this.setMultiPv(multiPv);
    await this.sendCommandsToEachWorker(["ucinewgame", "isready"], "readyok");
    await this.setWorkersNb(workersNb);

    const positions: PositionEval[] = new Array(fens.length);
    let completed = 0;

    const updateEval = (index: number, positionEval: PositionEval) => {
      completed++;
      positions[index] = positionEval;
      const progress = completed / fens.length;
      setEvaluationProgress?.(99 - Math.exp(-4 * progress) * 99);
    };

    const isCheckmate = (fen: string): "w" | "b" | null => {
      const turn = fen.split(" ")[1];
      try {
        const chess = new Chess(fen);
        if (chess.isCheckmate()) return turn === "w" ? "b" : "w";
      } catch {}
      return null;
    };

    const isStalemate = (fen: string): boolean => {
      try {
        const chess = new Chess(fen);
        return chess.isStalemate() || chess.isDraw();
      } catch {
        return false;
      }
    };

    await Promise.all(
      fens.map(async (fen, i) => {
        const whoIsCheckmated = isCheckmate(fen);
        if (whoIsCheckmated) {
          updateEval(i, {
            lines: [
              {
                pv: [],
                depth: 0,
                multiPv: 1,
                // isCheckmate() returns the winner ("w"=white won, "b"=black won).
                // getWinPercentageFromMate: mate>0 → 100% (white wins), mate<0 → 0% (black wins).
                mate: whoIsCheckmated === "w" ? 1 : -1,
              },
            ],
          });
          return;
        }

        const stalemate = isStalemate(fen);
        if (stalemate) {
          updateEval(i, {
            lines: [
              {
                pv: [],
                depth: 0,
                multiPv: 1,
                cp: 0,
              },
            ],
          });
          return;
        }

        const result = await this.evaluatePosition(fen, depth);
        updateEval(i, result);
      })
    );

    await this.setWorkersNb(1);
    this.isReady = true;

    const positionsWithClassification = getMovesClassification(
      positions,
      uciMoves,
      fens
    );
    const accuracy = computeAccuracy(positions);
    const estimatedElo = computeEstimatedElo(
      positions,
      playersRatings?.white,
      playersRatings?.black
    );

    return {
      positions: positionsWithClassification,
      estimatedElo,
      accuracy,
      settings: {
        engine: "stockfish-18",
        date: new Date().toISOString(),
        depth,
        multiPv,
      },
    };
  }

  private async evaluatePosition(
    fen: string,
    depth = 16
  ): Promise<PositionEval> {
    const cacheKey = `${fen}:${depth}:${this.multiPv}`;
    const cached = this.evalCache.get(cacheKey);
    if (cached) return cached;

    const cloudResult = await fetchLichessCloudEval(fen, this.multiPv);
    if (cloudResult) {
      this.evalCache.set(cacheKey, cloudResult);
      return cloudResult;
    }

    const results = await this.sendCommands(
      [`position fen ${fen}`, `go depth ${depth}`],
      "bestmove"
    );
    const result = parseEvaluationResults(results, fen);
    this.evalCache.set(cacheKey, result);
    return result;
  }
}
