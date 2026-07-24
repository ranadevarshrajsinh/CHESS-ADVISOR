import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ERROR_NATURE_MAP: Record<string, string> = {
  fork:        "fork",
  pin:         "pin",
  skewer:      "skewer",
  "back_rank": "back_rank",
  discovered:  "discovered_attack",
  promotion:   "promotion",
  checkmate:   "checkmate",
  "smothered": "smothered_mate",
  sacrifice:   "sacrifice",
  hanging:     "hanging_piece",
  blunder:     "hanging_piece",
  capture:     "hanging_piece",
};

function deriveTheme(move: any): string {
  const nature = (move.error_nature ?? "").toLowerCase();
  for (const [key, theme] of Object.entries(ERROR_NATURE_MAP)) {
    if (nature.includes(key)) return theme;
  }
  const san = (move.san ?? "").toLowerCase();
  if (san.includes("x")) return "hanging_piece";
  if (san.includes("+") || san.includes("#")) return "checkmate";
  const cpLoss = move.cp_loss ?? 0;
  if (cpLoss > 400) return "hanging_piece";
  return "middlegame_tactic";
}

function ratePuzzle(cpLoss: number): number {
  if (cpLoss >= 500) return 800;
  if (cpLoss >= 300) return 1000;
  if (cpLoss >= 200) return 1200;
  if (cpLoss >= 150) return 1400;
  return 1600;
}

function extractMoves(
  gameResult: any,
  filename: string,
  rows: any[],
  username: string,
  seen: Set<string>,
) {
  const moves: any[] = gameResult?.move_history ?? [];
  moves.forEach((m, idx) => {
    // Single-game analysis (analysis_jobs) and batch analysis
    // (batch_jobs.individual_games) use different field names for the
    // position a move was played from — support both.
    const fen = m.fen ?? m.fen_before;
    if (!fen || !m.best_move) return;

    const quality    = m.quality ?? "";
    const cpLoss     = m.cp_loss ?? 0;
    const evalBefore = m.eval_before ?? 0;

    const isBlunder = quality === "Blunder";
    const isMistake = quality === "Mistake" && cpLoss > 150;
    if (!isBlunder && !isMistake) return;

    if (Math.abs(evalBefore) > 500) return;

    if (seen.has(fen)) return;
    seen.add(fen);

    const puzzleId = `${filename.replace(/\.pgn$/, "")}_mv${idx}`;

    rows.push({
      puzzle_id:     puzzleId,
      username,
      fen,
      best_move:     m.best_move,
      theme:         deriveTheme(m),
      difficulty:    isBlunder ? 3 : 2,
      source:        "own_game",
      game_filename: filename,
      move_number:   m.move_num ?? m.move_number ?? idx,
      phase:         m.phase ?? "middlegame",
      puzzle_rating: ratePuzzle(cpLoss),
    });
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  const [analysisJobs, batchJobs] = await Promise.all([
    prisma.analysis_jobs.findMany({
      where:   { username, status: "completed" },
      select:  { filename: true, result: true },
      orderBy: { created_at: "desc" },
      take:    30,
    }),
    prisma.batch_jobs.findMany({
      where:   { username, status: "completed" },
      select:  { id: true, result: true },
      orderBy: { created_at: "desc" },
      take:    10,
    }),
  ]);

  if (!analysisJobs.length && !batchJobs.length) return NextResponse.json({ generated: 0 });

  const rows: any[] = [];
  const seen = new Set<string>();

  for (const job of analysisJobs) {
    const result = job.result as any;
    if (!result) continue;

    if (Array.isArray(result.move_history)) {
      extractMoves(result, job.filename, rows, username, seen);
      continue;
    }

    if (Array.isArray(result.individual_games)) {
      for (const game of result.individual_games) {
        extractMoves(game, game.filename ?? job.filename, rows, username, seen);
      }
    }
  }

  for (const job of batchJobs) {
    const result = job.result as any;
    if (!result || !Array.isArray(result.individual_games)) continue;
    result.individual_games.forEach((game: any, idx: number) => {
      const filename = game.filename ?? `${job.id}_g${idx}`;
      extractMoves(game, filename, rows, username, seen);
    });
  }

  if (rows.length === 0) return NextResponse.json({ generated: 0 });

  await prisma.puzzles.deleteMany({ where: { username, source: "own_game" } });
  await prisma.puzzles.createMany({ data: rows, skipDuplicates: true });

  return NextResponse.json({ generated: rows.length });
}
