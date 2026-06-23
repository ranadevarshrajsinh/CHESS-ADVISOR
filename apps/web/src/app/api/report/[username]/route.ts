import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Fetch completed analysis jobs for this user
    const { data: jobs, error } = await supabaseAdmin
      .from("analysis_jobs")
      .select("*")
      .eq("username", username.toLowerCase())
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching report data:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        {
          username,
          report: {
            title: "No completed analysis found",
            period_summary: null,
            strengths_weaknesses: null,
            repertoire_snapshot: null,
            top_action_items: [],
          },
          visuals: {},
          openings: null,
          patterns: null,
          time_analysis: null,
          mistake_frequency: null,
          benchmarks: null,
          move_breakdown: {},
        },
        { status: 200 }
      );
    }

    // Extract the result JSON from each job
    const results = jobs
      .filter((j) => j.result != null)
      .map((j) => j.result);

    if (results.length === 0) {
      return NextResponse.json(
        {
          username,
          report: {
            title: "Analysis results pending",
            period_summary: null,
            strengths_weaknesses: null,
          },
        },
        { status: 200 }
      );
    }

    // Merge multiple job results into a single report.
    // If there's a batch result (from batch_analyzer), use it directly.
    // Otherwise, compile individual game results.
    const batchResult = results.find(
      (r: any) => r.total_analyzed != null || r.average_accuracy != null
    );

    if (batchResult) {
      // This is already an aggregated batch report
      return NextResponse.json({
        username,
        report: {
          title: "Coach's Summary",
          period_summary: {
            games_analyzed: batchResult.total_analyzed || results.length,
            overall_avg_accuracy: batchResult.average_accuracy || 0,
            current_momentum:
              (batchResult.trends?.accuracy_trend || 0) > 0
                ? "Improving"
                : "Developing",
          },
          strengths_weaknesses: extractStrengthsWeaknesses(batchResult),
          repertoire_snapshot:
            batchResult.openings?.repertoire || batchResult.repertoire || null,
          top_action_items: extractActionItems(batchResult),
        },
        visuals: {
          phase_radar: buildPhaseRadar(batchResult),
          accuracy_over_time: buildAccuracyTrend(batchResult),
          mistake_distribution: buildMistakeDistribution(batchResult),
        },
        openings: batchResult.openings || null,
        patterns: batchResult.patterns || null,
        time_analysis: results[0]?.time_analysis || null,
        mistake_frequency: batchResult.mistake_stats || null,
        benchmarks: batchResult.benchmarks || null,
        move_breakdown: batchResult.move_breakdown || batchResult.move_quality_distribution || {},
        move_quality_distribution: batchResult.move_quality_distribution || {},
      });
    }

    // Individual game results — compile a basic aggregate
    const totalAccuracy =
      results.reduce(
        (sum: number, r: any) => sum + (r.game_accuracy || 0),
        0
      ) / results.length;

    return NextResponse.json({
      username,
      report: {
        title: "Coach's Summary",
        period_summary: {
          games_analyzed: results.length,
          overall_avg_accuracy: Math.round(totalAccuracy * 100) / 100,
          current_momentum: "Analyzing",
        },
        strengths_weaknesses: null,
        repertoire_snapshot: null,
        top_action_items: [],
      },
      visuals: {},
      openings: null,
      patterns: null,
      time_analysis: null,
      mistake_frequency: null,
      benchmarks: null,
      move_breakdown: {},
    });
  } catch (err) {
    console.error("Report endpoint error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* ── helper utilities ─────────────────────────────────────────── */

function extractStrengthsWeaknesses(batch: any): {
  strengths: string[];
  weaknesses: string[];
} | null {
  const patterns = batch.patterns;
  if (!patterns) return null;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const tactical = patterns.tactical?.tactical_summary;
  const positional = patterns.positional?.positional_summary;
  const endgame = patterns.endgame?.endgame_summary;
  const critical = patterns.critical_weaknesses;

  if (tactical) {
    const tacCount = parseInt(tactical.match(/\d+/)?.[0] || "0");
    if (tacCount <= 1) strengths.push("Solid tactical awareness — few tactical errors.");
    else weaknesses.push(`Tactical errors: ${tactical}`);
  }

  if (endgame) weaknesses.push(endgame);

  if (critical?.length) {
    for (const w of critical.slice(0, 3)) {
      if (typeof w === "string") weaknesses.push(w);
    }
  }

  if (positional) weaknesses.push(positional);

  return { strengths, weaknesses };
}

function extractActionItems(batch: any): string[] {
  const items: string[] = [];
  const mistakes = batch.mistake_stats;
  if (mistakes) {
    if (mistakes.blunders_per_game > 2)
      items.push(`Reduce blunders (${mistakes.blunders_per_game}/game) — practice board vision.`);
    if (mistakes.mistakes_per_game > 3)
      items.push(`Work on reducing positional mistakes (${mistakes.mistakes_per_game}/game).`);
  }

  const trends = batch.trends;
  if (trends?.accuracy_trend != null && trends.accuracy_trend < -1) {
    items.push("Your accuracy is declining — consider taking a short break or reviewing fundamentals.");
  }

  const recommendations = batch.openings?.recommendations;
  if (recommendations?.length) {
    for (const rec of recommendations.slice(0, 2)) {
      if (rec.message) items.push(rec.message);
    }
  }

  if (items.length === 0) {
    items.push("Great work! Continue analysing your games regularly to track progress.");
  }

  return items;
}

function buildPhaseRadar(batch: any): { labels: string[]; data: number[] } | null {
  const phasePerf = batch.phase_performance;
  if (!phasePerf) return null;

  const labels = Object.keys(phasePerf);
  const data = labels.map((l) =>
    typeof phasePerf[l] === "number" ? phasePerf[l] : phasePerf[l]?.avg_accuracy || 0
  );

  return { labels, data };
}

function buildAccuracyTrend(batch: any): { labels: string[]; data: number[] } | null {
  const trends = batch.trends;
  if (!trends) return null;

  // If individual games have dates, build a time series; otherwise a simple trend
  const games = batch.individual_games;
  if (!games?.length) return null;

  const labels: string[] = [];
  const data: number[] = [];

  for (const g of games.slice(0, 20)) {
    const date = g.date || g.filename || `Game ${labels.length + 1}`;
    const acc = g.accuracy;
    if (acc != null) {
      labels.push(date);
      data.push(acc);
    }
  }

  if (labels.length === 0) return null;
  return { labels, data };
}

function buildMistakeDistribution(batch: any): {
  labels: string[];
  data: number[];
} | null {
  const dist = batch.move_quality_distribution;
  if (!dist) return null;

  const qualityOrder = ["Blunder", "Mistake", "Inaccuracy", "Good", "Excellent", "Best", "Brilliant"];
  const labels: string[] = [];
  const data: number[] = [];

  for (const q of qualityOrder) {
    if (dist[q] != null && dist[q] > 0) {
      labels.push(q);
      data.push(dist[q]);
    }
  }

  if (labels.length === 0) return null;
  return { labels, data };
}
