"use client";
import { useEffect, useState, use, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Loader from "@/components/Loader";
import MistakeCard from "@/components/MistakeCard";
import PatternGrid from "@/components/PatternGrid";
import TimeAnalysisCard from "@/components/TimeAnalysisCard";
import { usePlayer } from "@/contexts/PlayerContext";
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
  RefreshCw,
  FlipVertical2,
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

const BOARD_THEMES: Record<string, { dark: string; light: string; label: string }> = {
  classic:    { dark: "#b58863", light: "#f0d9b5", label: "Classic"    },
  green:      { dark: "#769656", light: "#eeeed2", label: "Green"      },
  mono:       { dark: "#4a4a4a", light: "#e8e8e8", label: "Mono"       },
  ocean:      { dark: "#4870ac", light: "#dae3f5", label: "Ocean"      },
  walnut:     { dark: "#7c3f00", light: "#f5d6a4", label: "Walnut"     },
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

export default function GameAnalysisPage({
  params,
}: {
  params: Promise<{ filename: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = use(params);
  const { filename } = resolvedParams;
  const { activeUsername, coachId, isApproved, loading: playerLoading } = usePlayer();

  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [mistakeFilter, setMistakeFilter] = useState<MistakeFilter>("All");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const { boardTheme, setBoardTheme, multiPv } = useSettings();
  const [themeFlash, setThemeFlash] = useState(false);
  const [manualOrientation, setManualOrientation] = useState<"white" | "black" | null>(null);

  useEffect(() => {
    setManualOrientation(null);
  }, [filename]);

  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [movePairs, setMovePairs] = useState<
    Array<{ from: string; to: string }>
  >([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const activeMoveRef = useRef<HTMLTableRowElement>(null);
  const progressRef = useRef(0);

  // Maps move_history[k] → ply index in fenHistory (fenHistory[0] = start position).
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

  // Maps ply index → { quality, bestMove, topLines } for user moves only.
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

  // Build eval series using win probability (0-100) from the user's perspective.
  const evalSeries = useMemo(() => {
    if (!analysis?.full_history) return [];
    const pts: { ply: number; ev: number; quality?: string; opp_quality?: string; san?: string }[] = [
      { ply: 0, ev: 50 },
    ];
    let userIdx = 0;
    const mh: any[] = analysis.move_history || [];
    (analysis.full_history as any[]).forEach((m, i) => {
      const ply = i + 1;
      const ev = m.win_prob ?? 50;
      const entry: any = { ply, ev };
      if (m.is_user && userIdx < mh.length) {
        const s = mh[userIdx++];
        entry.quality = s.quality;
        entry.san = m.san;
      } else if (!m.is_user) {
        if (m.opp_quality) entry.opp_quality = m.opp_quality;
        entry.san = m.san;
      }
      pts.push(entry);
    });
    return pts;
  }, [analysis]);

  useEffect(() => {
    if (playerLoading) return;
    if (!activeUsername || !isApproved) {
      router.push("/login");
      return;
    }
    if (!filename) return;

    analyzeGame(activeUsername, filename, false, multiPv, (pct) => {
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
        // Always animate to 100% before revealing — gives cached games a quick
        // but visible loading bar instead of an instant flash.
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
  }, [activeUsername, isApproved, playerLoading, filename, router]);

  useEffect(() => {
    if (!filename) return;
    // Fetch all player notes then filter client-side to avoid server-side filename encoding issues
    fetch("/api/player/coach-notes")
      .then((r) => r.json())
      .then(({ notes }) => {
        if (Array.isArray(notes)) {
          let decodedFilename = filename;
          try { decodedFilename = decodeURIComponent(filename); } catch { /* keep original */ }
          const forThisFile = notes.filter(
            (n: any) => n.filename === filename || n.filename === decodedFilename
          );
          if (forThisFile.length) {
            setAnnotations(forThisFile);
            return;
          }
        }
        // Fallback to old route (works when user is a coach reviewing their player's game)
        if (coachId && activeUsername) {
          fetchAnnotations(coachId, activeUsername, filename).then(setAnnotations);
        }
      })
      .catch(() => {
        if (coachId && activeUsername) {
          fetchAnnotations(coachId, activeUsername, filename).then(setAnnotations);
        }
      });
  }, [coachId, activeUsername, filename]);

  useEffect(() => {
    if (!fenHistory.length) return;
    const annotationParam = searchParams.get("annotation");
    if (annotationParam == null) return;
    const plyIdx = parseInt(annotationParam, 10);
    if (!isNaN(plyIdx) && plyIdx >= 0 && plyIdx < fenHistory.length) {
      setCurrentMoveIndex(plyIdx);
      setActiveTab("moves");
    }
  }, [fenHistory, searchParams]);

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

  const [reanalyzing, setReanalyzing] = useState(false);

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

  if (!activeUsername) return null;

  const currentFen = fenHistory[currentMoveIndex] || "start";
  const { whiteCaptured, blackCaptured } = getCapturedPieces(currentFen);

  // Arrow + square highlight + badge for the last played move
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

  // Default to the player's own perspective (their pieces at the bottom); a manual
  // flip overrides this until a different game is loaded (reset above).
  const isUserWhite = analysis?.white_player?.toLowerCase() === activeUsername?.toLowerCase();
  const boardOrientation: "white" | "black" = manualOrientation ?? (isUserWhite ? "white" : "black");

  const badgeSymbol = currentQuality ? BADGE[currentQuality] : undefined;
  const badgePos =
    currentMove?.to && badgeSymbol
      ? (() => {
          const file = currentMove.to.charCodeAt(0) - 97;
          const rank = parseInt(currentMove.to[1]);
          const col = boardOrientation === "white" ? file : 7 - file;
          const row = boardOrientation === "white" ? 8 - rank : rank - 1;
          return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
        })()
      : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "moves", label: "Move List" },
    { id: "mistakes", label: "Blunders & Mistakes" },
    { id: "openings", label: "Opening" },
    { id: "patterns", label: "Patterns" },
  ];

  async function handleReanalyze() {
    if (!activeUsername || !filename) return;
    setReanalyzing(true);
    setAnalysisProgress(0);
    try {
      const data = await analyzeGame(activeUsername, filename, true, multiPv, setAnalysisProgress);
      setAnalysis(data);
      if (data?.full_history) {
        const game = new Chess();
        const fens = [game.fen()];
        const pairs: Array<{ from: string; to: string }> = [];
        for (const move of data.full_history) {
          try {
            const result = game.move(move.san);
            pairs.push(result ? { from: result.from, to: result.to } : { from: "", to: "" });
            fens.push(game.fen());
          } catch {
            pairs.push({ from: "", to: "" });
            fens.push(fens[fens.length - 1]);
          }
        }
        setFenHistory(fens);
        setMovePairs(pairs);
        setCurrentMoveIndex(0);
      }
    } catch (e) {
      console.error(e);
      alert("Re-analysis failed. Please try again.");
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <div
      className="analysis-root"
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
      {/* spacer for floating pill header (12px top + ~52px pill + 12px gap) */}
      <div className="analysis-header-spacer" style={{ height: "76px", flexShrink: 0 }} />

      <main
        className="container animate-fade-in analysis-main-container"
        style={{
          flex: 1,
          minHeight: 0,
          padding: "16px 32px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          maxWidth: "1600px",
          margin: "0 auto",
        }}
      >
        {/* Top bar */}
        <div
          className="analysis-top-bar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="btn btn-secondary analysis-back-btn"
              onClick={() => router.push("/dashboard")}
              style={{ padding: "8px 12px" }}
            >
              <ArrowLeft size={18} /> Back
            </button>
            {analysis && (
              <button
                className="btn btn-secondary"
                onClick={handleReanalyze}
                disabled={reanalyzing}
                style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw
                  size={16}
                  style={reanalyzing ? { animation: "spin 0.8s linear infinite" } : undefined}
                />
                {reanalyzing ? "Re-analyzing…" : "Re-analyze"}
              </button>
            )}
          </div>
          {analysis && (
            <div className="analysis-top-info" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", minWidth: 0, maxWidth: "55%" }}>
              <div className="analysis-game-title" style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}>
                {analysis.white_player} vs {analysis.black_player}
              </div>
              <div className="analysis-accuracy-row" style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "13px", marginRight: "6px" }}>Accuracy</span>
                  <span className="analysis-accuracy-value" style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent-color)" }}>
                    {analysis.game_accuracy}%
                  </span>
                </div>
                <div
                  className="analysis-info-divider"
                  style={{
                    height: "28px",
                    width: "1px",
                    background: "var(--glass-border)",
                    flexShrink: 0,
                  }}
                />
                <div className="analysis-opening-block" style={{ minWidth: 0, maxWidth: "260px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "13px", marginRight: "6px" }}>Opening</span>
                  <span style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    maxWidth: "200px",
                    verticalAlign: "middle",
                  }}>
                    {analysis.opening_name || "Unknown"}
                    {analysis.eco_code ? ` (${analysis.eco_code})` : ""}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <Loader message="Analyzing game with Stockfish… This may take a moment." progress={analysisProgress} />
        ) : analysis ? (
          <div
            className="analysis-main-grid"
            style={{
              gap: "28px",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* LEFT: Chessboard */}
            <div
              className="analysis-board-col"
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Black player info — shown above the board unless the board is flipped */}
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                  padding: "0 4px",
                  order: boardOrientation === "white" ? 0 : 2,
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
                  <span className="analysis-player-name" style={{ fontSize: "14px", fontWeight: "600" }}>
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
                className="analysis-board-fill"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  order: 1,
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
                      boardOrientation,
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

              {/* White player info — shown below the board unless the board is flipped */}
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "6px",
                  padding: "0 4px",
                  order: boardOrientation === "white" ? 2 : 0,
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
                  <span className="analysis-player-name" style={{ fontSize: "14px", fontWeight: "600" }}>
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
                className="glass-card analysis-controls"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  order: 3,
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
                  className="analysis-play-btn"
                  onClick={togglePlay}
                  disabled={fenHistory.length === 0}
                  title={isPlaying ? "Pause" : "Play through game"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
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
                  <span className="analysis-play-label">{isPlaying ? "Pause" : "Play"}</span>
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
                <button
                  className="btn btn-secondary"
                  onClick={() => setManualOrientation(boardOrientation === "white" ? "black" : "white")}
                  title="Flip board"
                >
                  <FlipVertical2 size={18} />
                </button>
              </div>

            </div>

            {/* RIGHT: Tabbed panel */}
            <div
              className="analysis-annotation-col"
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Tab bar */}
              <div style={{ marginBottom: "12px" }}>
                <PillTabs tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id)} />
              </div>

              {/* Coach note for current move — student read-only view */}
              {coachId && activeUsername && (
                <div style={{ flexShrink: 0 }}>
                  <AnnotationPanel
                    mode="student"
                    coachId={coachId}
                    playerUsername={activeUsername}
                    filename={filename}
                    moveIndex={currentMoveIndex}
                    annotations={annotations}
                    onSaved={() => {}}
                    onDeleted={() => {}}
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
                  marginTop: "0",
                }}
              >
                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div
                    style={{
                      overflowY: "auto",
                      padding: "20px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
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
                                <linearGradient id="evalGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="rgba(255,255,255,0.70)" />
                                  <stop offset="45%" stopColor="rgba(255,255,255,0.20)" />
                                  <stop offset="55%" stopColor="rgba(30,30,30,0.20)" />
                                  <stop offset="100%" stopColor="rgba(10,10,10,0.65)" />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="ply" hide />
                              <YAxis domain={[0, 100]} hide />
                              <ReferenceLine y={50} stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="4 3" />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.[0]) return null;
                                  const d = payload[0].payload;
                                  const q = d.quality || d.opp_quality;
                                  return (
                                    <div style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "6px 10px", fontSize: "11px", color: "#fff" }}>
                                      {d.san && <div style={{ fontWeight: 700 }}>{d.san}</div>}
                                      <div style={{ color: q ? QUALITY_COLOR[q] || "var(--text-secondary)" : "var(--text-secondary)" }}>
                                        {q || `Ply ${d.ply}`}
                                      </div>
                                      <div style={{ color: "var(--text-secondary)" }}>Win%: {d.ev.toFixed(1)}%</div>
                                    </div>
                                  );
                                }}
                              />
                              <Area type="monotone" dataKey="ev" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} fill="url(#evalGrad)"
                                dot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  const q = payload.quality || payload.opp_quality;
                                  if (!q) return <g key={props.key} />;
                                  const col = QUALITY_COLOR[q] || "rgba(255,255,255,0.4)";
                                  return <circle key={props.key} cx={cx} cy={cy} r={3.5} fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />;
                                }}
                                activeDot={{ r: 5, fill: "var(--accent-color)" }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Grade + accuracy */}
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
                              width: "64px",
                              height: "64px",
                              borderRadius: "50%",
                              background: `${grade.color}22`,
                              border: `3px solid ${grade.color}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "26px",
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
                                fontSize: "28px",
                                fontWeight: "800",
                                color: "var(--accent-color)",
                              }}
                            >
                              {acc.toFixed(1)}%
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Game Accuracy
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Phase accuracy bars */}
                    {analysis.phase_accuracy && (
                      <div>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            marginBottom: "10px",
                          }}
                        >
                          Phase Accuracy
                        </div>
                        {(["opening", "middlegame", "endgame"] as const).map((phase) => {
                            const val = analysis.phase_accuracy[phase];
                            if (val === undefined) return null;
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
                          })}
                      </div>
                    )}

                    {/* Time analysis */}
                    {analysis.time_analysis && (
                      <div>
                        <div
                          style={{
                            fontSize: "13px",
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

                    {/* Top blunder */}
                    {(() => {
                      const moves: any[] = analysis.move_history || [];
                      const blundersIndexed = moves
                        .map((m: any, idx: number) => ({ m, idx }))
                        .filter(({ m }) => m.quality === "Blunder");
                      if (blundersIndexed.length === 0) return null;
                      const { m: worst, idx: worstIdx } =
                        blundersIndexed.reduce(
                          (best, cur) =>
                            cur.m.cp_loss > best.m.cp_loss ? cur : best,
                          blundersIndexed[0],
                        );
                      return (
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
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
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--glass-border)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <h3 style={{ fontSize: "16px", margin: 0 }}>
                        Moves & Evaluation
                      </h3>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          textAlign: "left",
                          fontSize: "14px",
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
                                padding: "10px 20px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              #
                            </th>
                            <th
                              style={{
                                padding: "10px 8px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Move
                            </th>
                            <th
                              style={{
                                padding: "10px 8px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Quality
                            </th>
                            <th
                              style={{
                                padding: "10px 20px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Details
                            </th>
                            {coachId && (
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
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            onClick={() => goToMove(0)}
                            style={{
                              cursor: "pointer",
                              backgroundColor:
                                currentMoveIndex === 0
                                  ? "rgba(59,130,246,0.15)"
                                  : "transparent",
                              borderLeft:
                                currentMoveIndex === 0
                                  ? "3px solid var(--accent-color)"
                                  : "3px solid transparent",
                              borderBottom: "1px solid rgba(255,255,255,0.02)",
                            }}
                          >
                            <td
                              style={{
                                padding: "10px 20px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              0
                            </td>
                            <td
                              style={{ padding: "10px 8px", fontWeight: "500" }}
                            >
                              Start
                            </td>
                            <td style={{ padding: "10px 8px" }}>-</td>
                            <td style={{ padding: "10px 20px" }}>-</td>
                            {coachId && <td style={{ padding: "10px 14px", textAlign: "center" }}><span style={{ color: "rgba(255,255,255,0.12)", fontSize: "11px" }}>—</span></td>}
                          </tr>
                          {(() => {
                            let userMoveIdx = 0;
                            return (analysis.full_history || []).map(
                              (m: any, i: number) => {
                                const plyIndex = i + 1;
                                const isActive = currentMoveIndex === plyIndex;
                                const isWhiteTurn = i % 2 === 0;
                                const turnNum = Math.floor(i / 2) + 1;
                                const turnLabel = `${turnNum}${isWhiteTurn ? ".W" : ".B"}`;
                                const noteAnnotation =
                                  coachId
                                    ? annotations.find(
                                        (a) => a.move_index === plyIndex,
                                      )
                                    : undefined;
                                let stats: any = null;
                                if (
                                  m.is_user &&
                                  analysis.move_history &&
                                  userMoveIdx < analysis.move_history.length
                                ) {
                                  stats = analysis.move_history[userMoveIdx++];
                                }
                                const oppQuality = !m.is_user ? m.opp_quality : null;
                                const displayQuality = stats?.quality || oppQuality;
                                const qColor = displayQuality
                                  ? QUALITY_COLOR[displayQuality] || "var(--text-secondary)"
                                  : "var(--text-secondary)";
                                const qBg = displayQuality
                                  ? QUALITY_BG[displayQuality] || "transparent"
                                  : "transparent";
                                return (
                                  <tr
                                    key={i}
                                    ref={isActive ? activeMoveRef : null}
                                    onClick={() => goToMove(plyIndex)}
                                    style={{
                                      cursor: "pointer",
                                      backgroundColor: isActive
                                        ? "rgba(59,130,246,0.15)"
                                        : "transparent",
                                      borderLeft: isActive
                                        ? "3px solid var(--accent-color)"
                                        : "3px solid transparent",
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.02)",
                                      transition: "background-color 0.15s",
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
                                        padding: "10px 20px",
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      {turnLabel}
                                    </td>
                                    <td
                                      style={{
                                        padding: "10px 8px",
                                        fontWeight: "600",
                                        color: m.is_user
                                          ? "var(--text-primary)"
                                          : "var(--text-secondary)",
                                      }}
                                    >
                                      {typeof m === "string" ? m : m.san || m}
                                    </td>
                                    <td style={{ padding: "10px 8px" }}>
                                      {displayQuality ? (
                                        <span
                                          style={{
                                            padding: "3px 8px",
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            fontWeight: "700",
                                            backgroundColor: qBg,
                                            color: qColor,
                                            border: `1px solid ${qColor}44`,
                                            opacity: m.is_user ? 1 : 0.7,
                                          }}
                                        >
                                          {displayQuality}
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
                                        padding: "10px 20px",
                                        color: "var(--text-secondary)",
                                        fontSize: "13px",
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
                                    {coachId && (
                                      <td style={{ padding: "10px 14px", maxWidth: "200px" }}>
                                        {noteAnnotation ? (
                                          <div
                                            onClick={(e) => { e.stopPropagation(); goToMove(plyIndex); }}
                                            style={{ display: "flex", alignItems: "flex-start", gap: "6px", cursor: "pointer" }}
                                          >
                                            <span style={{
                                              flexShrink: 0,
                                              marginTop: "3px",
                                              width: "8px",
                                              height: "8px",
                                              borderRadius: "50%",
                                              background: "#1e3a8a",
                                              border: "1.5px solid #3b82f6",
                                              display: "inline-block",
                                              boxShadow: "0 0 5px rgba(59,130,246,0.5)",
                                            }} />
                                            <span style={{ fontSize: "11px", color: "#a5b4fc", lineHeight: "1.4" }}>
                                              {noteAnnotation.note}
                                            </span>
                                          </div>
                                        ) : (
                                          <span style={{ color: "rgba(255,255,255,0.12)", fontSize: "11px" }}>—</span>
                                        )}
                                      </td>
                                    )}
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
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--glass-border)",
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
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
                            border: `1px solid ${mistakeFilter === f ? "var(--accent-color)" : "var(--glass-border)"}`,
                            background:
                              mistakeFilter === f
                                ? "rgba(29,193,137,0.1)"
                                : "transparent",
                            color:
                              mistakeFilter === f
                                ? "var(--accent-color)"
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
                        padding: "12px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {(() => {
                        const moves: any[] = analysis.move_history || [];
                        // Keep original index so we can look up the ply via moveHistoryToPly
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
                        if (filtered.length === 0)
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
                      padding: "20px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                    }}
                  >
                    <div
                      style={{
                        padding: "16px",
                        background: "var(--surface-1)",
                        borderRadius: "10px",
                        border: "1px solid var(--glass-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Opening
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: "700" }}>
                        {analysis.opening_name || "Unknown Opening"}
                      </div>
                      {analysis.eco_code && (
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--accent-color)",
                            marginTop: "4px",
                          }}
                        >
                          ECO: {analysis.eco_code}
                        </div>
                      )}
                    </div>

                    {analysis.opening_moves &&
                      analysis.opening_moves.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
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
                          padding: "16px",
                          background: "rgba(29,193,137,0.05)",
                          border: "1px solid rgba(29,193,137,0.2)",
                          borderRadius: "10px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "700",
                            color: "var(--accent-color)",
                            marginBottom: "8px",
                          }}
                        >
                          Coach&apos;s Opening Note
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "14px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.6",
                          }}
                        >
                          {typeof analysis.opening_recommendation === "string"
                            ? analysis.opening_recommendation
                            : analysis.opening_recommendation?.message ||
                              "Keep studying this opening line."}
                        </p>
                      </div>
                    )}

                    {(!analysis.opening_moves ||
                      analysis.opening_moves.length === 0) &&
                      !analysis.opening_recommendation && (
                        <p
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: "14px",
                          }}
                        >
                          Opening details are not available for this game.
                        </p>
                      )}
                  </div>
                )}

                {/* ── PATTERNS ── */}
                {activeTab === "patterns" && (
                  <div
                    style={{
                      overflowY: "auto",
                      padding: "20px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
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
                                fontSize: "13px",
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
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                                margin: 0,
                              }}
                            >
                              {analysis.patterns.critical_weaknesses.map(
                                (w: string, i: number) => (
                                  <li
                                    key={i}
                                    style={{
                                      fontSize: "14px",
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
                        Pattern data not available for this game.
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
