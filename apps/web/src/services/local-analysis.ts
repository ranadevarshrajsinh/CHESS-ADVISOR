import { Chess } from "chess.js";
import { EnginePool } from "@/lib/engine/engine-pool";
import { getStockfish18Path } from "@/lib/engine/stockfish-loader";
import { isWasmSupported, getRecommendedWorkersNb } from "@/lib/engine/wasm-detect";
import { engineConfig } from "@/lib/engine-config";
import { getPositionWinPercentage } from "@/lib/engine/helpers/win-percentage";
import { QUALITY_MAP } from "@/types/engine-types";
import { openings } from "@/lib/engine/openings";

export async function analyzeLocally(
  username: string,
  filename: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<any> {
  if (!isWasmSupported()) {
    throw new Error("WebAssembly is not supported in this browser");
  }

  onProgress?.(0, "Fetching game data...");
  const pgn = await fetchPgn(username, filename);
  const game = new Chess();
  game.loadPgn(pgn);
  const headers = game.getHeaders();

  const whitePlayer = headers["White"] || "";
  const blackPlayer = headers["Black"] || "";
  const userColor: "white" | "black" =
    whitePlayer.toLowerCase() === username.toLowerCase() ? "white" : "black";
  const opponentColor = userColor === "white" ? "black" : "white";

  const result = determineResult(headers);
  const ecoCode = headers["ECO"] || null;

  const { fens, uciMoves } = buildGameMoves(game);

  const openingName = detectOpening(fens);

  const enginePath = getStockfish18Path(engineConfig.lite);
  const workers = Math.min(
    engineConfig.maxWorkers,
    getRecommendedWorkersNb()
  );

  const engine = await EnginePool.create(enginePath, {
    multiPv: engineConfig.multiPv,
    hashSize: engineConfig.hashSize,
  });

  onProgress?.(5, "Analyzing positions...");

  const gameEval = await engine.evaluateGame({
    fens,
    uciMoves,
    depth: engineConfig.depth,
    multiPv: engineConfig.multiPv,
    workersNb: workers,
    setEvaluationProgress: (p: number) => onProgress?.(5 + p * 0.9, "Analyzing positions..."),
  });

  engine.shutdown();

  onProgress?.(95, "Building analysis report...");
  const result_ = mapToAnalysisSchema(
    gameEval,
    game,
    pgn,
    whitePlayer,
    blackPlayer,
    userColor,
    opponentColor,
    result,
    openingName,
    ecoCode,
    username,
    uciMoves,
    fens
  );

  onProgress?.(100, "Done!");
  return result_;
}

async function fetchPgn(
  username: string,
  filename: string
): Promise<string> {
  const decoded = decodeURIComponent(filename);

  if (decoded && decoded !== "undefined" && decoded !== "null") {
    const lichessMatch = decoded.match(
      /^(?:https?:\/\/)?(?:www\.)?lichess\.org\/([a-z0-9]{8})/i
    );
    if (lichessMatch) {
      return fetchLichessPgn(lichessMatch[1]);
    }
    if (/^[a-z0-9]{8}$/i.test(decoded)) {
      return fetchLichessPgn(decoded);
    }

    const chessComMatch = decoded.match(
      /(?:chess\.com\/game\/(?:live|daily)\/)?(\d+)/i
    );
    if (chessComMatch) {
      return fetchChessComPgn(username, chessComMatch[1]);
    }
  }

  const pgn = await fetchFallbackPgn(username);
  if (pgn) return pgn;

  throw new Error(
    `Could not find a game to analyze. Filename was: "${filename}". ` +
    "Tried Chess.com and Lichess archives but no games found."
  );
}

async function fetchFallbackPgn(username: string): Promise<string | null> {
  for (const platform of ["chess.com", "lichess"] as const) {
    try {
      const url = platform === "chess.com"
        ? `https://api.chess.com/pub/player/${username}/games/archives`
        : `https://lichess.org/api/games/user/${username}?max=1&pgnInJson=true`;

      const res = await fetch(url, {
        headers: platform === "chess.com"
          ? { "User-Agent": "ChessCoach/1.0" }
          : { Accept: "application/x-ndjson" },
      });
      if (!res.ok) continue;

      if (platform === "chess.com") {
        const { archives } = await res.json();
        if (!archives?.length) continue;
        const archiveRes = await fetch(archives[archives.length - 1], {
          headers: { "User-Agent": "ChessCoach/1.0" },
        });
        if (!archiveRes.ok) continue;
        const { games } = await archiveRes.json();
        if (games?.[0]?.pgn) return games[0].pgn;
      } else {
        const text = await res.text();
        const lines = text.trim().split("\n").filter(Boolean);
        if (lines.length > 0) {
          const game = JSON.parse(lines[0]);
          if (game?.pgn) return game.pgn;
        }
      }
    } catch {}
  }
  return null;
}

async function fetchLichessPgn(gameId: string): Promise<string> {
  const res = await fetch(`https://lichess.org/game/export/${gameId}`, {
    headers: { Accept: "application/x-chess-pgn" },
  });
  if (!res.ok) throw new Error(`Lichess PGN fetch failed: ${res.status}`);
  return res.text();
}

async function fetchChessComPgn(
  username: string,
  gameId: string
): Promise<string> {
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${username}/games/archives`,
    { headers: { "User-Agent": "ChessCoachPlatform/1.0" } }
  );
  if (!archivesRes.ok) throw new Error("Failed to fetch Chess.com archives");

  const { archives } = await archivesRes.json();
  if (!archives?.length) throw new Error("No Chess.com archives found");

  const recentArchives = archives.slice(-3).reverse();
  for (const archiveUrl of recentArchives) {
    const archiveRes = await fetch(archiveUrl, {
      headers: { "User-Agent": "ChessCoachPlatform/1.0" },
    });
    if (!archiveRes.ok) continue;

    const { games } = await archiveRes.json();
    const game = games.find(
      (g: any) =>
        g.url.includes(gameId) || g.uuid === gameId
    );
    if (game?.pgn) return game.pgn;
  }

  throw new Error(`Game ${gameId} not found in recent Chess.com archives`);
}

function buildGameMoves(
  game: Chess
): { fens: string[]; uciMoves: string[] } {
  const history = game.history({ verbose: true });
  const tempGame = new Chess();
  const fens: string[] = [tempGame.fen()];
  const uciMoves: string[] = [];

  for (const move of history) {
    try {
      const result = tempGame.move(move.san);
      if (result) {
        uciMoves.push(result.from + result.to + (result.promotion || ""));
      }
    } catch {
      uciMoves.push("");
    }
    fens.push(tempGame.fen());
  }

  return { fens, uciMoves };
}

function detectOpening(fens: string[]): string {
  for (const fen of fens) {
    const shortFen = fen.split(" ")[0];
    const match = openings.find((o) => o.fen === shortFen);
    if (match) return match.name;
  }
  return "Unknown Opening";
}

function determineResult(headers: Record<string, string>): string {
  const result = headers["Result"];
  if (!result) return "*";
  return result;
}

function mapToAnalysisSchema(
  gameEval: any,
  game: Chess,
  pgn: string,
  whitePlayer: string,
  blackPlayer: string,
  userColor: "white" | "black",
  opponentColor: "white" | "black",
  result: string,
  openingName: string,
  ecoCode: string | null,
  username: string,
  uciMoves: string[],
  fens: string[]
): any {
  const history = game.history({ verbose: true });
  const headers = game.getHeaders();
  const fullHistory = buildFullHistory(history, userColor, username);
  const sanitizedHistory = history.map((m) => ({
    ...m,
    is_user:
      m.color === (userColor === "white" ? "w" : "b"),
  }));
  const opponentUsername =
    userColor === "white" ? blackPlayer : whitePlayer;

  const moveHistory = buildMoveHistory(
    gameEval,
    sanitizedHistory,
    uciMoves,
    fens,
    userColor
  );

  const userAccuracy = computeUserAccuracy(gameEval, userColor);
  const phaseAccuracy = computePhaseAccuracy(
    gameEval,
    sanitizedHistory,
    uciMoves,
    fens,
    userColor
  );

  const openingMoves = history
    .slice(0, 15)
    .filter((m) => Boolean(m && m.san))
    .map((m) => m.san);

  const performanceRating = gameEval.estimatedElo
    ? userColor === "white"
      ? gameEval.estimatedElo.white
      : gameEval.estimatedElo.black
    : undefined;

  return {
    game_accuracy: Math.round(userAccuracy * 10) / 10,
    phase_accuracy: phaseAccuracy,
    white_player: whitePlayer,
    black_player: blackPlayer,
    opening_name: openingName,
    eco_code: ecoCode,
    result,
    performance_rating: performanceRating
      ? Math.round(performanceRating)
      : undefined,
    opening_moves: openingMoves,
    opening_recommendation: null,
    time_analysis: null,
    patterns: null,
    full_history: fullHistory,
    move_history: moveHistory,
  };
}

function buildFullHistory(
  history: any[],
  userColor: "white" | "black",
  username: string
): Array<{ san: string; is_user: boolean }> {
  return history.map((move) => ({
    san: move.san,
    is_user: move.color === (userColor === "white" ? "w" : "b"),
  }));
}

function buildMoveHistory(
  gameEval: any,
  sanitizedHistory: any[],
  uciMoves: string[],
  fens: string[],
  userColor: "white" | "black"
): any[] {
  const moveHistory: any[] = [];
  let userMoveIdx = 0;

  const positions = gameEval.positions;
  const positionsWin = positions.map(getPositionWinPercentage);
  const userSide = userColor === "white" ? "w" : "b";

  for (let i = 0; i < sanitizedHistory.length; i++) {
    const move = sanitizedHistory[i];
    if (move.color !== userSide) continue;

    const posBefore = positions[i];
    const posAfter = positions[i + 1];
    const uciMove = uciMoves[i];

    if (!posAfter) continue;

    const winBefore = positionsWin[i];
    const winAfter = positionsWin[i + 1];
    const winDiffUserRelative =
      userColor === "white"
        ? winBefore - winAfter
        : winAfter - winBefore;

    const beforeCp = posBefore?.lines?.[0]?.cp ?? 0;
    const afterCp = posAfter?.lines?.[0]?.cp ?? 0;
    const userEval = userColor === "white" ? beforeCp : -beforeCp;
    const userEvalAfter = userColor === "white" ? afterCp : -afterCp;

    const bestMoveSan = posAfter.bestMove
      ? uciToSan(fens[i], posAfter.bestMove)
      : undefined;

    const moveNumber = Math.floor(i / 2) + 1;
    const turnLabel =
      userColor === "white" ? "white" : "black";

    const rawQuality = posAfter.moveClassification;
    const quality = rawQuality
      ? QUALITY_MAP[rawQuality] || "Good"
      : "Good";

    const turnNum = Math.floor(i / 2) + 1;

    const cpLoss = Math.max(0, Math.abs(winDiffUserRelative));

    const phase = getPhaseForMove(i, fens);

    const entry: any = {
      move_number: turnNum,
      turn_label: turnLabel,
      san: move.san,
      quality,
      cp_loss: Math.round(cpLoss * 100) / 100,
      phase,
      best_move: bestMoveSan || "",
      error_nature: null,
      eval: Math.round(userEval * 100) / 100,
      eval_after: Math.round(userEvalAfter * 100) / 100,
      eval_before: Math.round(userEval * 100) / 100,
    };

    moveHistory.push(entry);
    userMoveIdx++;
  }

  return moveHistory;
}

function uciToSan(fen: string, uci: string): string {
  try {
    const game = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.slice(4, 5) || undefined;
    const move = game.move({ from, to, promotion } as any);
    return move ? move.san : uci;
  } catch {
    return uci;
  }
}

function computeUserAccuracy(
  gameEval: any,
  userColor: "white" | "black"
): number {
  if (!gameEval.accuracy) return 50;
  return userColor === "white"
    ? gameEval.accuracy.white
    : gameEval.accuracy.black;
}

function computePhaseAccuracy(
  gameEval: any,
  sanitizedHistory: any[],
  uciMoves: string[],
  fens: string[],
  userColor: "white" | "black"
): Record<string, number> {
  const positions = gameEval.positions;
  const positionsWin = positions.map(getPositionWinPercentage);
  const userSide = userColor === "white" ? "w" : "b";

  const phaseMoves: Record<string, number[]> = {
    opening: [],
    middlegame: [],
    endgame: [],
  };

  for (let i = 0; i < sanitizedHistory.length; i++) {
    const move = sanitizedHistory[i];
    if (move.color !== userSide) continue;

    const phase = getPhaseForMove(i, fens);
    const winBefore = positionsWin[i];
    const winAfter = positionsWin[i + 1];

    if (winBefore === undefined || winAfter === undefined) continue;

    const winDiff =
      userColor === "white"
        ? winBefore - winAfter
        : winAfter - winBefore;

    const rawAccuracy =
      103.1668100711649 * Math.exp(-0.04354415386753951 * Math.abs(winDiff)) -
      3.166924740191411;
    const accuracy = Math.min(100, Math.max(0, rawAccuracy + 1));

    phaseMoves[phase]?.push(accuracy);
  }

  const result: Record<string, number> = {};
  for (const [phase, accs] of Object.entries(phaseMoves)) {
    if (accs.length > 0) {
      result[phase] =
        Math.round((accs.reduce((a, b) => a + b, 0) / accs.length) * 10) / 10;
    } else {
      result[phase] = 0;
    }
  }

  return result;
}

function getPhaseForMove(
  moveIndex: number,
  fens: string[]
): string {
  if (moveIndex < 10) return "opening";

  const fen = fens[moveIndex] || fens[fens.length - 1];
  const pieceCount = countNonPawnNonKingPieces(fen);

  if (pieceCount <= 6) return "endgame";
  return "middlegame";
}

function countNonPawnNonKingPieces(fen: string): number {
  const board = fen.split(" ")[0];
  let count = 0;
  for (const char of board) {
    if (/[RNBQrnbq]/.test(char)) count++;
  }
  return count;
}
