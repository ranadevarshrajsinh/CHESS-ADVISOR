"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Chessboard } from "react-chessboard";
import Header from "@/components/Header";
import { usePlayer } from "@/contexts/PlayerContext";
import { useDrillEngine } from "@/hooks/useDrillEngine";
import {
  DRILL_OPENINGS,
  OPENING_CATEGORIES,
  type DrillOpening,
} from "@/data/drill-openings";

// ─── types ───────────────────────────────────────────────────────────────────

type UserColor = "white" | "black";
type DrillPhase = "setup" | "starting" | "playing" | "gameover";
type GameResult = "win" | "loss" | "draw" | "resign";

interface SessionStats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  streakType: "win" | "loss" | null;
}

// ─── ELO presets ─────────────────────────────────────────────────────────────

const ELO_PRESETS = [
  { label: "Beginner", elo: 800 },
  { label: "Club",     elo: 1200 },
  { label: "Strong",   elo: 1500 },
  { label: "Expert",   elo: 1800 },
  { label: "Master",   elo: 2200 },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildOpeningPosition(opening: DrillOpening): { fen: string; uciMoves: string[] } | null {
  const chess = new Chess();
  const uciMoves: string[] = [];
  for (const san of opening.moves) {
    try {
      const move = chess.move(san);
      if (!move) return null;
      uciMoves.push(move.from + move.to + (move.promotion ?? ""));
    } catch { return null; }
  }
  return { fen: chess.fen(), uciMoves };
}

function uciToMove(fen: string, uci: string) {
  const from = uci.slice(0, 2);
  const to   = uci.slice(2, 4);
  const promotion = uci[4] || undefined;
  return new Chess(fen).move({ from, to, promotion } as any);
}

function isPromotion(chess: Chess, from: string, to: string): boolean {
  const piece = chess.get(from as any);
  return (
    piece?.type === "p" &&
    ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"))
  );
}

function resultLabel(result: GameResult): { text: string; color: string } {
  if (result === "win")    return { text: "You Won",  color: "#22c55e" };
  if (result === "loss")   return { text: "You Lost", color: "#ef4444" };
  if (result === "resign") return { text: "Resigned", color: "#94a3b8" };
  return                          { text: "Draw",     color: "#eab308" };
}

// ─── Opening card ─────────────────────────────────────────────────────────────

function OpeningCard({
  opening, selected, recommended, winRate, onClick,
}: {
  opening: DrillOpening;
  selected: boolean;
  recommended?: boolean;
  winRate?: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const firstFour = opening.moves.slice(0, 4).join(", ");
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: "10px",
        border: `2px solid ${selected ? "var(--accent-color)" : hovered ? "#3a3a3a" : "var(--glass-border)"}`,
        background: selected
          ? "rgba(var(--accent-rgb,29,193,137),0.10)"
          : hovered ? "var(--surface-2)" : "var(--surface-1)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        width: "100%",
        position: "relative",
      }}
    >
      {recommended && (
        <span style={{
          position: "absolute", top: "8px", right: "10px",
          fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)",
          background: "var(--surface-2)", padding: "1px 7px", borderRadius: "20px",
          border: "1px solid var(--glass-border)", textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          Weak spot
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", fontFamily: "monospace" }}>
          {opening.eco}
        </span>
        {winRate !== undefined && (
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            {Math.round(winRate * 100)}% wins
          </span>
        )}
      </div>
      <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "4px", lineHeight: 1.3 }}>
        {opening.name}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
        {firstFour}…
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OpeningDrillPage() {
  const router = useRouter();
  const { activeUsername, activePlatform, isApproved, loading: playerLoading } = usePlayer();
  const engine = useDrillEngine();

  // ── Setup state
  const [selectedOpening, setSelectedOpening] = useState<DrillOpening | null>(null);
  const [userColor,       setUserColor]        = useState<UserColor>("white");
  const [targetElo,       setTargetElo]        = useState(1200);
  const [category,        setCategory]         = useState<string>("All");
  const [search,          setSearch]           = useState("");
  const [recommendations, setRecommendations]  = useState<{ opening: DrillOpening; winRate: number }[]>([]);
  const [enableTakeback,  setEnableTakeback]   = useState(false);
  const [enableHint,      setEnableHint]       = useState(false);

  // ── Game state
  const [phase,          setPhase]          = useState<DrillPhase>("setup");
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const [fen,            setFen]            = useState(START_FEN);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [lastMove,       setLastMove]       = useState<{ from: string; to: string } | null>(null);
  const [gameResult,     setGameResult]     = useState<GameResult | null>(null);
  const [statusMsg,      setStatusMsg]      = useState("");
  const [stats,          setStats]          = useState<SessionStats>({ wins: 0, losses: 0, draws: 0, streak: 0, streakType: null });
  const [moveLog,        setMoveLog]        = useState<{ san: string; byUser: boolean }[]>([]);
  const [hintArrow,      setHintArrow]      = useState<{ from: string; to: string } | null>(null);
  const [isHinting,      setIsHinting]      = useState(false);

  // Internal refs
  const chessRef            = useRef(new Chess());
  const uciHistRef          = useRef<string[]>([]);
  const openingFenRef       = useRef(START_FEN);
  const openingMoveCountRef = useRef(0);
  const selectedOpeningRef  = useRef<DrillOpening | null>(null);
  const userColorRef        = useRef<UserColor>("white");
  const targetEloRef        = useRef(1200);
  const activeUsernameRef    = useRef("");
  const completedGameRef    = useRef<{
    sanHistory: string[];
    openingMoveCount: number;
    opening: DrillOpening | null;
    userColor: UserColor;
    targetElo: number;
    username: string;
  } | null>(null);

  // ── Analysis state
  const [gameAnalysis, setGameAnalysis] = useState<{
    accuracy: number;
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    userMoves: { san: string; quality: string; cpLoss: number; bestSan: string | null; moveNum: number }[];
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // ── Category counts (computed once from static data)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: DRILL_OPENINGS.length };
    for (const o of DRILL_OPENINGS) {
      counts[o.category] = (counts[o.category] || 0) + 1;
    }
    return counts;
  }, []);

  // ── Keep refs in sync
  useEffect(() => { selectedOpeningRef.current = selectedOpening; }, [selectedOpening]);
  useEffect(() => { userColorRef.current = userColor; },           [userColor]);
  useEffect(() => { targetEloRef.current = targetElo; },           [targetElo]);
  useEffect(() => { activeUsernameRef.current = activeUsername || ""; }, [activeUsername]);

  // ── Auth guard
  useEffect(() => {
    if (playerLoading) return;
    if (!activeUsername || !isApproved) router.push("/login");
  }, [activeUsername, isApproved, playerLoading, router]);

  // ── Initialize engine on mount and when ELO changes
  useEffect(() => {
    if (!activeUsername) return;
    engine.init(targetElo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUsername, targetElo]);

  // ── Pull opening recommendations from report
  useEffect(() => {
    if (!activeUsername) return;
    fetch(`/api/report/${activeUsername}?platform=${activePlatform}`)
      .then((r) => r.json())
      .then((data) => {
        const byOpening: any[] = data?.openings?.performance?.by_opening ?? [];
        const weak = byOpening
          .filter((o) => o.games >= 2 && (o.win_rate ?? 1) < 0.45)
          .sort((a, b) => (a.win_rate ?? 0) - (b.win_rate ?? 0))
          .slice(0, 6);
        const matched: { opening: DrillOpening; winRate: number }[] = [];
        for (const w of weak) {
          const name: string = (w.opening || "").toLowerCase();
          const drill = DRILL_OPENINGS.find((d) => {
            const dName = d.name.toLowerCase();
            const key   = dName.split(",")[0];
            return name.includes(key) || key.split(" ").some((word) => word.length > 4 && name.includes(word));
          });
          if (drill && !matched.find((m) => m.opening.eco === drill.eco)) {
            matched.push({ opening: drill, winRate: w.win_rate ?? 0 });
          }
          if (matched.length >= 3) break;
        }
        setRecommendations(matched);
      })
      .catch(() => {});
  }, [activeUsername, activePlatform]);

  // ── Filtered opening list
  const visibleOpenings = DRILL_OPENINGS.filter((o) => {
    if (category !== "All" && o.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q);
    }
    return true;
  });

  // ── End game helper
  const endGame = useCallback((result: GameResult) => {
    completedGameRef.current = {
      sanHistory:       chessRef.current.history(),
      openingMoveCount: openingMoveCountRef.current,
      opening:          selectedOpeningRef.current,
      userColor:        userColorRef.current,
      targetElo:        targetEloRef.current,
      username:         activeUsernameRef.current,
    };
    setGameResult(result);
    setPhase("gameover");
    setStatusMsg("");
    setGameAnalysis(null);
    setAnalyzing(false);
    setStats((prev) => {
      const isWin  = result === "win";
      const isLoss = result === "loss" || result === "resign";
      const isDraw = result === "draw";
      const sameStreak =
        (isWin && prev.streakType === "win") || (isLoss && prev.streakType === "loss");
      return {
        wins:       prev.wins   + (isWin  ? 1 : 0),
        losses:     prev.losses + (isLoss ? 1 : 0),
        draws:      prev.draws  + (isDraw ? 1 : 0),
        streak:     sameStreak ? prev.streak + 1 : 1,
        streakType: isWin ? "win" : isLoss ? "loss" : null,
      };
    });
  }, []);

  // ── Engine reply
  const askEngine = useCallback(async (chess: Chess, uciHistory: string[], openingFen: string) => {
    setStatusMsg("Engine thinking…");
    const move = await engine.getMove(openingFen, uciHistory);
    if (!move) return;
    const result = uciToMove(chess.fen(), move);
    if (!result) return;
    chess.move(result);
    const newHist = [...uciHistory, result.from + result.to + (result.promotion ?? "")];
    uciHistRef.current = newHist;
    setFen(chess.fen());
    setLastMove({ from: result.from, to: result.to });
    setSelectedSquare(null);
    setMoveLog((prev) => [...prev, { san: result.san, byUser: false }]);
    if (chess.isCheckmate())     { setStatusMsg("Checkmate!"); endGame("loss"); }
    else if (chess.isDraw())     { setStatusMsg("Draw!");      endGame("draw"); }
    else                           setStatusMsg("Your turn");
  }, [engine, endGame]);

  // ── Apply a user move
  const applyUserMove = useCallback(async (from: string, to: string) => {
    const chess = chessRef.current;
    const promotion = isPromotion(chess, from, to) ? "q" : undefined;
    let result;
    try { result = chess.move({ from, to, promotion } as any); } catch { return false; }
    if (!result) return false;
    const newHist = [...uciHistRef.current, result.from + result.to + (result.promotion ?? "")];
    uciHistRef.current = newHist;
    setFen(chess.fen());
    setLastMove({ from: result.from, to: result.to });
    setSelectedSquare(null);
    setHintArrow(null);
    setMoveLog((prev) => [...prev, { san: result.san, byUser: true }]);
    if (chess.isCheckmate()) { setStatusMsg("Checkmate!"); endGame("win");  return true; }
    if (chess.isDraw())      { setStatusMsg("Draw!");      endGame("draw"); return true; }
    await askEngine(chess, newHist, openingFenRef.current);
    return true;
  }, [askEngine, endGame]);

  // ── Start drill
  const startDrill = useCallback(async () => {
    if (!selectedOpening) return;
    const pos = buildOpeningPosition(selectedOpening);
    if (!pos) return;
    setPhase("starting");
    setGameResult(null);
    setLastMove(null);
    setSelectedSquare(null);
    setMoveLog([]);
    setHintArrow(null);
    const chess = new Chess();
    chessRef.current = chess;
    uciHistRef.current = [];
    openingFenRef.current = START_FEN;
    setFen(START_FEN);
    for (const san of selectedOpening.moves) {
      await new Promise<void>((r) => setTimeout(r, 380));
      const move = chess.move(san);
      if (!move) break;
      setFen(chess.fen());
      setLastMove({ from: move.from, to: move.to });
    }
    openingFenRef.current = chess.fen();
    openingMoveCountRef.current = chess.history().length;
    setPhase("playing");
    const engineTurn = (chess.turn() === "w") === (userColor === "black");
    if (engineTurn) await askEngine(chess, [], chess.fen());
    else            setStatusMsg("Your turn");
  }, [selectedOpening, userColor, askEngine]);

  // ── Board interaction
  const legalSquares = useCallback((): string[] => {
    if (!selectedSquare || phase !== "playing") return [];
    const chess = chessRef.current;
    const userTurn = (chess.turn() === "w") === (userColor === "white");
    if (!userTurn) return [];
    return chess.moves({ square: selectedSquare as any, verbose: true }).map((m: any) => m.to);
  }, [selectedSquare, phase, userColor]);

  const handleSquareClick = useCallback(
    async ({ square }: { piece: { pieceType: string } | null; square: string }) => {
      if (phase !== "playing") return;
      const chess    = chessRef.current;
      const userTurn = (chess.turn() === "w") === (userColor === "white");
      if (!userTurn) return;
      if (selectedSquare) {
        const legal = chess.moves({ square: selectedSquare as any, verbose: true });
        if (legal.some((m: any) => m.to === square)) { await applyUserMove(selectedSquare, square); return; }
      }
      const p        = chess.get(square as any);
      const ownColor = userColor === "white" ? "w" : "b";
      if (p && p.color === ownColor) setSelectedSquare(square);
      else                           setSelectedSquare(null);
    },
    [phase, userColor, selectedSquare, applyUserMove],
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: {
      piece: { isSparePiece: boolean; position: string; pieceType: string };
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (phase !== "playing" || !targetSquare) return false;
      const userTurn = (chessRef.current.turn() === "w") === (userColor === "white");
      if (!userTurn) return false;
      applyUserMove(sourceSquare, targetSquare);
      return true;
    },
    [phase, userColor, applyUserMove],
  );

  // ── Takeback
  const takeBack = useCallback(() => {
    const chess = chessRef.current;
    if (chess.history().length - openingMoveCountRef.current < 2) return;
    chess.undo();
    chess.undo();
    uciHistRef.current = uciHistRef.current.slice(0, -2);
    const vh   = chess.history({ verbose: true }) as any[];
    const prev = vh[vh.length - 1];
    setLastMove(prev ? { from: prev.from, to: prev.to } : null);
    setFen(chess.fen());
    setSelectedSquare(null);
    setHintArrow(null);
    setMoveLog((log) => log.slice(0, -2));
    setStatusMsg("Your turn");
  }, []);

  // ── Hint
  const requestHint = useCallback(async () => {
    if (engine.status !== "ready" || phase !== "playing") return;
    setIsHinting(true);
    const uciMove = await engine.getMove(openingFenRef.current, uciHistRef.current);
    if (uciMove) setHintArrow({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4) });
    setIsHinting(false);
  }, [engine, phase]);

  // ── Download PGN
  const downloadPGN = useCallback(() => {
    const data = completedGameRef.current;
    if (!data) return;
    const { sanHistory, opening, userColor: uc, targetElo: elo, username } = data;
    const resultStr =
      gameResult === "win"    ? (uc === "white" ? "1-0" : "0-1")
      : gameResult === "loss"   ? (uc === "white" ? "0-1" : "1-0")
      : gameResult === "resign" ? (uc === "white" ? "0-1" : "1-0")
      : "1/2-1/2";
    const whiteName  = uc === "white" ? username : `Stockfish (${elo})`;
    const blackName  = uc === "black" ? username : `Stockfish (${elo})`;
    const date       = new Date().toISOString().split("T")[0].replace(/-/g, ".");
    const moveTokens: string[] = [];
    for (let i = 0; i < sanHistory.length; i++) {
      if (i % 2 === 0) moveTokens.push(`${Math.floor(i / 2) + 1}.`);
      moveTokens.push(sanHistory[i]);
    }
    const pgn = [
      `[Event "Opening Drill - ${opening?.name ?? "Unknown"}"]`,
      `[Site "Chess Advisor"]`,
      `[Date "${date}"]`,
      `[White "${whiteName}"]`,
      `[Black "${blackName}"]`,
      `[Result "${resultStr}"]`,
      `[Opening "${opening?.name ?? ""}"]`,
      `[ECO "${opening?.eco ?? ""}"]`,
      "",
      `${moveTokens.join(" ")} ${resultStr}`,
    ].join("\n");
    const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `drill-${opening?.eco ?? "game"}-${date}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [gameResult]);

  // ── WASM analysis
  const analyzeGame = useCallback(async () => {
    const data = completedGameRef.current;
    if (!data || analyzing) return;
    setAnalyzing(true);
    setGameAnalysis(null);
    const { sanHistory, openingMoveCount, userColor: uc } = data;
    const replayChess = new Chess();
    const userMoves: { san: string; quality: string; cpLoss: number; bestSan: string | null; moveNum: number }[] = [];
    let totalScore = 0, blunders = 0, mistakes = 0, inaccuracies = 0;
    for (let i = 0; i < sanHistory.length; i++) {
      const san        = sanHistory[i];
      const isOpening  = i < openingMoveCount;
      const isUserTurn = (replayChess.turn() === "w") === (uc === "white");
      if (!isOpening && isUserTurn) {
        const beforeFen  = replayChess.fen();
        const evalBefore = await engine.getEval(beforeFen);
        const E1         = Math.max(-2000, Math.min(2000, evalBefore?.score ?? 0));
        const bestUci    = evalBefore?.bestMove;
        const moveResult = replayChess.move(san);
        if (!moveResult) break;
        const evalAfter = await engine.getEval(replayChess.fen());
        const E2        = Math.max(-2000, Math.min(2000, evalAfter?.score ?? 0));
        const cpLoss    = Math.max(0, E1 + E2);
        let bestSan: string | null = null;
        if (bestUci) {
          try {
            const tmp = new Chess(beforeFen);
            const bm  = tmp.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] || undefined } as any);
            if (bm && bm.san !== moveResult.san) bestSan = bm.san;
          } catch {}
        }
        const quality =
          cpLoss < 5   ? "Best"
          : cpLoss < 20  ? "Excellent"
          : cpLoss < 50  ? "Good"
          : cpLoss < 100 ? "Inaccuracy"
          : cpLoss < 200 ? "Mistake"
          : "Blunder";
        if (quality === "Blunder")    blunders++;
        else if (quality === "Mistake")    mistakes++;
        else if (quality === "Inaccuracy") inaccuracies++;
        totalScore += Math.max(0, 100 * Math.exp(-0.003 * cpLoss));
        userMoves.push({ san: moveResult.san, quality, cpLoss: Math.round(cpLoss), bestSan, moveNum: Math.floor(i / 2) + 1 });
      } else {
        replayChess.move(san);
      }
    }
    setGameAnalysis({
      accuracy: userMoves.length > 0 ? Math.round(totalScore / userMoves.length) : 100,
      blunders, mistakes, inaccuracies, userMoves,
    });
    setAnalyzing(false);
  }, [analyzing, engine]);

  // ── Square highlight styles
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { background: "rgba(255,255,0,0.25)" };
    squareStyles[lastMove.to]   = { background: "rgba(255,255,0,0.40)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { background: "rgba(100,200,100,0.55)" };
    for (const sq of legalSquares()) {
      const hasEnemy = !!chessRef.current.get(sq as any);
      squareStyles[sq] = hasEnemy
        ? { background: "rgba(239,68,68,0.45)" }
        : { background: "radial-gradient(circle, rgba(0,0,0,0.22) 28%, transparent 28%)" };
    }
  }

  const engineReady       = engine.status === "ready" || engine.status === "thinking";
  const isEngineThinking  = engine.status === "thinking";

  if (!activeUsername) return null;

  // ─── PLAYING / STARTING / GAMEOVER ───────────────────────────────────────────
  if (phase === "playing" || phase === "gameover" || phase === "starting") {
    const rl          = gameResult ? resultLabel(gameResult) : null;
    const canTakeback = chessRef.current.history().length - openingMoveCountRef.current >= 2;

    // Build PGN-style paired move rows
    const pgnRows: { num: number; white: string; black: string | null }[] = [];
    for (let i = 0; i < moveLog.length; i += 2) {
      pgnRows.push({
        num:   i / 2 + 1,
        white: moveLog[i]?.san ?? "",
        black: moveLog[i + 1]?.san ?? null,
      });
    }

    return (
      <>
        <Header />
        <main
          className="container animate-fade-in page-content-mobile"
          style={{ paddingTop: "24px", paddingBottom: "60px" }}
        >
          {/* Back + opening name */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <button
              onClick={() => { setPhase("setup"); setFen(START_FEN); chessRef.current = new Chess(); }}
              style={{
                background: "none", border: "1px solid var(--glass-border)", borderRadius: "8px",
                padding: "6px 12px", cursor: "pointer", color: "var(--text-secondary)",
                fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <ArrowLeft size={14} /> Back to Setup
            </button>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "-0.01em" }}>
              {selectedOpening?.name}
            </h2>
          </div>

          <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Board + status + session strip */}
            <div style={{ flex: "0 0 auto", width: "min(460px, 100%)" }}>
              <Chessboard
                options={{
                  position:           fen,
                  boardOrientation:   userColor,
                  allowDragging:      phase === "playing" && !isEngineThinking && !isHinting,
                  allowDrawingArrows: false,
                  squareStyles,
                  arrows: hintArrow
                    ? [{ startSquare: hintArrow.from, endSquare: hintArrow.to, color: "rgba(34,197,94,0.8)" }]
                    : undefined,
                  onPieceDrop:        handlePieceDrop,
                  onSquareClick:      handleSquareClick,
                  animationDurationInMs: 300,
                  boardStyle: { borderRadius: "8px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.25)" },
                }}
              />

              {/* Status bar */}
              <div style={{
                marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
                background: "var(--surface-1)", border: "1px solid var(--glass-border)",
                display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px",
              }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  {isEngineThinking
                    ? <><Loader2 size={13} className="animate-spin" /> Engine thinking…</>
                    : statusMsg}
                </span>
                <span style={{
                  fontSize: "11px", padding: "2px 10px", borderRadius: "12px",
                  background: "rgba(var(--accent-rgb,29,193,137),0.12)",
                  color: "var(--accent-color)", fontWeight: "700",
                }}>
                  ELO {targetElo}
                </span>
              </div>

              {/* Session stats strip — below status bar */}
              <div style={{ marginTop: "10px", display: "flex", gap: "18px", padding: "0 2px", fontSize: "12px" }}>
                <span>
                  <span style={{ color: "#22c55e", fontWeight: "700" }}>{stats.wins}</span>
                  {" "}<span style={{ color: "var(--text-secondary)" }}>W</span>
                </span>
                <span>
                  <span style={{ color: "#ef4444", fontWeight: "700" }}>{stats.losses}</span>
                  {" "}<span style={{ color: "var(--text-secondary)" }}>L</span>
                </span>
                <span>
                  <span style={{ color: "#eab308", fontWeight: "700" }}>{stats.draws}</span>
                  {" "}<span style={{ color: "var(--text-secondary)" }}>D</span>
                </span>
                {stats.streak > 1 && (
                  <span style={{ color: stats.streakType === "win" ? "#22c55e" : "#ef4444" }}>
                    {stats.streak}× {stats.streakType} streak
                  </span>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "14px", minWidth: "180px" }}>

              {/* Result banner */}
              {phase === "gameover" && rl && (
                <div style={{
                  padding: "20px", borderRadius: "10px",
                  border: `1px solid ${rl.color}44`, background: `${rl.color}0d`, textAlign: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                    <span style={{
                      width: "10px", height: "10px", borderRadius: "50%",
                      background: rl.color, display: "inline-block", flexShrink: 0,
                    }} />
                    <div style={{ fontSize: "22px", fontWeight: "800", color: rl.color }}>{rl.text}</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
                    <button
                      onClick={startDrill}
                      style={{ padding: "10px", borderRadius: "8px", border: "none", background: "var(--accent-color)", color: "#fff", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}
                    >
                      Play Again
                    </button>
                    <button
                      onClick={() => { setPhase("setup"); setFen(START_FEN); chessRef.current = new Chess(); }}
                      style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--glass-border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: "13px" }}
                    >
                      New Opening
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    <button
                      onClick={downloadPGN}
                      style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid var(--glass-border)", background: "var(--surface-1)", color: "var(--text-primary)", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                    >
                      Save PGN
                    </button>
                    <button
                      onClick={analyzeGame}
                      disabled={analyzing || isEngineThinking}
                      style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid var(--glass-border)", background: analyzing ? "var(--surface-2)" : "var(--surface-1)", color: analyzing ? "var(--text-secondary)" : "var(--text-primary)", cursor: analyzing ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "600", opacity: analyzing ? 0.6 : 1 }}
                    >
                      {analyzing ? "Analyzing…" : "Analyze"}
                    </button>
                  </div>

                  {gameAnalysis && (
                    <div style={{ marginTop: "14px", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        <div style={{
                          fontSize: "28px", fontWeight: "900",
                          color: gameAnalysis.accuracy >= 85 ? "#22c55e" : gameAnalysis.accuracy >= 65 ? "#f59e0b" : "#ef4444",
                        }}>
                          {gameAnalysis.accuracy}%
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-primary)" }}>Accuracy</div>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            {gameAnalysis.blunders}B · {gameAnalysis.mistakes}M · {gameAnalysis.inaccuracies}I
                          </div>
                        </div>
                      </div>
                      <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {gameAnalysis.userMoves.map((m, i) => {
                          const qColor =
                            m.quality === "Best" || m.quality === "Excellent" ? "#22c55e"
                            : m.quality === "Good"        ? "#94a3b8"
                            : m.quality === "Inaccuracy"  ? "#f59e0b"
                            : m.quality === "Mistake"     ? "#f97316"
                            : "#ef4444";
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", borderRadius: "5px", background: "var(--surface-1)", fontSize: "12px" }}>
                              <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                                {m.moveNum}{completedGameRef.current?.userColor === "white" ? "." : "…"} {m.san}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {m.bestSan && <span style={{ color: "#22c55e", fontSize: "11px" }}>→ {m.bestSan}</span>}
                                <span style={{ fontWeight: "700", color: qColor, fontSize: "11px" }}>{m.quality}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Playing info + controls */}
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: phase === "playing" && (enableTakeback || enableHint) ? "12px" : "0" }}>
                  Playing as{" "}
                  <span style={{ color: "var(--accent-color)", fontWeight: "700", textTransform: "capitalize" }}>{userColor}</span>
                </div>
                {phase === "playing" && (enableTakeback || enableHint) && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {enableTakeback && (
                      <button
                        onClick={takeBack}
                        disabled={!canTakeback}
                        style={{
                          flex: 1, padding: "8px 6px", borderRadius: "8px",
                          border: "1px solid var(--glass-border)", background: "var(--surface-2)",
                          color: canTakeback ? "var(--text-primary)" : "var(--text-secondary)",
                          cursor: canTakeback ? "pointer" : "not-allowed",
                          fontSize: "12px", fontWeight: "600", opacity: canTakeback ? 1 : 0.45, minWidth: "80px",
                        }}
                      >
                        Takeback
                      </button>
                    )}
                    {enableHint && (
                      <button
                        onClick={requestHint}
                        disabled={engine.status !== "ready" || isHinting}
                        style={{
                          flex: 1, padding: "8px 6px", borderRadius: "8px",
                          border: "1px solid var(--glass-border)", background: "var(--surface-2)",
                          color: "var(--text-primary)",
                          cursor: engine.status !== "ready" || isHinting ? "not-allowed" : "pointer",
                          fontSize: "12px", fontWeight: "600",
                          opacity: engine.status !== "ready" || isHinting ? 0.45 : 1, minWidth: "80px",
                        }}
                      >
                        {isHinting ? "…" : "Hint"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Move log — PGN-style paired rows */}
              {pgnRows.length > 0 && (
                <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "14px 16px" }}>
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    {pgnRows.map((row) => (
                      <div
                        key={row.num}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "22px 1fr 1fr",
                          gap: "4px",
                          alignItems: "center",
                          padding: "3px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {row.num}.
                        </span>
                        <span style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--text-primary)", fontWeight: "500" }}>
                          {row.white}
                        </span>
                        <span style={{ fontFamily: "monospace", fontSize: "13px", color: row.black ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "500" }}>
                          {row.black ?? ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resign */}
              {phase === "playing" && (
                <button
                  onClick={() => endGame("resign")}
                  style={{
                    padding: "10px", borderRadius: "8px",
                    border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)",
                    color: "#ef4444", cursor: "pointer", fontSize: "13px", fontWeight: "600",
                  }}
                >
                  Resign
                </button>
              )}
            </div>
          </div>
        </main>
      </>
    );
  }

  // ─── SETUP ────────────────────────────────────────────────────────────────
  return (
    <>
      <Header />
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "36px", paddingBottom: "60px" }}
      >
        {/* Back link */}
        <Link
          href="/training-plan"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px", textDecoration: "none" }}
        >
          <ArrowLeft size={14} /> Training
        </Link>

        {/* Page header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "30px", marginBottom: "6px", letterSpacing: "-0.02em" }}>Opening Drill</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "15px" }}>
            Pick an opening, set the difficulty, and practice against Stockfish in your browser — no server costs, unlimited games.
          </p>
        </div>

        {/* Weak spots — muted label, no red eyebrow */}
        {recommendations.length > 0 && (
          <div style={{
            background: "var(--surface-1)", border: "1px solid var(--glass-border)",
            borderRadius: "8px", padding: "14px 18px", marginBottom: "20px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: "500", color: "var(--text-secondary)", marginBottom: "10px" }}>
              Drill these first — your weakest openings
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {recommendations.map(({ opening, winRate }) => (
                <button
                  key={opening.eco}
                  onClick={() => setSelectedOpening(opening)}
                  style={{
                    padding: "6px 14px", borderRadius: "20px",
                    border: `1px solid ${selectedOpening?.eco === opening.eco ? "var(--accent-color)" : "var(--glass-border)"}`,
                    background: selectedOpening?.eco === opening.eco ? "rgba(var(--accent-rgb,29,193,137),0.10)" : "transparent",
                    color: selectedOpening?.eco === opening.eco ? "var(--accent-color)" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: "13px", fontWeight: "500",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                >
                  {opening.name.split(",")[0]} · {Math.round(winRate * 100)}% wins
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>

          {/* Left: Search + Category filters + Opening grid */}
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <Search
                size={15}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search openings…"
                style={{
                  width: "100%", padding: "10px 12px 10px 36px",
                  borderRadius: "8px", border: "1px solid var(--glass-border)",
                  background: "var(--surface-1)", color: "var(--text-primary)",
                  fontSize: "14px", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Category chips with counts */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
              {OPENING_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: "4px 12px", borderRadius: "20px", fontSize: "12px",
                    fontWeight: category === cat ? "700" : "500",
                    border: `1px solid ${category === cat ? "var(--accent-color)" : "var(--glass-border)"}`,
                    background: category === cat ? "var(--accent-color)" : "transparent",
                    color: category === cat ? "#fff" : "var(--text-secondary)",
                    cursor: "pointer", transition: "border-color 0.15s, background 0.15s, color 0.15s",
                  }}
                >
                  {cat} · {categoryCounts[cat] ?? 0}
                </button>
              ))}
            </div>

            {/* Opening grid — fills viewport height */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "10px",
              maxHeight: "calc(100vh - 280px)",
              overflowY: "auto",
              paddingRight: "4px",
            }}>
              {visibleOpenings.length === 0 ? (
                <div style={{ gridColumn: "1/-1", padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                  No openings match "{search}"
                </div>
              ) : (
                visibleOpenings.map((o) => {
                  const rec = recommendations.find((r) => r.opening.eco === o.eco);
                  return (
                    <OpeningCard
                      key={o.eco}
                      opening={o}
                      selected={selectedOpening?.eco === o.eco}
                      recommended={!!rec}
                      winRate={rec?.winRate}
                      onClick={() => setSelectedOpening(o)}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Settings sidebar — sticky so it stays in view while scrolling openings */}
          <div style={{
            flex: "0 0 300px",
            position: "sticky",
            top: "96px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}>

            {/* Play As — no eyebrow label */}
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "16px 18px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                {(["white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setUserColor(c)}
                    style={{
                      flex: 1, padding: "12px", borderRadius: "8px",
                      border: `2px solid ${userColor === c ? "var(--accent-color)" : "var(--glass-border)"}`,
                      background: userColor === c ? "rgba(var(--accent-rgb,29,193,137),0.12)" : "var(--surface-2)",
                      cursor: "pointer", fontSize: "22px",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    title={c}
                  >
                    {c === "white" ? "♔" : "♚"}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                {userColor}
              </div>
            </div>

            {/* Engine Difficulty — no giant accent ELO number, show inline */}
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "16px 18px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                {ELO_PRESETS.map(({ label, elo }) => (
                  <button
                    key={elo}
                    onClick={() => setTargetElo(elo)}
                    style={{
                      padding: "4px 10px", borderRadius: "14px", fontSize: "11px",
                      fontWeight: targetElo === elo ? "700" : "500",
                      border: `1px solid ${targetElo === elo ? "var(--accent-color)" : "var(--glass-border)"}`,
                      background: targetElo === elo ? "var(--accent-color)" : "transparent",
                      color: targetElo === elo ? "#fff" : "var(--text-secondary)",
                      cursor: "pointer", transition: "border-color 0.15s, background 0.15s, color 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={600} max={2400} step={50}
                value={targetElo}
                onChange={(e) => setTargetElo(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent-color)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", marginTop: "6px" }}>
                <span>600</span>
                <span style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "12px" }}>{targetElo}</span>
                <span>2400</span>
              </div>
            </div>

            {/* Training Aids — no eyebrow label */}
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "16px 18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {[
                  { key: "takeback", label: "Takeback", val: enableTakeback, setter: setEnableTakeback, desc: "Undo your last move + engine response" },
                  { key: "hint",     label: "Hint",     val: enableHint,     setter: setEnableHint,     desc: "Show best move arrow on demand"     },
                ].map(({ key, label, val, setter, desc }) => (
                  <label key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{desc}</div>
                    </div>
                    <div
                      onClick={() => setter(!val)}
                      style={{
                        width: "36px", height: "20px", borderRadius: "10px",
                        background: val ? "var(--accent-color)" : "var(--surface-2)",
                        position: "relative", flexShrink: 0,
                        transition: "background 0.2s", cursor: "pointer",
                        border: "1px solid var(--glass-border)", marginTop: "2px",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: "2px", left: val ? "18px" : "2px",
                        width: "14px", height: "14px", borderRadius: "50%",
                        background: "#fff", transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }} />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Selected opening preview + move sequence */}
            {selectedOpening && (
              <div style={{
                background: "var(--surface-2)", border: "1px solid var(--glass-border)",
                borderRadius: "8px", padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)", fontFamily: "monospace", letterSpacing: "0.5px" }}>
                    {selectedOpening.eco}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "700" }}>{selectedOpening.name}</span>
                </div>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {selectedOpening.moves.join(", ")}
                </div>
              </div>
            )}

            {/* Start Drill — dominant CTA, engine status folded in */}
            <button
              onClick={startDrill}
              disabled={!selectedOpening || !engineReady}
              style={{
                padding: "16px", borderRadius: "10px", border: "none",
                background: !selectedOpening || !engineReady ? "var(--surface-2)" : "var(--accent-color)",
                color: !selectedOpening || !engineReady ? "var(--text-secondary)" : "#fff",
                fontWeight: "800", fontSize: "16px", letterSpacing: "-0.01em",
                cursor: !selectedOpening || !engineReady ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {engine.status === "initializing"
                ? "Loading engine…"
                : !selectedOpening
                ? "Select an opening first"
                : "Start Drill"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
