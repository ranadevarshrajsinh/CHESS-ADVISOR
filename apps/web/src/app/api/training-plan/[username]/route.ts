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
      console.error("Error fetching training plan data:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        {
          overall_strategy: "Not enough data",
          strategy_description:
            "Complete a batch analysis first so we can generate a personalized training plan.",
          study_focus: [],
          opening_adjustments: [],
          recommended_puzzle_themes: [],
          estimated_training_time: "30 min per day",
        },
        { status: 200 }
      );
    }

    // Extract the batch result (aggregated report) if available
    const results = jobs
      .filter((j) => j.result != null)
      .map((j) => j.result);

    // Find a batch/aggregated result first
    const batchResult = results.find(
      (r: any) => r.total_analyzed != null || r.average_accuracy != null
    );

    if (batchResult) {
      const plan = generateTrainingPlan(batchResult);
      return NextResponse.json(plan);
    }

    // No aggregated result — compute what we can from individual games
    const avgAccuracy =
      results.reduce((sum: number, r: any) => sum + (r.game_accuracy || 0), 0) /
      Math.max(results.length, 1);

    return NextResponse.json(
      generateTrainingPlan({
        average_accuracy: avgAccuracy,
        total_analyzed: results.length,
      })
    );
  } catch (err) {
    console.error("Training plan endpoint error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* ── Training plan generator ───────────────────────────────────── */

interface TrainingPlan {
  overall_strategy: string;
  strategy_description: string;
  study_focus: Array<{ topic: string; priority: string; message: string }>;
  opening_adjustments: Array<{ opening: string; priority: string; suggestion: string }>;
  recommended_puzzle_themes: string[];
  estimated_training_time: string;
}

function generateTrainingPlan(batch: any): TrainingPlan {
  const acc = batch.average_accuracy || 0;

  // ── Overall strategy ───────────────────────────────────────────
  let overall_strategy: string;
  let strategy_description: string;

  if (acc < 60) {
    overall_strategy = "Solidify Foundations";
    strategy_description =
      "Your average accuracy indicates frequent tactical oversights. " +
      "Focus on basic pattern recognition, piece safety, and blunder prevention " +
      "before advancing to complex strategy.";
  } else if (acc < 75) {
    overall_strategy = "Sharpen Tactics and Opening Theory";
    strategy_description =
      "You have solid fundamentals but occasional errors in calculation and opening " +
      "knowledge are holding you back. Dedicate time to tactical puzzles and " +
      "review your opening repertoire.";
  } else {
    overall_strategy = "Refine Strategic Execution and Endgame Mastery";
    strategy_description =
      "Your tactical foundation is strong. Focus on positional play, " +
      "strategic planning, and endgame technique to gain an edge over " +
      "similarly rated opponents.";
  }

  // ── Study focus ────────────────────────────────────────────────
  const study_focus: Array<{ topic: string; priority: string; message: string }> = [];

  study_focus.push({
    topic: "Tactical Puzzles",
    priority: acc < 70 ? "High" : "Medium",
    message:
      acc < 70
        ? `Solve 15-20 tactical puzzles daily (focus on forks, pins, and skewers).`
        : `Solve 10-15 mixed tactical puzzles daily to maintain sharpness.`,
  });

  // Phase-specific focus
  const phasePerf = batch.phase_performance || {};
  if (phasePerf) {
    const phases: Record<string, string> = {
      opening: "Opening Preparation",
      middlegame: "Middlegame Strategy",
      endgame: "Endgame Technique",
    };
    for (const [phase, label] of Object.entries(phases)) {
      const perf = phasePerf[phase];
      const val = typeof perf === "number" ? perf : perf?.avg_accuracy || 0;
      if (val > 0 && val < 65) {
        study_focus.push({
          topic: label,
          priority: "High",
          message: `Your ${phase} accuracy is ${Math.round(val)}%. Dedicate extra sessions to ${phase} principles and common patterns.`,
        });
      }
    }
  }

  // Mistake-driven focus
  const mistakes = batch.mistake_stats || {};
  if (mistakes.blunders_per_game > 2) {
    study_focus.push({
      topic: "Blunder Prevention",
      priority: "High",
      message: `You average ${mistakes.blunders_per_game} blunder(s) per game. Practice board vision exercises and always check for checks, captures, and threats before moving.`,
    });
  }

  // ── Opening adjustments ────────────────────────────────────────
  const opening_adjustments: Array<{ opening: string; priority: string; suggestion: string }> = [];
  const recommendations = batch.openings?.recommendations || [];

  if (recommendations.length > 0) {
    for (const rec of recommendations.slice(0, 5)) {
      if (rec.opening || rec.message) {
        opening_adjustments.push({
          opening: rec.opening || "Opening",
          priority: rec.priority || "Medium",
          suggestion: rec.message || "Review your lines in this opening.",
        });
      }
    }
  }

  // Fallback: derive from opening performance if available
  const openingPerf = batch.openings?.performance;
  if (opening_adjustments.length === 0 && openingPerf) {
    const combined = openingPerf.combined || [];
    if (Array.isArray(combined)) {
      for (const entry of combined.slice(0, 5)) {
        const name = entry.name || "Unknown";
        const avgAcc = entry.avg_accuracy || 0;
        const count = entry.count || 0;
        if (avgAcc < 65 && count >= 2) {
          opening_adjustments.push({
            opening: name,
            priority: "High",
            suggestion: `Accuracy in ${name} is ${Math.round(avgAcc)}%. Review key lines and common tactical motifs.`,
          });
        }
      }
    }
  }

  if (opening_adjustments.length === 0) {
    opening_adjustments.push({
      opening: "General Opening Study",
      priority: "Medium",
      suggestion: "Your opening play looks solid. Consider expanding your repertoire with one new line for White and one for Black.",
    });
  }

  // ── Puzzle themes ──────────────────────────────────────────────
  const themeSet = new Set<string>();

  // Derive from error natures in patterns
  const patterns = batch.patterns;
  if (patterns?.critical_weaknesses) {
    const natureToTheme: Record<string, string> = {
      "Hanging Piece": "Piece Safety",
      "Missed Fork": "Forks",
      "Missed Pin": "Pins",
      "Missed Skewer": "Skewers",
      "Missed Discovered Attack": "Discovered Attacks",
      "Missed Back Rank Mate": "Back Rank Mate",
      "Promotion Error": "Endgame Fundamentals",
      "Endgame Technique": "Endgame Fundamentals",
      "Tactical Oversight": "Mixed Tactics",
      "Time Pressure": "Mixed Tactics",
    };
    for (const w of patterns.critical_weaknesses) {
      for (const [nature, theme] of Object.entries(natureToTheme)) {
        if (w.toLowerCase().includes(nature.toLowerCase())) {
          themeSet.add(theme);
        }
      }
    }
  }

  // Accuracy-based defaults
  if (acc < 60) {
    themeSet.add("Piece Safety");
    themeSet.add("Mixed Tactics");
  } else if (acc < 75) {
    themeSet.add("Tactical Combinations");
  } else {
    themeSet.add("Endgame Fundamentals");
  }

  // Pull from individual game error natures
  const games = batch.individual_games || [];
  for (const game of games) {
    for (const move of game.move_history || []) {
      const nature = move.error_nature || "";
      if (nature === "Tactical Oversight") themeSet.add("Mixed Tactics");
      else if (nature === "Time Pressure") themeSet.add("Mixed Tactics");
    }
  }

  const themePriority = [
    "Piece Safety", "Forks", "Pins", "Skewers",
    "Discovered Attacks", "Back Rank Mate",
    "Endgame Fundamentals", "Mixed Tactics",
    "Tactical Combinations",
  ];
  const recommended_puzzle_themes = themePriority.filter((t) => themeSet.has(t)).slice(0, 6);
  if (recommended_puzzle_themes.length === 0) {
    recommended_puzzle_themes.push("Mixed Tactics", "Endgame Fundamentals");
  }

  // ── Estimated time ─────────────────────────────────────────────
  const estimated_training_time =
    acc < 60 ? "45 min per day" : acc < 75 ? "30 min per day" : "20 min per day";

  return {
    overall_strategy,
    strategy_description,
    study_focus,
    opening_adjustments,
    recommended_puzzle_themes,
    estimated_training_time,
  };
}
