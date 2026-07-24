import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchChessComGames, fetchLichessGames } from "@/lib/chess/integrations";
import type { Game } from "@repo/types";

// Both platforms embed an opening tag in the PGN header — chess.com uses
// ECOUrl (a slug we can turn into a readable name), Lichess uses Opening
// directly when available; ECO code is the last-resort fallback either way.
function extractOpeningFromPgn(pgn?: string): string {
  if (!pgn) return "Unknown Opening";
  const ecoUrlMatch = pgn.match(/\[ECOUrl "([^"]+)"\]/);
  if (ecoUrlMatch) {
    return decodeURIComponent(ecoUrlMatch[1].split("/").pop() || "").replace(/-/g, " ");
  }
  const openingMatch = pgn.match(/\[Opening "([^"]+)"\]/);
  if (openingMatch) return openingMatch[1];
  const ecoMatch = pgn.match(/\[ECO "([^"]+)"\]/);
  if (ecoMatch) return ecoMatch[1];
  return "Unknown Opening";
}

async function fetchRecentGames(username: string, limit: number, platform: string): Promise<Game[]> {
  try {
    return platform === "lichess"
      ? await fetchLichessGames(username, limit)
      : await fetchChessComGames(username, limit);
  } catch {
    return [];
  }
}

function buildReportFromJobs(username: string, jobs: any[]) {
  const completed = jobs.filter((j) => j.status === "completed" && j.result);
  if (completed.length === 0) return null;

  let totalAcc = 0;
  const phaseAcc: Record<string, number[]> = { opening: [], middlegame: [], endgame: [] };
  const qualityCounts: Record<string, number> = {};
  const openingMap: Record<string, { wins: number; losses: number; draws: number; accs: number[] }> = {};

  for (const job of completed) {
    const r = job.result;
    if (r.game_accuracy) totalAcc += parseFloat(r.game_accuracy);

    for (const [phase, acc] of Object.entries(r.phase_accuracy ?? {})) {
      phaseAcc[phase]?.push(parseFloat(acc as string));
    }

    for (const move of r.move_history ?? []) {
      if (move.quality) qualityCounts[move.quality] = (qualityCounts[move.quality] || 0) + 1;
    }

    const opening = r.opening_name || "Unknown";
    if (!openingMap[opening]) openingMap[opening] = { wins: 0, losses: 0, draws: 0, accs: [] };
    if (r.game_accuracy) openingMap[opening].accs.push(parseFloat(r.game_accuracy));

    const res = r.result || "*";
    const userIsWhite = r.white_player?.toLowerCase() === username.toLowerCase();
    if (res === "1-0") { userIsWhite ? openingMap[opening].wins++ : openingMap[opening].losses++; }
    else if (res === "0-1") { userIsWhite ? openingMap[opening].losses++ : openingMap[opening].wins++; }
    else if (res !== "*") { openingMap[opening].draws++; }
  }

  const n = completed.length;
  const avgAcc = n > 0 ? totalAcc / n : 0;
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const phaseAvg = { opening: avg(phaseAcc.opening), middlegame: avg(phaseAcc.middlegame), endgame: avg(phaseAcc.endgame) };

  const blunders = qualityCounts["Blunder"] || 0;
  const mistakes = qualityCounts["Mistake"] || 0;
  const inaccuracies = qualityCounts["Inaccuracy"] || 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const [phase, acc] of Object.entries(phaseAvg)) {
    if (acc >= 75) strengths.push(`Strong ${phase} play (${acc.toFixed(1)}% accuracy)`);
    else if (acc > 0 && acc < 60) weaknesses.push(`${phase.charAt(0).toUpperCase() + phase.slice(1)} accuracy needs work (${acc.toFixed(1)}%)`);
  }
  if (blunders / n > 1) weaknesses.push(`High blunder rate (${(blunders / n).toFixed(1)} per game)`);
  if ((qualityCounts["Best"] || 0) > blunders * 3) strengths.push("Finding strong moves consistently");
  if (!strengths.length) strengths.push(`Average accuracy of ${avgAcc.toFixed(1)}% across ${n} analyzed games`);
  if (!weaknesses.length) weaknesses.push("Keep analyzing to find specific improvement areas");

  const openingPerf = Object.entries(openingMap).map(([name, d]) => ({
    opening_name: name,
    wins: d.wins, losses: d.losses, draws: d.draws,
    avg_accuracy: d.accs.length ? (d.accs.reduce((a, b) => a + b, 0) / d.accs.length).toFixed(1) : null,
  }));

  const worstPhase = Object.entries(phaseAvg).filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "endgame";
  const momentum = avgAcc >= 70 ? "Improving" : avgAcc >= 55 ? "Stable" : "Needs Work";

  const accuracyTimeline = [...completed].reverse().map((job, i) => ({
    label:    `G${i + 1}`,
    accuracy: parseFloat(job.result?.game_accuracy || 0),
  }));

  return {
    report: {
      title: `Progress Report — ${username}`,
      period_summary: {
        games_analyzed:       n,
        overall_avg_accuracy: avgAcc.toFixed(1),
        current_momentum:     momentum,
      },
      strengths_weaknesses: { strengths, weaknesses },
      repertoire_snapshot: {
        user_as_white: openingPerf.slice(0, 3).map((o) => o.opening_name),
        user_as_black: [],
      },
      top_action_items: [
        blunders / n > 1 ? "Reduce blunders — pause before each move to check for tactics" : "Maintain tactical accuracy",
        `Study ${worstPhase} — your lowest-accuracy phase`,
        "Review your worst game from this batch for quick improvement",
      ],
    },
    visuals: {
      phase_radar: {
        labels: ["Opening", "Middlegame", "Endgame"],
        data:   [Math.round(phaseAvg.opening), Math.round(phaseAvg.middlegame), Math.round(phaseAvg.endgame)],
      },
      accuracy_over_time: {
        labels: accuracyTimeline.map((p) => p.label),
        data:   accuracyTimeline.map((p) => p.accuracy),
      },
      mistake_distribution: {
        labels: Object.keys(qualityCounts),
        data:   Object.values(qualityCounts),
      },
    },
    move_breakdown: qualityCounts,
    openings: {
      performance:     openingPerf,
      mistakes:        openingPerf.filter((o) => o.losses > o.wins).slice(0, 3),
      recommendations: openingPerf
        .filter((o) => o.losses > o.wins)
        .slice(0, 3)
        .map((o) => ({
          type:    "Study",
          message: `Study the ${o.opening_name} — ${o.losses} losses vs ${o.wins} wins`,
        })),
    },
    mistake_frequency: {
      blunders_per_game:     (blunders / n).toFixed(2),
      mistakes_per_game:     (mistakes / n).toFixed(2),
      inaccuracies_per_game: (inaccuracies / n).toFixed(2),
      errors_per_10_moves:   (((blunders + mistakes) / n) / 3).toFixed(2),
    },
  };
}

function buildBasicReport(username: string, games: Game[]) {
  let wins = 0, losses = 0, draws = 0;
  const openingMap: Record<string, { wins: number; losses: number; draws: number }> = {};
  const whiteOpenings: string[] = [];
  const blackOpenings: string[] = [];

  for (const game of games) {
    const isWhite = (game.white || "").toLowerCase() === username.toLowerCase();
    const opening = extractOpeningFromPgn(game.pgn);

    if (!openingMap[opening]) openingMap[opening] = { wins: 0, losses: 0, draws: 0 };

    let outcome: "win" | "loss" | "draw";
    if (game.result === "1-0") outcome = isWhite ? "win" : "loss";
    else if (game.result === "0-1") outcome = isWhite ? "loss" : "win";
    else outcome = "draw";

    if (outcome === "win") {
      wins++;
      openingMap[opening].wins++;
      if (isWhite && !whiteOpenings.includes(opening)) whiteOpenings.push(opening);
      if (!isWhite && !blackOpenings.includes(opening)) blackOpenings.push(opening);
    } else if (outcome === "loss") {
      losses++;
      openingMap[opening].losses++;
    } else {
      draws++;
      openingMap[opening].draws++;
    }
  }

  const total   = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const momentum = winRate >= 55 ? "Improving" : winRate >= 40 ? "Stable" : "Needs Work";

  const strengths: string[]  = [];
  const weaknesses: string[] = [];
  if (winRate >= 55) strengths.push(`Strong win rate of ${winRate}% across recent games`);
  else weaknesses.push(`Win rate of ${winRate}% — focus on converting advantages`);

  const topOpenings = Object.entries(openingMap)
    .sort((a, b) => b[1].wins + b[1].losses + b[1].draws - (a[1].wins + a[1].losses + a[1].draws))
    .slice(0, 5);

  for (const [name, rec] of topOpenings) {
    const t  = rec.wins + rec.losses + rec.draws;
    const wr = t > 0 ? Math.round((rec.wins / t) * 100) : 0;
    if (wr >= 60 && t >= 2) strengths.push(`Performing well in ${name} (${wr}% win rate)`);
    else if (wr <= 30 && t >= 2) weaknesses.push(`Struggling in ${name} (${wr}% win rate)`);
  }

  if (!strengths.length) strengths.push("Active player with consistent game history");
  if (!weaknesses.length) weaknesses.push("Run batch analysis for detailed improvement insights");

  return {
    report: {
      title: `Progress Report — ${username}`,
      period_summary: {
        games_analyzed:       total,
        overall_avg_accuracy: "N/A (run Batch Analysis for accuracy data)",
        current_momentum:     momentum,
      },
      strengths_weaknesses: { strengths, weaknesses },
      repertoire_snapshot: {
        user_as_white: whiteOpenings.slice(0, 3),
        user_as_black: blackOpenings.slice(0, 3),
      },
      top_action_items: [
        "Run Batch Analysis to get detailed per-game accuracy metrics",
        "Review your opening repertoire for consistency",
        weaknesses[0] || "Analyze your most recent losses to find patterns",
      ],
    },
    visuals: {
      phase_radar:        { labels: ["Opening", "Middlegame", "Endgame"], data: [0, 0, 0] },
      accuracy_over_time: { labels: [], data: [] },
    },
    move_breakdown: {},
  };
}

function classifyGame(g: any): string {
  if (g.time_class) return g.time_class;
  const base = parseInt((g.time_control || "").split("+")[0], 10);
  if (isNaN(base) || base <= 0) return "unknown";
  if (base < 180) return "bullet";
  if (base < 600) return "blitz";
  if (base < 1800) return "rapid";
  return "daily";
}

const PHASES = ["opening", "middlegame", "endgame"] as const;

// Mirrors metrics/time_analysis.py (TimeAnalyzer.analyze_game_time) + the
// batch-level aggregation in worker_core/batch_analyzer.py's _aggregate_results,
// but computed directly from individual_games[].move_history so it can be
// recomputed for any subset (e.g. a single time-class) instead of only the
// full, unfiltered batch.
function computeTimeAnalysisForGames(games: any[]) {
  let gamesWithTimeData = 0;
  let gamesWithTimePressure = 0;
  let totalTimePressureMoves = 0;
  const phaseTimeBuckets: Record<string, number[]> = { opening: [], middlegame: [], endgame: [] };

  for (const g of games) {
    const movesWithTime = (g.move_history || []).filter((m: any) => m.time_spent != null);
    if (movesWithTime.length === 0) continue;
    gamesWithTimeData++;

    const gamePhaseTimes: Record<string, number[]> = { opening: [], middlegame: [], endgame: [] };
    for (const m of movesWithTime) {
      const phase = PHASES.includes(m.phase) ? m.phase : "middlegame";
      gamePhaseTimes[phase].push(m.time_spent);
    }
    for (const phase of PHASES) {
      const times = gamePhaseTimes[phase];
      if (times.length) phaseTimeBuckets[phase].push(times.reduce((a, b) => a + b, 0) / times.length);
    }

    const pressureMoves = movesWithTime.filter((m: any) => m.time_spent < 5).length;
    totalTimePressureMoves += pressureMoves;
    if (pressureMoves >= 3) gamesWithTimePressure++;
  }

  const phase_avg_time: Record<string, number | null> = {};
  for (const phase of PHASES) {
    const times = phaseTimeBuckets[phase];
    phase_avg_time[phase] = times.length
      ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100
      : null;
  }

  return {
    games_with_time_data: gamesWithTimeData,
    games_with_time_pressure: gamesWithTimePressure,
    time_pressure_pct:
      gamesWithTimeData > 0 ? Math.round((gamesWithTimePressure / gamesWithTimeData) * 1000) / 10 : 0,
    avg_time_pressure_moves_per_game:
      gamesWithTimeData > 0 ? Math.round((totalTimePressureMoves / gamesWithTimeData) * 10) / 10 : 0,
    phase_avg_time,
  };
}

// Mirrors mistakes/mistake_frequency.py (MistakeFrequency.analyze_frequency +
// aggregate_batch_frequency), computed from individual_games[].move_history
// so it reflects only the filtered subset instead of the whole batch.
function computeMistakeStatsForGames(games: any[]) {
  const counts = { blunders: 0, mistakes: 0, inaccuracies: 0 };
  const by_phase: Record<string, number> = { opening: 0, middlegame: 0, endgame: 0 };
  const by_nature: Record<string, number> = {};
  let totalMoves = 0;

  for (const g of games) {
    for (const m of (g.move_history || [])) {
      totalMoves++;
      const quality = m.quality;
      const phase = PHASES.includes(m.phase) ? m.phase : "middlegame";
      if (quality === "Blunder") counts.blunders++;
      else if (quality === "Mistake") counts.mistakes++;
      else if (quality === "Inaccuracy") counts.inaccuracies++;

      if (quality === "Blunder" || quality === "Mistake" || quality === "Inaccuracy") {
        by_phase[phase]++;
        if (m.error_nature && m.error_nature !== "None") {
          by_nature[m.error_nature] = (by_nature[m.error_nature] || 0) + 1;
        }
      }
    }
  }

  const total_errors = counts.blunders + counts.mistakes + counts.inaccuracies;
  return {
    counts,
    total_errors,
    by_phase,
    by_nature,
    error_rate: totalMoves > 0 ? Math.round((total_errors / totalMoves) * 1000) / 10 : 0,
    games_analyzed: games.length,
    errors_per_game: games.length > 0 ? Math.round((total_errors / games.length) * 100) / 100 : 0,
  };
}

function filterBatchByTc(br: any, tc: string): any {
  const all: any[] = br.individual_games || [];
  const hasTimeClassData = all.some((g) => g.time_class);
  const filtered = all.filter((g) => classifyGame(g) === tc);
  if (filtered.length === 0) {
    return { _tc_no_data: true, _tc_reason: hasTimeClassData ? "no_games" : "needs_rerun" };
  }

  const n      = filtered.length;
  const avgAcc = n > 0 ? filtered.reduce((s, g) => s + parseFloat(g.accuracy ?? 0), 0) / n : 0;

  const qd: Record<string, number> = {};
  const phaseAcc: Record<string, { sum: number; count: number }> = {
    opening: { sum: 0, count: 0 }, middlegame: { sum: 0, count: 0 }, endgame: { sum: 0, count: 0 },
  };
  for (const g of filtered) {
    for (const m of (g.move_history || [])) {
      if (m.quality) qd[m.quality] = (qd[m.quality] || 0) + 1;
      if (m.phase && m.phase in phaseAcc) {
        phaseAcc[m.phase].sum += m.accuracy ?? 0;
        phaseAcc[m.phase].count++;
      }
    }
  }
  const phasePerf: Record<string, number> = {};
  for (const [phase, { sum, count }] of Object.entries(phaseAcc)) {
    phasePerf[phase] = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }

  const openingAcc: Record<string, { games: number; wins: number; losses: number; draws: number; accSum: number }> = {};
  for (const g of filtered) {
    const name: string = g.opening || "Unknown";
    if (!openingAcc[name]) openingAcc[name] = { games: 0, wins: 0, losses: 0, draws: 0, accSum: 0 };
    openingAcc[name].games++;
    if (g.user_result === "win") openingAcc[name].wins++;
    else if (g.user_result === "loss") openingAcc[name].losses++;
    else openingAcc[name].draws++;
    openingAcc[name].accSum += parseFloat(g.accuracy ?? 0);
  }
  const byOpening = Object.entries(openingAcc)
    .map(([opening, s]) => ({
      opening,
      games_played: s.games,
      wins: s.wins, losses: s.losses, draws: s.draws,
      win_rate:     s.games > 0 ? Math.round((s.wins / s.games) * 1000) / 10 : 0,
      avg_accuracy: s.games > 0 ? Math.round((s.accSum / s.games) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.games_played - a.games_played)
    .slice(0, 10);

  return {
    ...br,
    total_analyzed:           n,
    average_accuracy:         Math.round(avgAcc * 100) / 100,
    move_quality_distribution: qd,
    phase_performance:        phasePerf,
    individual_games:         filtered,
    openings: { ...br.openings, performance: { by_opening: byOpening } },
    // These previously leaked the full, unfiltered batch's numbers when a tc
    // filter was applied — recompute from just the filtered games instead.
    time_analysis:  computeTimeAnalysisForGames(filtered),
    mistake_stats:  computeMistakeStatsForGames(filtered),
  };
}

function buildReportFromBatch(username: string, br: any) {
  const n      = br.total_analyzed || 0;
  const avgAcc: number = br.average_accuracy || 0;
  const qd: Record<string, number> = br.move_quality_distribution || {};
  const phasePerf: Record<string, number> = br.phase_performance || {};

  const strengths: string[]  = [];
  const weaknesses: string[] = [];
  for (const [phase, acc] of Object.entries(phasePerf)) {
    const v = acc as number;
    if (v >= 75) strengths.push(`Strong ${phase} play (${v.toFixed(1)}% accuracy)`);
    else if (v > 0 && v < 60) weaknesses.push(`${phase.charAt(0).toUpperCase() + phase.slice(1)} accuracy needs work (${v.toFixed(1)}%)`);
  }
  const blunders    = qd.Blunder || 0;
  const mistakes    = qd.Mistake || 0;
  const inaccuracies = qd.Inaccuracy || 0;
  if (n > 0 && blunders / n > 1) weaknesses.push(`High blunder rate (${(blunders / n).toFixed(1)} per game)`);
  if ((qd.Best || 0) > blunders * 3) strengths.push("Finding strong moves consistently");
  if (!strengths.length) strengths.push(`Average accuracy of ${avgAcc.toFixed(1)}% across ${n} analyzed games`);
  if (!weaknesses.length) weaknesses.push("Keep analyzing to find specific improvement areas");

  const momentum  = avgAcc >= 70 ? "Improving" : avgAcc >= 55 ? "Stable" : "Needs Work";
  const worstPhase = Object.entries(phasePerf)
    .filter(([, v]) => (v as number) > 0)
    .sort((a, b) => (a[1] as number) - (b[1] as number))[0]?.[0] ?? "endgame";

  const games: any[] = br.individual_games || [];
  const chronological = [...games].reverse();
  const accuracyTimeline = chronological.map((g: any, i: number) => {
    let date: string | undefined;
    const raw = String(g.date || "");
    if (raw && !raw.includes("?")) {
      const parts = raw.split(".");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (!isNaN(d.getTime())) {
          date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
      }
    }
    return {
      label:    `G${i + 1}`,
      accuracy: Math.round(parseFloat(g.accuracy ?? 0) * 10) / 10,
      opening:  g.opening || undefined,
      date,
    };
  });

  const rep = br.openings?.repertoire || {};
  const extractNames = (arr: any[]) =>
    (arr || []).slice(0, 3).map((o: any) =>
      typeof o === "string" ? o : (o.name || o.opening_name || o.opening || "?")
    );
  const whiteOpenings = extractNames(rep.white_openings || rep.as_white || []);
  const blackOpenings = extractNames(rep.black_openings || rep.as_black || []);

  const bta = br.time_analysis;
  const mappedTimeAnalysis = bta && bta.games_with_time_data > 0
    ? {
        average_time_per_move: bta.phase_avg_time
          ? Object.values(bta.phase_avg_time as Record<string, number>)
              .filter((v) => v != null)
              .reduce((sum, v, _, arr) => sum + v / arr.length, 0)
          : null,
        phase_time_breakdown:            bta.phase_avg_time ?? null,
        time_pressure_risk:              (bta.time_pressure_pct ?? 0) > 40,
        think_move_count:                null,
        games_with_time_data:            bta.games_with_time_data,
        games_with_time_pressure:        bta.games_with_time_pressure,
        time_pressure_pct:               bta.time_pressure_pct,
        avg_time_pressure_moves_per_game: bta.avg_time_pressure_moves_per_game,
      }
    : null;

  const totalMoves = Object.values(qd).reduce((s, v) => s + v, 0);

  return {
    report: {
      title: `Progress Report — ${username}`,
      period_summary: {
        games_analyzed:       n,
        overall_avg_accuracy: avgAcc.toFixed(1),
        current_momentum:     momentum,
      },
      strengths_weaknesses: { strengths, weaknesses },
      repertoire_snapshot: { user_as_white: whiteOpenings, user_as_black: blackOpenings },
      top_action_items: [
        n > 0 && blunders / n > 1
          ? "Reduce blunders — pause before each move to check for tactics"
          : "Maintain tactical accuracy",
        `Study ${worstPhase} — your lowest-accuracy phase`,
        "Review your worst blunders from this batch for quick improvement",
      ],
    },
    visuals: {
      phase_radar: {
        labels: ["Opening", "Middlegame", "Endgame"],
        data:   [
          Math.round(phasePerf.opening || 0),
          Math.round(phasePerf.middlegame || 0),
          Math.round(phasePerf.endgame || 0),
        ],
      },
      accuracy_over_time: {
        labels:   accuracyTimeline.map((p) => p.label),
        data:     accuracyTimeline.map((p) => p.accuracy),
        openings: accuracyTimeline.map((p) => p.opening),
        dates:    accuracyTimeline.map((p) => p.date),
      },
      mistake_distribution: {
        labels: Object.keys(qd),
        data:   Object.values(qd),
      },
    },
    move_breakdown: qd,
    openings: br.openings
      ? (() => {
          const wldMap: Record<string, { wins: number; losses: number; draws: number }> = {};
          for (const g of (br.individual_games || [])) {
            const name: string = g.opening || "Unknown";
            if (!wldMap[name]) wldMap[name] = { wins: 0, losses: 0, draws: 0 };
            if (g.user_result === "win")       wldMap[name].wins++;
            else if (g.user_result === "loss") wldMap[name].losses++;
            else                               wldMap[name].draws++;
          }
          const mistakeMap: Record<string, number> = {};
          for (const o of (br.openings.mistakes?.worst_openings || [])) {
            mistakeMap[o.opening] = o.error_rate;
          }
          const perfRows = (br.openings.performance?.by_opening ?? []).map((o: any) => ({
            ...o,
            wins:         wldMap[o.opening]?.wins   ?? o.wins   ?? 0,
            losses:       wldMap[o.opening]?.losses ?? o.losses ?? 0,
            draws:        wldMap[o.opening]?.draws  ?? o.draws  ?? 0,
            mistake_rate: mistakeMap[o.opening]     ?? o.mistake_rate ?? null,
          }));
          return {
            performance:     perfRows,
            mistakes:        br.openings.mistakes,
            recommendations: br.openings.recommendations,
            repertoire:      br.openings.repertoire,
          };
        })()
      : undefined,
    patterns:         br.patterns,
    time_analysis:    mappedTimeAnalysis,
    mistake_frequency: n > 0
      ? {
          blunders_per_game:     (blunders / n).toFixed(2),
          mistakes_per_game:     (mistakes / n).toFixed(2),
          inaccuracies_per_game: (inaccuracies / n).toFixed(2),
          errors_per_10_moves:   totalMoves > 0
            ? (((blunders + mistakes) / totalMoves) * 10).toFixed(2)
            : "0.00",
        }
      : null,
  };
}

function applyIndividualAccuracies(
  br: any,
  byFilename: Map<string, number>,
  byGameKey:  Map<string, number>,
): any {
  if (byFilename.size === 0 && byGameKey.size === 0) return br;

  const games: any[] = br.individual_games || [];
  let anyPatched = false;
  const updatedGames = games.map((g: any) => {
    if (g.filename) {
      const acc = byFilename.get(g.filename);
      if (acc != null) { anyPatched = true; return { ...g, accuracy: acc }; }
    }
    const gameKey = [g.white, g.black, g.result]
      .map((v: any) => (v ?? "").toLowerCase())
      .join("|");
    if (gameKey.replace(/\|/g, "")) {
      const acc = byGameKey.get(gameKey);
      if (acc != null) { anyPatched = true; return { ...g, accuracy: acc }; }
    }
    return g;
  });

  if (!anyPatched) return br;

  const accs = updatedGames
    .map((g: any) => parseFloat(g.accuracy ?? 0))
    .filter((a: number) => a > 0);
  const newAvg =
    accs.length > 0
      ? accs.reduce((s: number, a: number) => s + a, 0) / accs.length
      : br.average_accuracy;

  let patchedOpenings = br.openings;
  if (br.openings?.performance) {
    const openingAcc: Record<string, {
      games: number; wins: number; losses: number; draws: number; accSum: number;
    }> = {};
    for (const g of updatedGames) {
      const name: string = g.opening || "Unknown";
      if (!openingAcc[name]) openingAcc[name] = { games: 0, wins: 0, losses: 0, draws: 0, accSum: 0 };
      openingAcc[name].games++;
      if (g.user_result === "win")       openingAcc[name].wins++;
      else if (g.user_result === "loss") openingAcc[name].losses++;
      else                               openingAcc[name].draws++;
      openingAcc[name].accSum += parseFloat(g.accuracy ?? 0);
    }
    const byOpening = Object.entries(openingAcc)
      .map(([opening, s]) => ({
        opening,
        games_played: s.games,
        wins:         s.wins,
        losses:       s.losses,
        draws:        s.draws,
        win_rate:     s.games > 0 ? Math.round((s.wins / s.games) * 1000) / 10 : 0,
        avg_accuracy: s.games > 0 ? Math.round((s.accSum / s.games) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.games_played - a.games_played)
      .slice(0, 10);
    patchedOpenings = {
      ...br.openings,
      performance: { ...br.openings.performance, by_opening: byOpening },
    };
  }

  return {
    ...br,
    individual_games: updatedGames,
    average_accuracy: Math.round(newAvg * 100) / 100,
    openings:         patchedOpenings,
  };
}

// Common shape both analysis_jobs rows and batch individual_games[] entries
// get normalized into, so game-level stats (time-per-move, game endings,
// openings by color, mistakes by phase) can be derived identically regardless
// of which table the games actually came from.
interface NormalizedGame {
  user_result?: string;
  result?: string;       // legacy "1-0"/"0-1"/"1/2-1/2" fallback
  is_white?: boolean;    // for the legacy win/loss fallback
  opening?: string;
  user_color?: "white" | "black";
  move_history: any[];
  termination?: string;  // lowercased Termination header, when known
  is_checkmate?: boolean; // inferred fallback when termination is unknown
}

function normalizeAnalysisJob(job: any, username: string): NormalizedGame {
  const r = job.result ?? {};
  return {
    user_result: r.user_result,
    result: r.result,
    is_white: (r.white_player ?? "").toLowerCase() === username.toLowerCase(),
    opening: r.opening_name,
    user_color: r.user_color,
    move_history: r.move_history ?? [],
    termination: r.metadata?.Termination ? String(r.metadata.Termination).toLowerCase() : undefined,
  };
}

// batch_jobs individual_games[] entries don't carry the PGN Termination header
// (batch_analyzer.py's per-game summary omits it) — infer checkmate from the
// final move's SAN ("#" suffix) instead of losing termination detail entirely.
function normalizeBatchGame(g: any, username: string): NormalizedGame {
  const lastMove = g.full_history?.[g.full_history.length - 1];
  return {
    user_result: g.user_result,
    result: g.result,
    is_white: (g.white ?? "").toLowerCase() === username.toLowerCase(),
    opening: g.opening,
    user_color: g.user_color,
    move_history: g.move_history ?? [],
    is_checkmate: typeof lastMove?.san === "string" && lastMove.san.endsWith("#"),
  };
}

function deriveGameLevelStats(games: NormalizedGame[]) {
  const moveTimeBuckets: Record<number, number[]> = {};
  const mistakes_by_phase: Record<string, { blunders: number; mistakes: number; inaccuracies: number }> = {
    opening:    { blunders: 0, mistakes: 0, inaccuracies: 0 },
    middlegame: { blunders: 0, mistakes: 0, inaccuracies: 0 },
    endgame:    { blunders: 0, mistakes: 0, inaccuracies: 0 },
  };
  for (const g of games) {
    for (const m of g.move_history) {
      if (m.time_spent != null && m.move_number != null && m.move_number <= 50) {
        if (!moveTimeBuckets[m.move_number]) moveTimeBuckets[m.move_number] = [];
        moveTimeBuckets[m.move_number].push(Number(m.time_spent));
      }

      if (m.phase && m.phase in mistakes_by_phase) {
        if (m.quality === "Blunder") mistakes_by_phase[m.phase].blunders++;
        else if (m.quality === "Mistake") mistakes_by_phase[m.phase].mistakes++;
        else if (m.quality === "Inaccuracy") mistakes_by_phase[m.phase].inaccuracies++;
      }
    }
  }
  const time_per_move = Object.entries(moveTimeBuckets)
    .map(([moveNum, times]) => ({
      move: Number(moveNum),
      avg_time: parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)),
    }))
    .sort((a, b) => a.move - b.move);

  const game_endings = {
    wins:   { total: 0, timeout: 0, resignation: 0, checkmate: 0, aborted: 0, other: 0 },
    losses: { total: 0, timeout: 0, resignation: 0, checkmate: 0, aborted: 0, other: 0 },
  };
  for (const g of games) {
    let userResult = g.user_result;
    if (userResult !== "win" && userResult !== "loss") {
      // Legacy rows (pre user_result) only have the raw "1-0"/"0-1" result
      // plus player names — derive the outcome instead of dropping the game.
      if (g.result !== "1-0" && g.result !== "0-1") continue; // draw, unknown, or no data at all
      userResult = (g.result === "1-0") === g.is_white ? "win" : "loss";
    }

    let termType: "timeout" | "resignation" | "checkmate" | "aborted" | "other" = "other";
    if (g.termination) {
      if (g.termination.includes("abandon")) termType = "aborted";
      else if (g.termination.includes("resign")) termType = "resignation";
      else if (g.termination.includes("time") || g.termination.includes("forfeit")) termType = "timeout";
      else if (g.termination.includes("checkmate") || g.termination.includes("checkmated")) termType = "checkmate";
    } else if (g.is_checkmate) {
      termType = "checkmate";
    }
    const bucket = userResult === "win" ? game_endings.wins : game_endings.losses;
    bucket.total++;
    bucket[termType]++;
  }

  const colorMap: Record<"white" | "black", Record<string, { wins: number; losses: number; draws: number; games: number }>> = {
    white: {}, black: {},
  };
  for (const g of games) {
    const color = g.user_color;
    const name = g.opening;
    if (!color || !name || (color !== "white" && color !== "black")) continue;
    if (!colorMap[color][name]) colorMap[color][name] = { wins: 0, losses: 0, draws: 0, games: 0 };
    colorMap[color][name].games++;
    if (g.user_result === "win") colorMap[color][name].wins++;
    else if (g.user_result === "loss") colorMap[color][name].losses++;
    else colorMap[color][name].draws++;
  }
  const toArr = (m: Record<string, { wins: number; losses: number; draws: number; games: number }>) =>
    Object.entries(m)
      .map(([opening, s]) => ({
        opening, games: s.games, wins: s.wins, losses: s.losses, draws: s.draws,
        win_rate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 8);
  const openings_by_color = { as_white: toArr(colorMap.white), as_black: toArr(colorMap.black) };

  return { time_per_move, game_endings, openings_by_color, mistakes_by_phase };
}

// Fallback used only when there's no batch data at all — derives the same
// stats from analysis_jobs, tc-filtered via the PGN's TimeControl header
// since analysis_jobs has no time_class column.
function computeNewMetrics(indJobs: any[], username: string, tc?: string) {
  let completed = indJobs.filter((j) => j.result);
  if (tc) {
    completed = completed.filter(
      (j) => classifyGame({ time_control: (j.result as any)?.metadata?.TimeControl }) === tc
    );
  }
  return deriveGameLevelStats(completed.map((j) => normalizeAnalysisJob(j, username)));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const platform = searchParams.get("platform") || "chess.com";

  try {
    const tc = searchParams.get("tc");

    const indJobs = await prisma.analysis_jobs.findMany({
      where:   { username, status: "completed" },
      orderBy: { created_at: "desc" },
      take:    limit,
    });

    const byFilename = new Map<string, number>();
    const byGameKey  = new Map<string, number>();
    for (const j of indJobs) {
      const r   = j.result as any;
      const acc = r?.game_accuracy;
      if (acc == null) continue;
      const parsed = parseFloat(acc);
      if (j.filename) byFilename.set(j.filename, parsed);
      const key = [r?.white_player, r?.black_player, r?.result]
        .map((v: any) => (v ?? "").toLowerCase())
        .join("|");
      if (key.replace(/\|/g, "")) byGameKey.set(key, parsed);
    }

    // Game-level stats (game endings, openings by color, mistakes by phase,
    // time per move) must be derived from whichever dataset is actually
    // backing this report — a batch's own individual_games when one is in
    // play, never a blanket analysis_jobs computation, or they silently show
    // stale numbers from an unrelated, differently-scoped set of games.
    const gameLevelStatsFromBatch = (batchResult: any) =>
      deriveGameLevelStats(
        (batchResult.individual_games || []).map((g: any) => normalizeBatchGame(g, username))
      );

    if (tc && tc !== "all") {
      const tcJob = await prisma.batch_jobs.findFirst({
        where:   { username, status: "completed", time_class: tc },
        select:  { result: true, created_at: true },
        orderBy: { created_at: "desc" },
      });

      if (tcJob?.result) {
        const merged = applyIndividualAccuracies(tcJob.result, byFilename, byGameKey);
        return NextResponse.json({ ...buildReportFromBatch(username, merged), ...gameLevelStatsFromBatch(merged) });
      }
    }

    const batchJob = await prisma.batch_jobs.findFirst({
      where:   { username, status: "completed", time_class: null },
      select:  { result: true, created_at: true },
      orderBy: { created_at: "desc" },
    });

    if (batchJob?.result) {
      const merged = applyIndividualAccuracies(batchJob.result, byFilename, byGameKey);
      if (tc && tc !== "all") {
        const filterResult = filterBatchByTc(merged, tc);
        if (filterResult._tc_no_data) {
          return NextResponse.json({ tc_no_data: true, tc, tc_reason: filterResult._tc_reason });
        }
        return NextResponse.json({ ...buildReportFromBatch(username, filterResult), ...gameLevelStatsFromBatch(filterResult) });
      }
      return NextResponse.json({ ...buildReportFromBatch(username, merged), ...gameLevelStatsFromBatch(merged) });
    }

    if (indJobs.length > 0) {
      const report = buildReportFromJobs(username, indJobs);
      if (report) {
        const newMetrics = computeNewMetrics(indJobs, username, tc && tc !== "all" ? tc : undefined);
        return NextResponse.json({ ...report, ...newMetrics });
      }
    }

    const games = await fetchRecentGames(username, 20, platform);
    if (games.length > 0) {
      return NextResponse.json(buildBasicReport(username, games));
    }

    return NextResponse.json({ error: "No data found" }, { status: 404 });
  } catch (err) {
    console.error("Report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
