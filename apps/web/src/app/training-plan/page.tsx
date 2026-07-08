"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Chess } from "chess.js";
import Header from "@/components/Header";
import Loader from "@/components/Loader";
import { usePlayer } from "@/contexts/PlayerContext";
import { getTrainingPlan } from "@/services/api";
import { Clock } from "lucide-react";

import { Chessboard } from "react-chessboard";

// ─── helpers ────────────────────────────────────────────────────────────────

function getFenBefore(
  fullHistory: { san: string }[],
  userColor: string,
  moveNumber: number,
): string | null {
  // full_history is indexed by ply (half-move).
  // White move N → ply (N-1)*2; Black move N → ply (N-1)*2+1
  const targetPly =
    userColor === "white" ? (moveNumber - 1) * 2 : (moveNumber - 1) * 2 + 1;
  try {
    const chess = new Chess();
    for (let i = 0; i < targetPly && i < fullHistory.length; i++) {
      chess.move(fullHistory[i].san);
    }
    return chess.fen();
  } catch {
    return null;
  }
}

function getMoveSquares(fen: string, san: string): [string, string] | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    return move ? [move.from, move.to] : null;
  } catch {
    return null;
  }
}

// ─── constants ───────────────────────────────────────────────────────────────

const NATURE_META: Record<string, { icon: string; color: string }> = {
  "Tactical Oversight":    { icon: "🎯", color: "#ef4444" },
  "Time Pressure":         { icon: "⏱",  color: "#f97316" },
  "Opening Knowledge":     { icon: "📚", color: "#3b82f6" },
  "Endgame Technique":     { icon: "👑", color: "#8b5cf6" },
  "Positional Misjudgment":{ icon: "🧩", color: "#64748b" },
  "None":                  { icon: "—",  color: "#94a3b8" },
  "Unknown":               { icon: "❓", color: "#94a3b8" },
};

const QUALITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  Blunder:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "BLUNDER" },
  Mistake:    { color: "#f97316", bg: "rgba(249,115,22,0.12)",  label: "MISTAKE" },
  Inaccuracy: { color: "#eab308", bg: "rgba(234,179,8,0.12)",   label: "INACCURACY" },
};

const PHASE_ICON: Record<string, string> = {
  opening: "📖", middlegame: "⚔️", endgame: "👑",
};

// ─── BlunderBoard ────────────────────────────────────────────────────────────

function BlunderBoard({ entry, game }: { entry: any; game: any }) {
  const fen =
    entry.fen_before ??
    (game.full_history?.length
      ? getFenBefore(game.full_history, game.user_color, entry.move_number)
      : null);

  if (!fen) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
          background: "var(--surface-1)",
          borderRadius: "8px",
          color: "var(--text-secondary)",
          textAlign: "center",
          fontSize: "13px",
          gap: "8px",
        }}
      >
        <span style={{ fontSize: "28px", opacity: 0.4 }}>♟</span>
        <p style={{ margin: 0 }}>
          Re-run Batch Analysis to see board positions
        </p>
      </div>
    );
  }

  const arrows: { startSquare: string; endSquare: string; color: string }[] = [];
  const playedSq = getMoveSquares(fen, entry.san);
  const bestSq   = getMoveSquares(fen, entry.best_move);
  if (playedSq) arrows.push({ startSquare: playedSq[0], endSquare: playedSq[1], color: "rgba(239,68,68,0.85)" });
  if (bestSq)   arrows.push({ startSquare: bestSq[0],   endSquare: bestSq[1],   color: "rgba(34,197,94,0.85)" });

  return (
    <div style={{ width: "100%", maxWidth: "280px" }}>
      <Chessboard
        options={{
          position:         fen,
          boardOrientation: game.user_color === "black" ? "black" : "white",
          allowDragging:    false,
          allowDrawingArrows: false,
          arrows,
          boardStyle: { borderRadius: "6px", overflow: "hidden" },
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "10px",
          fontSize: "12px",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#ef4444" }}>● Played: {entry.san}</span>
        <span style={{ color: "#22c55e" }}>● Best: {entry.best_move}</span>
      </div>
    </div>
  );
}

// ─── BlunderEntry ─────────────────────────────────────────────────────────────

function BlunderEntry({
  entry,
  game,
  expanded,
  onToggle,
}: {
  entry: any;
  game: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qs    = QUALITY_STYLE[entry.quality] ?? QUALITY_STYLE.Mistake;
  const nm    = NATURE_META[entry.error_nature] ?? { icon: "❓", color: "#94a3b8" };
  const delta = (entry.eval_after - entry.eval_before).toFixed(1);
  const sign  = parseFloat(delta) > 0 ? "+" : "";

  const dateStr = (() => {
    const raw = String(entry.game_date || game.date || "");
    if (!raw || raw.includes("?")) return null;
    const parts = raw.split(".");
    if (parts.length === 3) {
      const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      if (!isNaN(d.getTime()))
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return null;
  })();

  return (
    <div
      style={{
        borderRadius: "10px",
        border: "1px solid var(--glass-border)",
        background: "var(--surface-1)",
        overflow: "hidden",
        transition: "border-color 0.15s",
        borderLeft: `3px solid ${qs.color}`,
      }}
    >
      {/* Card header — always visible */}
      <div
        style={{ padding: "14px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}
      >
        {/* Quality badge */}
        <span
          style={{
            fontSize: "10px",
            fontWeight: "800",
            letterSpacing: "0.6px",
            padding: "3px 8px",
            borderRadius: "4px",
            background: qs.bg,
            color: qs.color,
            whiteSpace: "nowrap",
            marginTop: "1px",
          }}
        >
          {qs.label}
        </span>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <span style={{ fontWeight: "700", fontSize: "14px" }}>
              Move {entry.move_number}
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {PHASE_ICON[entry.phase]} {entry.phase}
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "1px 8px",
                borderRadius: "12px",
                background: nm.color + "18",
                color: nm.color,
                fontWeight: "600",
              }}
            >
              {nm.icon} {entry.error_nature}
            </span>
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              marginBottom: "6px",
            }}
          >
            vs {game.opponent} · {game.result?.toUpperCase()} · {game.opening}
            {dateStr && ` · ${dateStr}`}
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "13px" }}>
              <span style={{ color: "#ef4444", fontWeight: "700" }}>{entry.san}</span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>→ Best:</span>
              <span style={{ color: "#22c55e", fontWeight: "700" }}>{entry.best_move}</span>
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Eval: {entry.eval_before > 0 ? "+" : ""}{entry.eval_before.toFixed(1)} → {entry.eval_after > 0 ? "+" : ""}{entry.eval_after.toFixed(1)}
              <span style={{ color: qs.color, marginLeft: "4px" }}>({sign}{delta})</span>
            </span>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          style={{
            background: expanded ? "var(--accent-color)" : "var(--surface-2)",
            border: "none",
            borderRadius: "6px",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            color: expanded ? "#fff" : "var(--text-secondary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {expanded ? "Hide ▲" : "Board ▼"}
        </button>
      </div>

      {/* Board — lazy rendered when expanded */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 16px",
            display: "flex",
            justifyContent: "center",
            borderTop: "1px solid var(--glass-border)",
            paddingTop: "16px",
          }}
        >
          <BlunderBoard entry={entry} game={game} />
        </div>
      )}
    </div>
  );
}

// ─── BlunderClinic ────────────────────────────────────────────────────────────

function BlunderClinic({ username }: { username: string }) {
  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [natureFilter,setNatureFilter]= useState<string>("all");
  const [qualFilter,  setQualFilter]  = useState<string>("all");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/training/${username}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Could not load blunder data."))
      .finally(() => setLoading(false));
  }, [username]);

  const toggleBoard = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    [],
  );

  if (loading) return <Loader message="Loading your blunders…" />;
  if (error) {
    return (
      <div
        className="glass-card"
        style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>🧩</div>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const { summary, games, total_errors, total_games, has_boards } = data;

  // Flatten all entries with game context
  const allEntries: { entry: any; game: any; id: string }[] = [];
  for (const game of games) {
    for (const entry of game.errors) {
      allEntries.push({
        entry,
        game,
        id: `${game.filename}_${entry.move_number}`,
      });
    }
  }

  // Apply filters
  const visible = allEntries.filter(({ entry }) => {
    if (qualFilter !== "all" && entry.quality !== qualFilter) return false;
    if (natureFilter !== "all" && entry.error_nature !== natureFilter) return false;
    return true;
  });

  // Nature categories sorted by count
  const natures = Object.entries(summary.by_nature as Record<string, number>)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Stat cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "14px",
        }}
      >
        {[
          { label: "Blunders",    count: summary.blunders,    color: "#ef4444" },
          { label: "Mistakes",    count: summary.mistakes,    color: "#f97316" },
          { label: "Inaccuracies",count: summary.inaccuracies,color: "#eab308" },
          { label: "Games Analyzed",count: total_games,       color: "var(--accent-color)" },
        ].map(({ label, count, color }) => (
          <div
            key={label}
            className="glass-card"
            style={{ padding: "18px 20px", borderTop: `3px solid ${color}` }}
          >
            <div style={{ fontSize: "28px", fontWeight: "800", color }}>{count}</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Error nature breakdown ── */}
      <div className="glass-card" style={{ padding: "20px 24px" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.7px",
            marginBottom: "14px",
          }}
        >
          Error Classification
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button
            onClick={() => setNatureFilter("all")}
            style={{
              padding: "7px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: natureFilter === "all" ? "700" : "500",
              cursor: "pointer",
              border: `1px solid ${natureFilter === "all" ? "var(--accent-color)" : "var(--glass-border)"}`,
              background: natureFilter === "all" ? "var(--accent-color)" : "transparent",
              color: natureFilter === "all" ? "#fff" : "var(--text-secondary)",
            }}
          >
            All types · {total_errors}
          </button>
          {natures.map(([nature, count]) => {
            const nm = NATURE_META[nature] ?? { icon: "❓", color: "#94a3b8" };
            const active = natureFilter === nature;
            return (
              <button
                key={nature}
                onClick={() => setNatureFilter(active ? "all" : nature)}
                style={{
                  padding: "7px 16px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer",
                  border: `1px solid ${active ? nm.color : "var(--glass-border)"}`,
                  background: active ? nm.color + "22" : "transparent",
                  color: active ? nm.color : "var(--text-secondary)",
                }}
              >
                {nm.icon} {nature} · {count}
              </button>
            );
          })}
        </div>

        {/* Phase breakdown */}
        <div
          style={{
            display: "flex",
            gap: "20px",
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--glass-border)",
            flexWrap: "wrap",
          }}
        >
          {(["opening", "middlegame", "endgame"] as const).map((ph) => (
            <div
              key={ph}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
            >
              <span>{PHASE_ICON[ph]}</span>
              <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>
                {ph}:
              </span>
              <span style={{ fontWeight: "700" }}>
                {(summary.by_phase as Record<string, number>)[ph] || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quality filter ── */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Show:</span>
        {(["all", "Blunder", "Mistake", "Inaccuracy"] as const).map((q) => {
          const active = qualFilter === q;
          const style  = q !== "all" ? QUALITY_STYLE[q] : null;
          return (
            <button
              key={q}
              onClick={() => setQualFilter(q)}
              style={{
                padding: "5px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: active ? "700" : "500",
                cursor: "pointer",
                border: `1px solid ${active && style ? style.color : active ? "var(--accent-color)" : "var(--glass-border)"}`,
                background: active && style ? style.bg : active ? "var(--accent-color)" : "transparent",
                color:  active && style ? style.color : active ? "#fff" : "var(--text-secondary)",
              }}
            >
              {q === "all" ? "All" : q + "s"}
            </button>
          );
        })}
        <span style={{ fontSize: "13px", color: "var(--text-secondary)", marginLeft: "auto" }}>
          {visible.length} position{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Blunder list ── */}
      {visible.length === 0 ? (
        <div
          className="glass"
          style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}
        >
          No results for the selected filters.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {!has_boards && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(234,179,8,0.08)",
                border: "1px solid rgba(234,179,8,0.25)",
                borderRadius: "8px",
                fontSize: "13px",
                color: "var(--text-secondary)",
              }}
            >
              💡 Run Batch Analysis to unlock interactive board positions for each mistake.
            </div>
          )}
          {visible.map(({ entry, game, id }) => (
            <BlunderEntry
              key={id}
              entry={entry}
              game={game}
              expanded={expandedId === id}
              onToggle={() => toggleBoard(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Existing training plan components (unchanged) ────────────────────────────

const PUZZLE_DESCRIPTIONS: Record<string, string> = {
  "Piece Safety":
    "Identify and defend hanging or undefended pieces before your opponent exploits them.",
  Forks:
    "Practise recognising knight and pawn forks — moves that attack two pieces simultaneously.",
  Pins: "Find pinned pieces and learn when to exploit a pin or break out of one.",
  Skewers:
    "Attack a high-value piece to win the piece behind it after it moves.",
  "Discovered Attacks":
    "Move one piece to reveal an attack from another — a powerful hidden tactic.",
  "Back Rank Mate":
    "Spot back-rank weaknesses and learn to protect your own king.",
  "Endgame Fundamentals":
    "Master king and pawn endgames, Lucena position, and basic rook endings.",
  "Mixed Tactics":
    "A broad set of tactical motifs to sharpen your overall calculation.",
  "Tactical Combinations":
    "Multi-move combinations involving sacrifice and material win sequences.",
};

function PuzzleThemeCard({ theme }: { theme: string }) {
  const desc =
    PUZZLE_DESCRIPTIONS[theme] ||
    "Work through positions featuring this specific tactical or strategic motif.";
  return (
    <div
      style={{
        padding: "18px 20px",
        background: "var(--surface-1)",
        borderRadius: "10px",
        border: "1px solid var(--glass-border)",
        borderTop: "3px solid #6366f1",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ fontWeight: "700", fontSize: "15px", color: "#6366f1" }}>
        🧩 {theme}
      </div>
      <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
        {desc}
      </p>
    </div>
  );
}

function StudyFocusRow({ tip }: { tip: any }) {
  const isHigh = tip.priority === "High";
  const isMed  = tip.priority === "Medium" || tip.priority === "Moderate";
  const color  = isHigh ? "var(--danger)" : isMed ? "var(--warning)" : "var(--accent-color)";
  const bg     = isHigh ? "rgba(239,68,68,0.08)" : isMed ? "rgba(245,158,11,0.08)" : "rgba(29,193,137,0.08)";
  return (
    <div style={{ padding: "16px", background: "var(--surface-1)", borderRadius: "8px", borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: "700", fontSize: "16px" }}>{tip.topic}</span>
        <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "20px", fontWeight: "700", background: bg, color, border: `1px solid ${color}33` }}>
          {tip.priority} Priority
        </span>
      </div>
      <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "14px", lineHeight: "1.5" }}>{tip.message}</p>
    </div>
  );
}

function OpeningAdjCard({ adj }: { adj: any }) {
  const isHigh   = adj.priority === "High";
  const color    = isHigh ? "var(--danger)" : "var(--accent-color)";
  const bg       = isHigh ? "rgba(239,68,68,0.08)" : "rgba(29,193,137,0.08)";
  const name     = adj.opening || adj.topic || adj.name || "Opening";
  const suggestion = adj.suggestion || adj.message || adj.advice || "";
  return (
    <div style={{ padding: "16px", background: "var(--surface-1)", borderRadius: "8px", borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: "700", fontSize: "16px" }}>{name}</span>
        <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "20px", fontWeight: "700", background: bg, color, border: `1px solid ${color}33` }}>
          {adj.priority || "Medium"} Priority
        </span>
      </div>
      {suggestion && (
        <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "14px", lineHeight: "1.5" }}>{suggestion}</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrainingPlanPage() {
  const router = useRouter();
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();
  const [activeTab, setActiveTab] = useState<"clinic" | "plan">("clinic");
  const [plan,    setPlan]    = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    if (playerLoading) return;
    if (!chessUsername || !isApproved) { router.push("/login"); return; }
  }, [chessUsername, isApproved, playerLoading, router]);

  // Lazy-load training plan only when that tab is opened
  useEffect(() => {
    if (activeTab !== "plan" || plan !== null || !chessUsername) return;
    setPlanLoading(true);
    getTrainingPlan(chessUsername)
      .then(setPlan)
      .catch(() => setPlan(null))
      .finally(() => setPlanLoading(false));
  }, [activeTab, plan, chessUsername]);

  if (!chessUsername) return null;

  return (
    <>
      <Header />
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
      >
        {/* Page header */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "32px", marginBottom: "4px" }}>Training</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Learn from your actual games — targeted practice based on your mistakes.
          </p>
        </div>

        {/* Opening Drill CTA */}
        <Link
          href="/openings/drill"
          style={{ textDecoration: "none", display: "block", marginBottom: "24px" }}
        >
          <div
            style={{
              padding: "18px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(99,102,241,0.35)",
              background: "rgba(99,102,241,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div>
              <div style={{ fontWeight: "700", fontSize: "15px", color: "#818cf8", marginBottom: "3px" }}>
                ♟ Opening Drill — Practice against Stockfish
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Choose any opening · set the engine ELO · play unlimited games in your browser
              </div>
            </div>
            <span style={{ fontSize: "20px", flexShrink: 0, color: "#818cf8" }}>→</span>
          </div>
        </Link>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "28px",
            background: "var(--surface-1)",
            borderRadius: "10px",
            padding: "4px",
            width: "fit-content",
          }}
        >
          {(["clinic", "plan"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 20px",
                borderRadius: "7px",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: activeTab === tab ? "700" : "500",
                background: activeTab === tab ? "var(--accent-color)" : "transparent",
                color: activeTab === tab ? "#fff" : "var(--text-secondary)",
                transition: "all 0.15s ease",
              }}
            >
              {tab === "clinic" ? "🏥 Blunder Clinic" : "📋 Training Plan"}
            </button>
          ))}
        </div>

        {/* Blunder Clinic tab */}
        {activeTab === "clinic" && <BlunderClinic username={chessUsername} />}

        {/* Training Plan tab */}
        {activeTab === "plan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            {planLoading ? (
              <Loader message="Generating your training plan…" />
            ) : plan ? (
              <>
                {/* Overall Strategy */}
                <div className="glass-card" style={{ padding: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
                  <div>
                    <h3 style={{ fontSize: "14px", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>Overall Strategy</h3>
                    <h2 style={{ fontSize: "24px", color: "var(--warning)", fontWeight: "bold", margin: 0 }}>{plan.overall_strategy}</h2>
                    {plan.strategy_description && (
                      <p style={{ color: "var(--text-secondary)", margin: "10px 0 0", fontSize: "14px", lineHeight: "1.6" }}>{plan.strategy_description}</p>
                    )}
                  </div>
                  <div style={{ padding: "16px 20px", background: "rgba(245,158,11,0.06)", borderRadius: "12px", border: "1px solid rgba(245,158,11,0.15)", display: "flex", alignItems: "center", gap: "12px" }}>
                    <Clock size={24} color="var(--warning)" />
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Daily Commitment</div>
                      <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--warning)" }}>{plan.estimated_training_time || "1 hour per day"}</div>
                    </div>
                  </div>
                </div>

                {/* Study Focus */}
                <div className="glass-card" style={{ padding: "32px" }}>
                  <h3 style={{ marginBottom: "24px", fontSize: "20px", color: "var(--accent-color)" }}>Study Focus Areas</h3>
                  {plan.study_focus?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {plan.study_focus.map((tip: any, idx: number) => <StudyFocusRow key={idx} tip={tip} />)}
                    </div>
                  ) : (
                    <p style={{ color: "var(--text-secondary)" }}>No specific study focus suggestions. Keep doing what you&apos;re doing!</p>
                  )}
                </div>

                {/* Opening Adjustments */}
                <div className="glass-card" style={{ padding: "32px" }}>
                  <h3 style={{ marginBottom: "8px", fontSize: "20px" }}>Opening Repertoire Adjustments</h3>
                  {plan.opening_adjustments?.length > 0 ? (
                    <>
                      <p style={{ color: "var(--text-secondary)", marginBottom: "20px", fontSize: "14px" }}>
                        {plan.opening_adjustments.length} opening{plan.opening_adjustments.length > 1 ? "s" : ""} flagged for attention:
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {plan.opening_adjustments.map((adj: any, idx: number) => <OpeningAdjCard key={idx} adj={adj} />)}
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>Your current opening choices look solid!</p>
                  )}
                </div>

                {/* Puzzle Themes */}
                {plan.recommended_puzzle_themes?.length > 0 && (
                  <div className="glass-card" style={{ padding: "32px" }}>
                    <h3 style={{ marginBottom: "8px", fontSize: "20px" }}>Recommended Puzzle Themes</h3>
                    <p style={{ color: "var(--text-secondary)", marginBottom: "20px", fontSize: "14px" }}>
                      Solving puzzles on these themes will directly target your most common tactical errors:
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
                      {plan.recommended_puzzle_themes.map((theme: string, idx: number) => <PuzzleThemeCard key={idx} theme={theme} />)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                Training plan unavailable. Please run Batch Analysis first.
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
