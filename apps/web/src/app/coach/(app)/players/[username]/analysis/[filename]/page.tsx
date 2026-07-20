"use client";
import { useEffect, useState, use, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import CoachHeader from "@/components/CoachHeader";
import Loader from "@/components/Loader";
import MistakeCard from "@/components/MistakeCard";
import PatternGrid from "@/components/PatternGrid";
import TimeAnalysisCard from "@/components/TimeAnalysisCard";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { analyzeGame, fetchAnnotations, type Annotation } from "@/services/api";
import AnnotationPanel from "@/components/AnnotationPanel";
import { PillTabs } from "@/components/PillTabs";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  ArrowLeft,
  Play,
  Pause,
} from "lucide-react";

const PIECE_SYMBOLS: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
};

// Book: grey (theory, not a real decision) · Forced: darker grey (only legal move)
// Good/Excellent/Best: shades of green, deepening with move strength
// Inaccuracy/Mistake: yellow -> orange · Blunder: red
// Great/Brilliant: shades of blue, deepening with move strength
const QUALITY_COLOR: Record<string, string> = {
  Book: "#9ca3af",
  Forced: "#6b7280",
  Good: "#4ade80",
  Excellent: "#22c55e",
  Best: "#16a34a",
  Inaccuracy: "#eab308",
  Mistake: "#f97316",
  Blunder: "#ef4444",
  Great: "#3b82f6",
  Brilliant: "#4f46e5",
};

const QUALITY_BG: Record<string, string> = {
  Book: "rgba(156,163,175,0.10)",
  Forced: "transparent",
  Good: "rgba(74,222,128,0.08)",
  Excellent: "rgba(34,197,94,0.10)",
  Best: "rgba(22,163,74,0.12)",
  Inaccuracy: "rgba(234,179,8,0.10)",
  Mistake: "rgba(249,115,22,0.12)",
  Blunder: "rgba(239,68,68,0.12)",
  Great: "rgba(59,130,246,0.10)",
  Brilliant: "rgba(79,70,229,0.12)",
};

const BOARD_THEMES: Record<string, { dark: string; light: string; label: string }> = {
  classic:    { dark: "#b58863", light: "#f0d9b5", label: "Classic"    },
  green:      { dark: "#769656", light: "#eeeed2", label: "Green"      },
  mono:       { dark: "#4a4a4a", light: "#e8e8e8", label: "Mono"       },
  ocean:      { dark: "#4870ac", light: "#dae3f5", label: "Ocean"      },
  walnut:     { dark: "#7c3f00", light: "#f5d6a4", label: "Walnut"     },
};

type Tab = "overview" | "moves" | "mistakes" | "openings" | "patterns";
type MistakeFilter = "All" | "Blunder" | "Mistake" | "Inaccuracy";

function getCapturedPieces(fen: string) {
  const pieceCounts: Record<string, number> = {
    P: 0,
    N: 0,
    B: 0,
    R: 0,
    Q: 0,
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  };
  const startingCounts: Record<string, number> = {
    P: 8,
    N: 2,
    B: 2,
    R: 2,
    Q: 1,
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1,
  };
  if (!fen || fen === "start") return { whiteCaptured: [], blackCaptured: [] };
  const boardFen = fen.split(" ")[0];
  for (const char of boardFen) {
    if (pieceCounts[char] !== undefined) pieceCounts[char]++;
  }
  const whiteCaptured: string[] = [];
  const blackCaptured: string[] = [];
  (["p", "n", "b", "r", "q"] as const).forEach((t) => {
    for (let i = 0; i < startingCounts[t] - pieceCounts[t]; i++)
      whiteCaptured.push(t);
  });
  (["P", "N", "B", "R", "Q"] as const).forEach((t) => {
    for (let i = 0; i < startingCounts[t] - pieceCounts[t]; i++)
      blackCaptured.push(t);
  });
  return { whiteCaptured, blackCaptured };
}

function gradeFromAccuracy(acc: number) {
  if (acc >= 90) return { letter: "A+", color: "#6366f1" };
  if (acc >= 80) return { letter: "A", color: "#10b981" };
  if (acc >= 70) return { letter: "B", color: "#22d3ee" };
  if (acc >= 60) return { letter: "C", color: "#f59e0b" };
  return { letter: "D", color: "#ef4444" };
}

export default function CoachGameAnalysisPage({
  params,
}: {
  params: Promise<{ username: string; filename: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const { username, filename } = resolvedParams;
  const { user, coachProfile, loading: authLoading } = useAuth();

  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mistakeFilter, setMistakeFilter] = useState<MistakeFilter>("All");
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const { boardTheme, setBoardTheme, multiPv } = useSettings();
  const [themeFlash, setThemeFlash] = useState(false);
  const [movePairs, setMovePairs] = useState<
    Array<{ from: string; to: string }>
  >([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const activeMoveRef = useRef<HTMLTableRowElement>(null);
  const progressRef = useRef(0);

  const moveHistoryToPly = useMemo<number[]>(() => {
    if (!analysis?.full_history) return [];
    const result: number[] = [];
    let userCount = 0;
    for (let i = 0; i < analysis.full_history.length; i++) {
      if (analysis.full_history[i].is_user) {
        result[userCount] = i + 1;
        userCount++;
      }
    }
    return result;
  }, [analysis]);

  const plyQualityMap = useMemo<
    Record<
      number,
      {
        quality: string;
        bestMove?: string;
        topLines?: { san: string; from: string; to: string; cp?: number; mate?: number }[];
      }
    >
  >(() => {
    if (!analysis?.move_history || !moveHistoryToPly.length) return {};
    const map: Record<number, { quality: string; bestMove?: string; topLines?: any[] }> = {};
    (analysis.move_history as any[]).forEach((m, k) => {
      const ply = moveHistoryToPly[k];
      if (ply != null) map[ply] = { quality: m.quality, bestMove: m.best_move, topLines: m.top_lines };
    });
    return map;
  }, [analysis, moveHistoryToPly]);

  const evalSeries = useMemo(() => {
    if (!analysis?.full_history || !analysis?.move_history) return [];
    const pts: { ply: number; ev: number; quality?: string; san?: string }[] = [
      { ply: 0, ev: 0 },
    ];
    let userIdx = 0;
    const mh: any[] = analysis.move_history;
    (analysis.full_history as any[]).forEach((m, i) => {
      const ply = i + 1;
      if (m.is_user && userIdx < mh.length) {
        const s = mh[userIdx++];
        pts.push({ ply, ev: Math.max(-10, Math.min(10, s.eval_after ?? s.eval ?? 0)), quality: s.quality, san: s.san });
      } else {
        const next = mh[userIdx];
        const ev = next ? (next.eval_before ?? 0) : (pts[pts.length - 1]?.ev ?? 0);
        pts.push({ ply, ev: Math.max(-10, Math.min(10, ev)) });
      }
    });
    return pts;
  }, [analysis]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/coach/login");
      return;
    }
    if (!username || !filename) return;

    analyzeGame(username, filename, false, multiPv, (pct) => {
      progressRef.current = pct;
      setAnalysisProgress(pct);
    })
      .then((data) => {
        setAnalysis(data);
        if (data?.full_history) {
          const game = new Chess();
          const fens = [game.fen()];
          const pairs: Array<{ from: string; to: string }> = [];
          for (const move of data.full_history) {
            try {
              const result = game.move(move.san);
              pairs.push(
                result
                  ? { from: result.from, to: result.to }
                  : { from: "", to: "" },
              );
              fens.push(game.fen());
            } catch {
              pairs.push({ from: "", to: "" });
              fens.push(fens[fens.length - 1]);
            }
          }
          setFenHistory(fens);
          setMovePairs(pairs);
        }
        const startPct = progressRef.current;
        const remaining = 100 - startPct;
        const duration = startPct < 5 ? 700 : 250;
        const steps = 20;
        let step = 0;
        const id = setInterval(() => {
          step++;
          setAnalysisProgress(Math.min(100, startPct + (remaining * step) / steps));
          if (step >= steps) {
            clearInterval(id);
            setTimeout(() => setLoading(false), 150);
          }
        }, duration / steps);
      })
      .catch((e) => {
        console.error(e);
        alert("Failed to analyze game.");
        setLoading(false);
      });
  }, [authLoading, user, username, filename, router]);

  useEffect(() => {
    if (!coachProfile?.id || !username || !filename) return;
    fetchAnnotations(coachProfile.id, username, filename).then(setAnnotations);
  }, [coachProfile?.id, username, filename]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);

  const goToStart = () => {
    setIsPlaying(false);
    setCurrentMoveIndex(0);
  };
  const goToPrev = () => {
    setIsPlaying(false);
    setCurrentMoveIndex((i) => Math.max(0, i - 1));
  };
  const goToNext = () => {
    setIsPlaying(false);
    setCurrentMoveIndex((i) => Math.min(fenHistory.length - 1, i + 1));
  };
  const goToEnd = () => {
    setIsPlaying(false);
    setCurrentMoveIndex(fenHistory.length - 1);
  };
  const goToMove = (index: number) => {
    setIsPlaying(false);
    setCurrentMoveIndex(index);
  };
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentMoveIndex >= fenHistory.length - 1) setCurrentMoveIndex(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (activeMoveRef.current)
      activeMoveRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }, [currentMoveIndex, activeTab]);

  // Registered once (empty deps) and dispatches through a ref so the handler
  // always sees the latest goTo* closures without re-subscribing on every
  // render. Re-subscribing per render (the previous behavior) meant a burst
  // of real keydown events — e.g. holding an arrow key — raced the listener
  // being torn down and re-added each render, which could trip React's
  // "Maximum update depth exceeded" guard.
  const navHandlersRef = useRef({ goToPrev, goToNext, goToStart, goToEnd });
  navHandlersRef.current = { goToPrev, goToNext, goToStart, goToEnd };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navHandlersRef.current.goToPrev();
      if (e.key === "ArrowRight") navHandlersRef.current.goToNext();
      if (e.key === "ArrowUp") navHandlersRef.current.goToStart();
      if (e.key === "ArrowDown") navHandlersRef.current.goToEnd();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isPlaying || fenHistory.length === 0) return;
    if (currentMoveIndex >= fenHistory.length - 1) {
      const t = setTimeout(() => setIsPlaying(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCurrentMoveIndex((i) => i + 1), 1000);
    return () => clearTimeout(t);
  }, [isPlaying, currentMoveIndex, fenHistory.length]);

  if (authLoading || !user) return null;

  const currentFen = fenHistory[currentMoveIndex] || "start";
  const { whiteCaptured, blackCaptured } = getCapturedPieces(currentFen);

  const currentMove =
    currentMoveIndex > 0 ? movePairs[currentMoveIndex - 1] : null;
  const currentMoveInfo = plyQualityMap[currentMoveIndex];
  const currentQuality = currentMoveInfo?.quality;

  const ARROW_COLORS: Record<string, string> = {
    Book: "rgb(156,163,175)",
    Forced: "rgb(107,114,128)",
    Good: "rgb(74,222,128)",
    Excellent: "rgb(34,197,94)",
    Best: "rgb(22,163,74)",
    Inaccuracy: "rgb(234,179,8)",
    Mistake: "rgb(249,115,22)",
    Blunder: "rgb(239,68,68)",
    Great: "rgb(59,130,246)",
    Brilliant: "rgb(79,70,229)",
  };
  const SQUARE_OVERLAY: Record<string, string> = {
    Book: "rgba(156,163,175,0.25)",
    Forced: "rgba(107,114,128,0.25)",
    Good: "rgba(74,222,128,0.22)",
    Excellent: "rgba(34,197,94,0.25)",
    Best: "rgba(22,163,74,0.28)",
    Inaccuracy: "rgba(234,179,8,0.30)",
    Mistake: "rgba(249,115,22,0.32)",
    Blunder: "rgba(239,68,68,0.38)",
    Great: "rgba(59,130,246,0.28)",
    Brilliant: "rgba(79,70,229,0.30)",
  };
  const BADGE: Record<string, string> = {
    Blunder: "??",
    Mistake: "?",
    Inaccuracy: "?!",
    Brilliant: "!!",
    Great: "!",
    Best: "!",
  };

  // Shades of green, strongest for the engine's #1 choice, fading for 2nd/3rd.
  const CANDIDATE_SHADES = ["rgb(34,197,94)", "rgb(74,222,128)", "rgb(134,239,172)"];

  const NEEDS_BETTER_MOVE = currentQuality === "Blunder" || currentQuality === "Mistake" || currentQuality === "Inaccuracy";

  const topLines = currentMoveInfo?.topLines || [];
  const showCandidateLines =
    NEEDS_BETTER_MOVE && currentMoveIndex > 0 && multiPv > 1 && topLines.length > 1;

  let bestMoveArrow: { startSquare: string; endSquare: string; color: string } | null = null;
  let candidateArrows: { startSquare: string; endSquare: string; color: string }[] = [];

  if (showCandidateLines) {
    // MultiPV > 1: surface up to the top 3 engine-preferred moves instead of just one.
    const cap = Math.min(multiPv, 3, topLines.length);
    candidateArrows = topLines
      .slice(0, cap)
      .filter((l) => l.from && l.to)
      .map((l, idx) => ({
        startSquare: l.from,
        endSquare: l.to,
        color: CANDIDATE_SHADES[idx] ?? CANDIDATE_SHADES[CANDIDATE_SHADES.length - 1],
      }));
  } else if (NEEDS_BETTER_MOVE && !!currentMoveInfo?.bestMove && currentMoveIndex > 0) {
    try {
      const preGame = new Chess(fenHistory[currentMoveIndex - 1]);
      const mv = preGame.move(currentMoveInfo!.bestMove!);
      if (mv) bestMoveArrow = { startSquare: mv.from, endSquare: mv.to, color: "rgb(34,197,94)" };
    } catch {}
  }

  const displayFen = currentFen;

  const rawArrows = [
    ...(currentMove?.from
      ? [{ startSquare: currentMove.from, endSquare: currentMove.to, color: (currentQuality && ARROW_COLORS[currentQuality]) || "rgb(120,150,220)" }]
      : []),
    ...(bestMoveArrow ? [bestMoveArrow] : []),
    ...candidateArrows,
  ];

  // react-chessboard keys arrows by start+end square — dedupe so an engine
  // candidate that lands on the same squares as the played move (or the
  // single best-move arrow) doesn't produce a duplicate React key.
  const seenArrowSquares = new Set<string>();
  const arrows = rawArrows.filter((a) => {
    const key = `${a.startSquare}-${a.endSquare}`;
    if (seenArrowSquares.has(key)) return false;
    seenArrowSquares.add(key);
    return true;
  });

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (currentMove?.from) {
    squareStyles[currentMove.from] = {
      backgroundColor: "rgba(255,255,100,0.28)",
    };
    squareStyles[currentMove.to] = {
      backgroundColor:
        (currentQuality && SQUARE_OVERLAY[currentQuality]) ||
        "rgba(34,197,94,0.25)",
    };
  }

  const badgeSymbol = currentQuality ? BADGE[currentQuality] : undefined;
  const badgePos =
    currentMove?.to && badgeSymbol
      ? (() => {
          const col = currentMove.to.charCodeAt(0) - 97;
          const rank = parseInt(currentMove.to[1]);
          return { left: `${col * 12.5}%`, top: `${(8 - rank) * 12.5}%` };
        })()
      : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "moves", label: "Move List" },
    { id: "mistakes", label: "Blunders & Mistakes" },
    { id: "openings", label: "Opening" },
    { id: "patterns", label: "Patterns" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <CoachHeader />
      {/* spacer for the 70px fixed header */}
      <div style={{ height: "70px", flexShrink: 0 }} />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          padding: "16px 32px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxWidth: "1600px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={() => router.push("/coach/dashboard")}
            style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ArrowLeft size={17} /> Back to Dashboard
          </button>

          {analysis && (
            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    marginRight: "6px",
                  }}
                >
                  Accuracy
                </span>
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: "700",
                    color: "var(--accent-color)",
                  }}
                >
                  {analysis.game_accuracy}%
                </span>
              </div>
              <div
                style={{
                  height: "28px",
                  width: "1px",
                  background: "var(--glass-border)",
                }}
              />
              <div>
                <span
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    marginRight: "6px",
                  }}
                >
                  Opening
                </span>
                <span style={{ fontSize: "15px", fontWeight: "500" }}>
                  {analysis.opening_name || "Unknown"} (
                  {analysis.eco_code || "?"})
                </span>
              </div>
              <div
                style={{
                  height: "28px",
                  width: "1px",
                  background: "var(--glass-border)",
                }}
              />
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Coaching:{" "}
                <span
                  style={{ color: "var(--accent-color)", fontWeight: "700" }}
                >
                  {username}
                </span>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <Loader message={`Analyzing ${username}'s game with Stockfish…`} progress={analysisProgress} />
        ) : analysis ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(360px, 1fr) minmax(400px, 1.6fr)",
              gap: "24px",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* LEFT: Chessboard */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Black player info */}
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                  padding: "0 4px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "4px",
                      background: "#333",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "11px",
                      color: "#fff",
                    }}
                  >
                    B
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    {analysis.black_player}
                  </span>
                </div>
                <div style={{ fontSize: "15px", letterSpacing: "1px", color: "#888" }}>
                  {blackCaptured.map((p, i) => (
                    <span key={i}>{PIECE_SYMBOLS[p]}</span>
                  ))}
                </div>
              </div>

              {/* Board — fills all available height, maintains 1:1 aspect ratio */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    maxHeight: "100%",
                    maxWidth: "100%",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                    border: "1px solid var(--glass-border)",
                    position: "relative",
                    opacity: themeFlash ? 0 : 1,
                    transition: "opacity 0.16s ease",
                  }}
                >
                  <Chessboard
                    options={{
                      position: displayFen,
                      darkSquareStyle: { backgroundColor: BOARD_THEMES[boardTheme]?.dark ?? "#b58863" },
                      lightSquareStyle: { backgroundColor: BOARD_THEMES[boardTheme]?.light ?? "#f0d9b5" },
                      animationDurationInMs: 200,
                      allowDragging: false,
                      arrows,
                      squareStyles,
                    }}
                  />
                  {badgePos && (
                    <div
                      style={{
                        position: "absolute",
                        left: badgePos.left,
                        top: badgePos.top,
                        width: "12.5%",
                        height: "12.5%",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "flex-end",
                        padding: "3px",
                        pointerEvents: "none",
                        zIndex: 20,
                      }}
                    >
                      <div
                        style={{
                          background: QUALITY_COLOR[currentQuality!],
                          color: "#fff",
                          borderRadius: "50%",
                          width: "22px",
                          height: "22px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          fontWeight: "900",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
                          border: "1.5px solid rgba(255,255,255,0.35)",
                          letterSpacing: "-0.5px",
                          lineHeight: 1,
                        }}
                      >
                        {badgeSymbol}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* White player info */}
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "6px",
                  padding: "0 4px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "4px",
                      background: "#eee",
                      color: "#111",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "11px",
                    }}
                  >
                    W
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    {analysis.white_player}
                  </span>
                </div>
                <div style={{ fontSize: "15px", letterSpacing: "1px", color: "#ddd" }}>
                  {whiteCaptured.map((p, i) => (
                    <span key={i}>{PIECE_SYMBOLS[p]}</span>
                  ))}
                </div>
              </div>

              <div
                className="glass-card"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px",
                  marginTop: "8px",
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={goToStart}
                  disabled={currentMoveIndex === 0}
                  title="Start (↑)"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={goToPrev}
                  disabled={currentMoveIndex === 0}
                  title="Prev (←)"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={fenHistory.length === 0}
                  title={isPlaying ? "Pause" : "Play through game"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: `1px solid ${isPlaying ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.15)"}`,
                    background: isPlaying
                      ? "rgba(239,68,68,0.12)"
                      : "rgba(255,255,255,0.08)",
                    color: isPlaying ? "#ef4444" : "#f5f5f5",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={goToNext}
                  disabled={currentMoveIndex === fenHistory.length - 1}
                  title="Next (→)"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={goToEnd}
                  disabled={currentMoveIndex === fenHistory.length - 1}
                  title="End (↓)"
                >
                  <SkipForward size={18} />
                </button>
              </div>

            </div>

            {/* RIGHT: Tabbed panel */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Tab bar */}
              <div style={{ marginBottom: "10px" }}>
                <PillTabs tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />
              </div>

              {/* Annotation panel — persists across all tabs */}
              {coachProfile?.id && (
                <div style={{ flexShrink: 0 }}>
                <AnnotationPanel
                  mode="coach"
                  coachId={coachProfile.id}
                  playerUsername={username}
                  filename={filename}
                  moveIndex={currentMoveIndex}
                  annotations={annotations}
                  onSaved={(a) =>
                    setAnnotations((prev) => {
                      const filtered = prev.filter(
                        (x) => x.move_index !== a.move_index,
                      );
                      return [...filtered, a];
                    })
                  }
                  onDeleted={(id) =>
                    setAnnotations((prev) => prev.filter((x) => x.id !== id))
                  }
                />
                </div>
              )}

              {/* Tab content */}
              <div
                className="glass-card"
                style={{
                  flex: 1,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  padding: 0,
                  marginTop: "10px",
                }}
              >
                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div
                    style={{
                      overflowY: "auto",
                      padding: "18px 22px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    {/* Eval graph */}
                    {evalSeries.length > 1 && (
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
                          Evaluation Graph
                        </div>
                        <div style={{ height: "90px", width: "100%", cursor: "pointer" }}
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const pct = (e.clientX - rect.left) / rect.width;
                            const ply = Math.round(pct * (evalSeries.length - 1));
                            goToMove(Math.max(0, Math.min(evalSeries.length - 1, ply)));
                          }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={evalSeries} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
                              <defs>
                                <linearGradient id="evalGradCoach" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                                  <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
                                  <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="ply" hide />
                              <YAxis domain={[-10, 10]} hide />
                              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.[0]) return null;
                                  const d = payload[0].payload;
                                  return (
                                    <div style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "6px 10px", fontSize: "11px", color: "#fff" }}>
                                      {d.san && <div style={{ fontWeight: 700 }}>{d.san}</div>}
                                      <div style={{ color: d.quality ? QUALITY_COLOR[d.quality] || "var(--text-secondary)" : "var(--text-secondary)" }}>
                                        {d.quality || `Ply ${d.ply}`}
                                      </div>
                                      <div style={{ color: "var(--text-secondary)" }}>Eval: {d.ev > 0 ? "+" : ""}{d.ev.toFixed(2)}</div>
                                    </div>
                                  );
                                }}
                              />
                              <Area type="monotone" dataKey="ev" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#evalGradCoach)"
                                dot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  if (!payload.quality) return <g key={props.key} />;
                                  const col = QUALITY_COLOR[payload.quality] || "rgba(255,255,255,0.4)";
                                  return <circle key={props.key} cx={cx} cy={cy} r={3.5} fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />;
                                }}
                                activeDot={{ r: 5, fill: "var(--accent-color)" }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {(() => {
                      const acc = parseFloat(analysis.game_accuracy);
                      const grade = gradeFromAccuracy(acc);
                      return (
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              width: "60px",
                              height: "60px",
                              borderRadius: "50%",
                              background: `${grade.color}22`,
                              border: `3px solid ${grade.color}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "24px",
                              fontWeight: "800",
                              color: grade.color,
                              flexShrink: 0,
                            }}
                          >
                            {grade.letter}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "26px",
                                fontWeight: "800",
                                color: "var(--accent-color)",
                              }}
                            >
                              {acc.toFixed(1)}%
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Game Accuracy
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {analysis.phase_accuracy && (
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            marginBottom: "10px",
                          }}
                        >
                          Phase Accuracy
                        </div>
                        {Object.entries(analysis.phase_accuracy).map(
                          ([phase, val]) => {
                            const pct = parseFloat(val as string);
                            return (
                              <div key={phase} style={{ marginBottom: "10px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      textTransform: "capitalize",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {phase}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    {pct.toFixed(1)}%
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: "6px",
                                    borderRadius: "3px",
                                    background: "var(--surface-2)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: "100%",
                                      background:
                                        pct >= 70
                                          ? "var(--success)"
                                          : pct >= 50
                                            ? "var(--warning)"
                                            : "var(--danger)",
                                      borderRadius: "3px",
                                      transform: `scaleX(${Math.min(pct, 100) / 100})`,
                                      transformOrigin: "left",
                                      transition: "transform 0.6s ease",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}

                    {analysis.time_analysis && (
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            marginBottom: "10px",
                          }}
                        >
                          Time Analysis
                        </div>
                        <TimeAnalysisCard
                          avg_time_per_move={
                            analysis.time_analysis.average_time_per_move
                          }
                          phase_breakdown={
                            analysis.time_analysis.phase_time_breakdown
                          }
                          time_pressure_risk={
                            analysis.time_analysis.time_pressure_risk
                          }
                          think_move_count={
                            analysis.time_analysis.think_moves?.length
                          }
                        />
                      </div>
                    )}

                    {(() => {
                      const moves: any[] = analysis.move_history || [];
                      const blundersIndexed = moves
                        .map((m, idx) => ({ m, idx }))
                        .filter(({ m }) => m.quality === "Blunder");
                      if (!blundersIndexed.length) return null;
                      const { m: worst, idx: worstIdx } =
                        blundersIndexed.reduce(
                          (b, c) => (c.m.cp_loss > b.m.cp_loss ? c : b),
                          blundersIndexed[0],
                        );
                      return (
                        <div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "var(--text-secondary)",
                              textTransform: "uppercase",
                              marginBottom: "10px",
                            }}
                          >
                            Worst Blunder
                          </div>
                          <MistakeCard
                            move_number={worst.move_number}
                            turn_label={worst.turn_label}
                            san={worst.san}
                            quality={worst.quality}
                            cp_loss={worst.cp_loss}
                            phase={worst.phase}
                            best_move={worst.best_move}
                            error_nature={worst.error_nature}
                            onClick={() => {
                              const ply = moveHistoryToPly[worstIdx];
                              if (ply != null) goToMove(ply);
                              setActiveTab("moves");
                            }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── MOVE LIST ── */}
                {activeTab === "moves" && (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 18px",
                        borderBottom: "1px solid var(--glass-border)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <h3 style={{ fontSize: "15px", margin: 0 }}>
                        Moves & Evaluation
                      </h3>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "13px",
                        }}
                      >
                        <thead
                          style={{
                            position: "sticky",
                            top: 0,
                            background: "var(--card-bg)",
                            backdropFilter: "blur(12px)",
                            zIndex: 10,
                          }}
                        >
                          <tr>
                            <th
                              style={{
                                padding: "10px 18px",
                                color: "var(--text-secondary)",
                                textAlign: "left",
                              }}
                            >
                              #
                            </th>
                            <th
                              style={{
                                padding: "10px 8px",
                                color: "var(--text-secondary)",
                                textAlign: "left",
                              }}
                            >
                              Move
                            </th>
                            <th
                              style={{
                                padding: "10px 8px",
                                color: "var(--text-secondary)",
                                textAlign: "left",
                              }}
                            >
                              Quality
                            </th>
                            <th
                              style={{
                                padding: "10px 18px",
                                color: "var(--text-secondary)",
                                textAlign: "left",
                              }}
                            >
                              Details
                            </th>
                            <th
                              style={{
                                padding: "10px 14px",
                                color: "var(--text-secondary)",
                                textAlign: "left",
                                minWidth: "140px",
                              }}
                            >
                              Coach Note
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            onClick={() => goToMove(0)}
                            style={{
                              cursor: "pointer",
                              backgroundColor:
                                currentMoveIndex === 0
                                  ? "rgba(99,102,241,0.12)"
                                  : "transparent",
                              borderLeft:
                                currentMoveIndex === 0
                                  ? "3px solid #6366f1"
                                  : "3px solid transparent",
                              borderBottom: "1px solid rgba(255,255,255,0.02)",
                            }}
                          >
                            <td
                              style={{
                                padding: "9px 18px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              0
                            </td>
                            <td
                              style={{ padding: "9px 8px", fontWeight: "500" }}
                            >
                              Start
                            </td>
                            <td style={{ padding: "9px 8px" }}>-</td>
                            <td style={{ padding: "9px 18px" }}>-</td>
                            <td style={{ padding: "9px 14px" }}><span style={{ color: "rgba(255,255,255,0.15)", fontSize: "11px" }}>—</span></td>
                          </tr>
                          {(() => {
                            let userMoveIdx = 0;
                            return (analysis.full_history || []).map(
                              (m: any, i: number) => {
                                const plyIndex = i + 1;
                                const isActive = currentMoveIndex === plyIndex;
                                const isWhiteTurn = i % 2 === 0;
                                const turnLabel = `${Math.floor(i / 2) + 1}${isWhiteTurn ? ".W" : ".B"}`;
                                const noteAnnotation = annotations.find(
                                  (a) => a.move_index === plyIndex,
                                );
                                let stats: any = null;
                                if (
                                  m.is_user &&
                                  analysis.move_history &&
                                  userMoveIdx < analysis.move_history.length
                                )
                                  stats = analysis.move_history[userMoveIdx++];
                                const qColor = stats
                                  ? QUALITY_COLOR[stats.quality] ||
                                    "var(--text-secondary)"
                                  : "transparent";
                                const qBg = stats
                                  ? QUALITY_BG[stats.quality] || "transparent"
                                  : "transparent";
                                return (
                                  <tr
                                    key={i}
                                    ref={isActive ? activeMoveRef : null}
                                    onClick={() => goToMove(plyIndex)}
                                    style={{
                                      cursor: "pointer",
                                      backgroundColor: isActive
                                        ? "rgba(99,102,241,0.12)"
                                        : "transparent",
                                      borderLeft: isActive
                                        ? "3px solid #6366f1"
                                        : "3px solid transparent",
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.02)",
                                      transition: "background 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive)
                                        (
                                          e.currentTarget as HTMLTableRowElement
                                        ).style.backgroundColor =
                                          "rgba(255,255,255,0.04)";
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isActive)
                                        (
                                          e.currentTarget as HTMLTableRowElement
                                        ).style.backgroundColor = "transparent";
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "9px 18px",
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      {turnLabel}
                                    </td>
                                    <td
                                      style={{
                                        padding: "9px 8px",
                                        fontWeight: "600",
                                        color: m.is_user
                                          ? "var(--text-primary)"
                                          : "var(--text-secondary)",
                                      }}
                                    >
                                      {typeof m === "string" ? m : m.san || m}
                                    </td>
                                    <td style={{ padding: "9px 8px" }}>
                                      {stats ? (
                                        <span
                                          style={{
                                            padding: "2px 8px",
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            fontWeight: "700",
                                            backgroundColor: qBg,
                                            color: qColor,
                                            border: `1px solid ${qColor}44`,
                                          }}
                                        >
                                          {stats.quality}
                                        </span>
                                      ) : (
                                        <span
                                          style={{
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          -
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "9px 18px",
                                        color: "var(--text-secondary)",
                                        fontSize: "12px",
                                      }}
                                    >
                                      {stats?.best_move && (
                                        <span
                                          style={{
                                            color: "var(--success)",
                                            display: "block",
                                          }}
                                        >
                                          Best: {stats.best_move}
                                        </span>
                                      )}
                                      {stats?.error_nature && (
                                        <span
                                          style={{
                                            color: "var(--warning)",
                                            display: "block",
                                          }}
                                        >
                                          {stats.error_nature}
                                        </span>
                                      )}
                                      {!stats ||
                                      (!stats.best_move && !stats.error_nature)
                                        ? "-"
                                        : null}
                                    </td>
                                    <td
                                      style={{
                                        padding: "9px 14px",
                                        maxWidth: "200px",
                                      }}
                                    >
                                      {noteAnnotation ? (
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            color: "#a5b4fc",
                                            display: "block",
                                            lineHeight: "1.4",
                                          }}
                                        >
                                          {noteAnnotation.note}
                                        </span>
                                      ) : (
                                        <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "11px" }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              },
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── BLUNDERS & MISTAKES ── */}
                {activeTab === "mistakes" && (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 18px",
                        borderBottom: "1px solid var(--glass-border)",
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      {(
                        [
                          "All",
                          "Blunder",
                          "Mistake",
                          "Inaccuracy",
                        ] as MistakeFilter[]
                      ).map((f) => (
                        <button
                          key={f}
                          onClick={() => setMistakeFilter(f)}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            border: `1px solid ${mistakeFilter === f ? "#6366f1" : "var(--glass-border)"}`,
                            background:
                              mistakeFilter === f
                                ? "rgba(99,102,241,0.1)"
                                : "transparent",
                            color:
                              mistakeFilter === f
                                ? "#6366f1"
                                : "var(--text-secondary)",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "10px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {(() => {
                        const moves: any[] = analysis.move_history || [];
                        const indexed = moves.map(
                          (m: any, originalIdx: number) => ({ m, originalIdx }),
                        );
                        const filtered =
                          mistakeFilter === "All"
                            ? indexed.filter(({ m }) =>
                                ["Blunder", "Mistake", "Inaccuracy"].includes(
                                  m.quality,
                                ),
                              )
                            : indexed.filter(
                                ({ m }) => m.quality === mistakeFilter,
                              );
                        if (!filtered.length)
                          return (
                            <p
                              style={{
                                color: "var(--text-secondary)",
                                textAlign: "center",
                                marginTop: "32px",
                                fontSize: "14px",
                              }}
                            >
                              No{" "}
                              {mistakeFilter === "All"
                                ? "errors"
                                : `${mistakeFilter.toLowerCase()}s`}{" "}
                              found.
                            </p>
                          );
                        return filtered.map(({ m, originalIdx }, i) => (
                          <MistakeCard
                            key={i}
                            move_number={m.move_number}
                            turn_label={m.turn_label}
                            san={m.san}
                            quality={m.quality}
                            cp_loss={m.cp_loss}
                            phase={m.phase}
                            best_move={m.best_move}
                            error_nature={m.error_nature}
                            onClick={() => {
                              const ply = moveHistoryToPly[originalIdx];
                              if (ply != null) goToMove(ply);
                              setActiveTab("moves");
                            }}
                          />
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* ── OPENING ── */}
                {activeTab === "openings" && (
                  <div
                    style={{
                      overflowY: "auto",
                      padding: "18px 22px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    <div
                      style={{
                        padding: "14px",
                        background: "var(--surface-1)",
                        borderRadius: "10px",
                        border: "1px solid var(--glass-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Opening
                      </div>
                      <div style={{ fontSize: "19px", fontWeight: "700" }}>
                        {analysis.opening_name || "Unknown Opening"}
                      </div>
                      {analysis.eco_code && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--accent-color)",
                            marginTop: "4px",
                          }}
                        >
                          ECO: {analysis.eco_code}
                        </div>
                      )}
                    </div>
                    {analysis.opening_moves?.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            marginBottom: "10px",
                          }}
                        >
                          Opening Phase Moves
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                          }}
                        >
                          {analysis.opening_moves.map(
                            (m: string, i: number) => (
                              <span
                                key={i}
                                style={{
                                  padding: "4px 10px",
                                  background: "var(--surface-1)",
                                  border: "1px solid var(--glass-border)",
                                  borderRadius: "6px",
                                  fontSize: "13px",
                                  fontFamily: "monospace",
                                  fontWeight: "600",
                                }}
                              >
                                {Math.floor(i / 2) + 1}
                                {i % 2 === 0 ? "." : "…"} {m}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                    {analysis.opening_recommendation && (
                      <div
                        style={{
                          padding: "14px",
                          background: "rgba(99,102,241,0.05)",
                          border: "1px solid rgba(99,102,241,0.2)",
                          borderRadius: "10px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "700",
                            color: "#6366f1",
                            marginBottom: "6px",
                          }}
                        >
                          Coach&apos;s Opening Note
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.6",
                          }}
                        >
                          {typeof analysis.opening_recommendation === "string"
                            ? analysis.opening_recommendation
                            : analysis.opening_recommendation?.message ||
                              "Study this opening line."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PATTERNS ── */}
                {activeTab === "patterns" && (
                  <div
                    style={{
                      overflowY: "auto",
                      padding: "18px 22px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    {analysis.patterns ? (
                      <>
                        <PatternGrid
                          tactical={
                            analysis.patterns.tactical?.tactical_summary
                          }
                          positional={
                            analysis.patterns.positional?.positional_summary
                          }
                          endgame={analysis.patterns.endgame?.endgame_summary}
                          time_pressure={
                            analysis.patterns.time_pressure
                              ?.time_pressure_summary
                          }
                        />
                        {analysis.patterns.critical_weaknesses?.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                marginBottom: "10px",
                              }}
                            >
                              Critical Weaknesses
                            </div>
                            <ul
                              style={{
                                paddingLeft: "18px",
                                margin: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {analysis.patterns.critical_weaknesses.map(
                                (w: string, i: number) => (
                                  <li
                                    key={i}
                                    style={{
                                      fontSize: "13px",
                                      color: "var(--text-secondary)",
                                      lineHeight: "1.5",
                                    }}
                                  >
                                    {w}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: "14px",
                        }}
                      >
                        Pattern data not available.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="glass"
            style={{
              padding: "32px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            Analysis data is unavailable.
          </div>
        )}
      </main>
    </div>
  );
}
