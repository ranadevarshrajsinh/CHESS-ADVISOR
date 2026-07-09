"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { CheckCircle, XCircle, Lightbulb, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
import { formatThemeTags } from "@/lib/puzzles/theme-utils";
import { useSettings } from "@/contexts/SettingsContext";
import { useChessSound } from "@/hooks/useChessSound";

const BOARD_THEMES: Record<string, { dark: string; light: string }> = {
  classic: { dark: "#b58863", light: "#f0d9b5" },
  green:   { dark: "#769656", light: "#eeeed2" },
  mono:    { dark: "#4a4a4a", light: "#e8e8e8" },
  ocean:   { dark: "#4870ac", light: "#dae3f5" },
  walnut:  { dark: "#7c3f00", light: "#f5d6a4" },
};

type Puzzle = {
  puzzle_id:  string;
  fen:        string;
  best_move:  string;
  moves?:     string;
  theme:      string;
  difficulty: number;
  rating?:    number;
  gameUrl?:   string;
};

type Props = {
  puzzle:             Puzzle;
  puzzleIndex:        number;
  totalPuzzles:       number;
  onAttempt:          (solved: boolean, timeTakenSeconds: number) => void;
  onNext:             () => void;
  ratingDelta?:       number | null;
  onOpponentPlaying?: (playing: boolean) => void;
  autoAdvance?:       boolean;   // rush mode: hides controls, auto-calls onNext after attempt
};

type SolveState = "waiting" | "opponent_reply" | "solved" | "failed";
type HintLevel  = 0 | 1 | 2 | 3;
type PromoType  = "q" | "r" | "b" | "n";

const WHITE_PROMO = [
  { type: "q" as PromoType, label: "♕", name: "Queen"  },
  { type: "r" as PromoType, label: "♖", name: "Rook"   },
  { type: "b" as PromoType, label: "♗", name: "Bishop" },
  { type: "n" as PromoType, label: "♘", name: "Knight" },
];
const BLACK_PROMO = [
  { type: "q" as PromoType, label: "♛", name: "Queen"  },
  { type: "r" as PromoType, label: "♜", name: "Rook"   },
  { type: "b" as PromoType, label: "♝", name: "Bishop" },
  { type: "n" as PromoType, label: "♞", name: "Knight" },
];

export default function PuzzleBoard({
  puzzle, puzzleIndex, totalPuzzles, onAttempt, onNext, ratingDelta, onOpponentPlaying, autoAdvance,
}: Props) {
  const [game,             setGame]             = useState(() => new Chess(puzzle.fen));
  const [solveState,       setSolveState]       = useState<SolveState>("waiting");
  const [moveIndex,        setMoveIndex]        = useState(0);
  const [boardFlash,       setBoardFlash]       = useState<"green" | "red" | null>(null);
  const [hintLevel,        setHintLevel]        = useState<HintLevel>(0);
  const [failMove,         setFailMove]         = useState<string>("");
  const [selectedSquare,   setSelectedSquare]   = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const startTime = useRef(Date.now());
  const { boardTheme } = useSettings();
  const boardColors = BOARD_THEMES[boardTheme] ?? BOARD_THEMES.classic;
  const { play } = useChessSound();
  const firedRef  = useRef(false);

  const solutionMoves = useMemo(() => {
    if (puzzle.moves?.trim()) return puzzle.moves.trim().split(" ");
    if (puzzle.best_move)     return [puzzle.best_move];
    return [];
  }, [puzzle.puzzle_id]);

  // Lichess puzzle format: first move in Moves is the opponent's setup move (auto-played).
  // The solver plays from the OPPOSITE side of whoever is to move in the FEN.
  const isLichessFormat = solutionMoves.length >= 2;
  const fenActiveColor  = puzzle.fen.split(" ")[1]; // "w" or "b"
  const boardOrientation: "white" | "black" = isLichessFormat
    ? (fenActiveColor === "w" ? "black" : "white")
    : (fenActiveColor === "w" ? "white" : "black");

  const currentExpected  = moveIndex < solutionMoves.length ? solutionMoves[moveIndex] : null;
  const hintSquare       = currentExpected?.slice(0, 2) ?? "";
  // Solver moves are at indices 1, 3, 5... (index 0 is setup move)
  const totalPlayerMoves = isLichessFormat
    ? Math.ceil((solutionMoves.length - 1) / 2)
    : Math.ceil(solutionMoves.length / 2);
  const playerMovesDone = isLichessFormat
    ? Math.floor((moveIndex - 1) / 2)
    : Math.floor(moveIndex / 2);

  useEffect(() => {
    const g = new Chess(puzzle.fen);
    let startIdx = 0;
    if (isLichessFormat) {
      const sm = solutionMoves[0];
      try { g.move({ from: sm.slice(0, 2), to: sm.slice(2, 4), promotion: sm[4] as PromoType }); } catch {}
      startIdx = 1;
    }
    setGame(g);
    setSolveState("waiting");
    setMoveIndex(startIdx);
    setBoardFlash(null);
    setHintLevel(0);
    setFailMove("");
    setSelectedSquare(null);
    setPendingPromotion(null);
    firedRef.current  = false;
    startTime.current = Date.now();
  }, [puzzle.puzzle_id]);

  // Derived state — declared here so the auto-advance effect below can reference it
  const attempted = solveState === "solved" || solveState === "failed";

  // Auto-advance in rush mode: call onNext after a short pause
  useEffect(() => {
    if (!autoAdvance || !attempted) return;
    const delay = solveState === "solved" ? 600 : 900;
    const t = setTimeout(onNext, delay);
    return () => clearTimeout(t);
  }, [autoAdvance, attempted, solveState, onNext]);

  const playOpponentReply = useCallback((
    boardAfterPlayer: Chess,
    opponentUci: string,
    nextPlayerIndex: number,
  ) => {
    setSolveState("opponent_reply");
    onOpponentPlaying?.(true);
    setTimeout(() => {
      const from  = opponentUci.slice(0, 2);
      const to    = opponentUci.slice(2, 4);
      const promo = opponentUci[4] as PromoType | undefined;
      const copy  = new Chess(boardAfterPlayer.fen());
      let oppMove;
      try { oppMove = copy.move({ from, to, promotion: promo }); } catch { /* ignore */ }
      play(oppMove?.captured ? "capture" : "move");
      setGame(copy);
      setMoveIndex(nextPlayerIndex);
      onOpponentPlaying?.(false);

      if (nextPlayerIndex >= solutionMoves.length) {
        setSolveState("solved");
        if (!firedRef.current) {
          firedRef.current = true;
          onAttempt(true, (Date.now() - startTime.current) / 1000);
        }
        flash("green");
        setTimeout(() => play("solved"), 120);
      } else {
        setSolveState("waiting");
      }
    }, 600);
  }, [solutionMoves, onAttempt, onOpponentPlaying, play]);

  function flash(colour: "green" | "red") {
    setBoardFlash(colour);
    setTimeout(() => setBoardFlash(null), 700);
  }

  function isPromoMove(from: string, to: string): boolean {
    const piece = game.get(from as any);
    if (!piece || piece.type !== "p") return false;
    const toRank = to[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
  }

  function applyPlayerMove(from: string, to: string, promotion?: PromoType): boolean {
    if (solveState !== "waiting" || firedRef.current || !currentExpected) return false;

    const promoChar = promotion ?? "q";
    const copy = new Chess(game.fen());
    let moveResult;
    try {
      moveResult = copy.move({ from, to, promotion: promoChar });
      if (!moveResult) return false;
    } catch { return false; }

    const base   = from + to;
    const correct =
      (base + (promotion ?? "")) === currentExpected ||
      base                       === currentExpected ||
      base + "q"                 === currentExpected ||
      base                       === currentExpected.slice(0, 4);

    setSelectedSquare(null);

    if (correct) {
      play(moveResult.captured ? "capture" : "move");
      setGame(copy);
      setHintLevel(0);
      const nextIndex = moveIndex + 1;
      if (nextIndex >= solutionMoves.length) {
        setSolveState("solved");
        flash("green");
        if (!firedRef.current) {
          firedRef.current = true;
          onAttempt(true, (Date.now() - startTime.current) / 1000);
        }
        setTimeout(() => play("solved"), 120);
      } else {
        playOpponentReply(copy, solutionMoves[nextIndex], nextIndex + 1);
      }
    } else {
      play("wrong");
      flash("red");
      setSolveState("failed");
      setFailMove(currentExpected);
      if (!firedRef.current) {
        firedRef.current = true;
        onAttempt(false, (Date.now() - startTime.current) / 1000);
      }
    }
    return true;
  }

  function handlePieceDrop({
    sourceSquare, targetSquare,
  }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean {
    if (!targetSquare || solveState !== "waiting" || firedRef.current || pendingPromotion) return false;
    if (isPromoMove(sourceSquare, targetSquare)) {
      const test = new Chess(game.fen());
      try { test.move({ from: sourceSquare, to: targetSquare, promotion: "q" }); }
      catch { return false; }
      setSelectedSquare(null);
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }
    return applyPlayerMove(sourceSquare, targetSquare);
  }

  function handleSquareClick({ square, piece }: { square: string; piece: unknown }) {
    if (solveState !== "waiting" || firedRef.current || pendingPromotion) return;

    if (selectedSquare === null) {
      const piece = game.get(square as any);
      if (piece && piece.color === game.turn()) setSelectedSquare(square);
    } else if (selectedSquare === square) {
      setSelectedSquare(null);
    } else {
      const piece = game.get(square as any);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
      } else if (isPromoMove(selectedSquare, square)) {
        const test = new Chess(game.fen());
        try { test.move({ from: selectedSquare, to: square, promotion: "q" }); }
        catch { setSelectedSquare(null); return; }
        setPendingPromotion({ from: selectedSquare, to: square });
        setSelectedSquare(null);
      } else {
        applyPlayerMove(selectedSquare, square);
      }
    }
  }

  function handlePromoChoice(piece: PromoType) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    applyPlayerMove(from, to, piece);
  }

  function handleTryAgain() {
    const g = new Chess(puzzle.fen);
    let startIdx = 0;
    if (isLichessFormat) {
      const sm = solutionMoves[0];
      try { g.move({ from: sm.slice(0, 2), to: sm.slice(2, 4), promotion: sm[4] as PromoType }); } catch {}
      startIdx = 1;
    }
    setGame(g);
    setSolveState("waiting");
    setMoveIndex(startIdx);
    setBoardFlash(null);
    setHintLevel(0);
    setFailMove("");
    setSelectedSquare(null);
    setPendingPromotion(null);
    firedRef.current  = false;
    startTime.current = Date.now();
  }

  // Library puzzles use Lichess rating; own-game puzzles use CP-loss — separate thresholds
  const diffVal   = puzzle.rating ?? puzzle.difficulty;
  const isLibrary = !!puzzle.rating;
  const diffLabel = isLibrary
    ? (diffVal < 1200 ? "Beginner" : diffVal < 1600 ? "Intermediate" : diffVal < 2000 ? "Advanced" : "Expert")
    : (puzzle.difficulty < 200 ? "Beginner" : puzzle.difficulty < 400 ? "Intermediate" : puzzle.difficulty < 700 ? "Advanced" : "Expert");
  const diffColor = diffLabel === "Beginner" ? "var(--success)" : diffLabel === "Intermediate" ? "var(--warning)" : "#f97316";

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (hintLevel >= 1 && !attempted && hintSquare) {
      styles[hintSquare] = { backgroundColor: "rgba(255,210,0,0.65)", borderRadius: "4px" };
    }
    if (selectedSquare && !attempted) {
      styles[selectedSquare] = { backgroundColor: "rgba(20,85,255,0.35)", borderRadius: "4px" };

      // Legal move indicators
      const legalTargets = game.moves({ square: selectedSquare as any, verbose: true });
      for (const mv of legalTargets) {
        const occupied = !!game.get(mv.to as Parameters<typeof game.get>[0]);
        styles[mv.to] = occupied
          // Capture ring: hollow circle around the enemy piece
          ? { backgroundImage: "radial-gradient(circle at center, transparent 57%, rgba(0,0,0,0.22) 57%)" }
          // Move dot: small filled circle on empty square
          : { backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.18) 23%, transparent 23%)" };
      }
    }
    return styles;
  }, [hintLevel, attempted, hintSquare, selectedSquare, game]);

  const promoChoices = game.turn() === "w" ? WHITE_PROMO : BLACK_PROMO;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            background: "rgba(29,193,137,0.15)", color: "var(--accent-color)",
            padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 600,
            border: "1px solid rgba(29,193,137,0.3)",
          }}>
            {formatThemeTags(puzzle.theme)}
          </span>
          <span style={{
            background: `${diffColor}18`, color: diffColor,
            padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
            border: `1px solid ${diffColor}33`,
          }}>
            {diffLabel}{puzzle.rating ? ` · ${puzzle.rating}` : ""}
          </span>
          {totalPlayerMoves > 1 && (
            <span style={{
              background: "rgba(100,100,100,0.08)", color: "var(--text-secondary)",
              padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
              border: "1px solid var(--border-color)",
            }}>
              {totalPlayerMoves} moves
            </span>
          )}
        </div>
        <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          {puzzleIndex + 1} / {totalPuzzles}
        </span>
      </div>

      {/* Instruction + Hint (hint hidden in rush/autoAdvance mode) */}
      {solveState === "waiting" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px" }}>
            <Lightbulb size={14} style={{ marginRight: "6px", verticalAlign: "middle" }} />
            {playerMovesDone > 0
              ? `Move ${playerMovesDone + 1} of ${totalPlayerMoves} — keep going`
              : `Find the best move for ${boardOrientation === "white" ? "White" : "Black"}`}
          </p>
          {!autoAdvance && (
            <button
              onClick={() => setHintLevel(h => Math.min(3, h + 1) as HintLevel)}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "5px 12px", borderRadius: "8px", cursor: "pointer",
                background: hintLevel > 0 ? "rgba(255,210,0,0.15)" : "transparent",
                color: hintLevel > 0 ? "#b8860b" : "var(--text-secondary)",
                border: `1px solid ${hintLevel > 0 ? "rgba(255,210,0,0.4)" : "var(--border-color)"}`,
                fontSize: "12px", fontWeight: 600, transition: "all 0.15s",
              }}
            >
              <Lightbulb size={12} />
              {hintLevel === 0 ? "Hint" : `Hint ${hintLevel}/3`}
            </button>
          )}
        </div>
      )}

      {solveState === "opponent_reply" && (
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px", fontStyle: "italic" }}>
          Opponent replies…
        </p>
      )}

      {/* Hint labels */}
      {hintLevel === 1 && solveState === "waiting" && (
        <div style={hintBox}>Move the piece on <strong>{hintSquare.toUpperCase()}</strong></div>
      )}
      {hintLevel === 2 && solveState === "waiting" && (
        <div style={hintBox}>
          Theme: <strong>{formatThemeTags(puzzle.theme)}</strong> — look for the tactical pattern
        </div>
      )}
      {hintLevel === 3 && solveState === "waiting" && (
        <div style={hintBox}>Solution: <strong>{currentExpected}</strong></div>
      )}

      {/* Board + promotion picker */}
      <div style={{ position: "relative", maxWidth: "480px", width: "100%", marginInline: "auto" }}>
        <div style={{
          borderRadius: "12px", overflow: "hidden",
          outline: boardFlash === "green" ? "4px solid var(--success)" :
                   boardFlash === "red"   ? "4px solid var(--danger)" : "none",
          transition: "outline 0.1s",
        }}>
          <Chessboard
            options={{
              position:              game.fen(),
              boardOrientation,
              allowDragging:         solveState === "waiting" && !pendingPromotion,
              animationDurationInMs: 200,
              boardStyle:            { borderRadius: "8px" },
              darkSquareStyle:       { backgroundColor: boardColors.dark },
              lightSquareStyle:      { backgroundColor: boardColors.light },
              squareStyles,
              onPieceDrop:           handlePieceDrop,
              onSquareClick:         handleSquareClick,
            }}
          />
        </div>

        {/* Promotion picker overlay */}
        {pendingPromotion && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "12px",
            background: "rgba(0,0,0,0.6)", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: "var(--bg-color)", borderRadius: "14px",
              padding: "20px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "14px" }}>Promote pawn to:</p>
              <div style={{ display: "flex", gap: "10px" }}>
                {promoChoices.map(({ type, label, name }) => (
                  <button
                    key={type}
                    title={name}
                    onClick={() => handlePromoChoice(type)}
                    style={{
                      width: "54px", height: "54px", borderRadius: "10px",
                      border: "2px solid var(--border-color)", cursor: "pointer",
                      background: "white", fontSize: "32px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent-color)";
                      (e.currentTarget as HTMLButtonElement).style.background  = "rgba(29,193,137,0.08)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-color)";
                      (e.currentTarget as HTMLButtonElement).style.background  = "white";
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setPendingPromotion(null); setSelectedSquare(null); }}
                style={{ fontSize: "12px", color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feedback — minimal flash in rush mode, full panel otherwise */}
      {attempted && autoAdvance && (
        <div style={{
          padding: "12px 16px", borderRadius: "10px", textAlign: "center",
          background: solveState === "solved" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${solveState === "solved" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          fontWeight: 700, fontSize: "14px",
          color: solveState === "solved" ? "var(--success)" : "var(--danger)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}>
          {solveState === "solved"
            ? <><CheckCircle size={16} /> Correct!</>
            : <><XCircle size={16} /> Best: {failMove}</>}
        </div>
      )}

      {attempted && !autoAdvance && (
        <div style={{
          display: "flex", flexDirection: "column", gap: "12px",
          padding: "16px", borderRadius: "12px",
          background: solveState === "solved" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${solveState === "solved" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {solveState === "solved"
                ? <CheckCircle size={20} color="var(--success)" />
                : <XCircle    size={20} color="var(--danger)"  />}
              <span style={{
                fontWeight: 700, fontSize: "15px",
                color: solveState === "solved" ? "var(--success)" : "var(--danger)",
              }}>
                {solveState === "solved"
                  ? `Correct!${totalPlayerMoves > 1 ? ` All ${totalPlayerMoves} moves found.` : ""}`
                  : `Not quite — best was ${failMove}`}
              </span>
            </div>
            {ratingDelta != null && (
              <span style={{
                fontWeight: 700, fontSize: "14px",
                color: ratingDelta >= 0 ? "var(--success)" : "var(--danger)",
                display: "flex", alignItems: "center", gap: "3px",
              }}>
                {ratingDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {solveState === "failed" && (
              <button onClick={handleTryAgain} style={secondaryBtnStyle}>
                <RotateCcw size={13} /> Try Again
              </button>
            )}
            <button onClick={onNext} style={primaryBtnStyle}>Next Puzzle →</button>
            {puzzle.gameUrl && (
              <a
                href={puzzle.gameUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "12px", color: "var(--text-secondary)", textDecoration: "underline", marginLeft: "auto" }}
              >
                View source game ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const hintBox: React.CSSProperties = {
  margin: 0, fontSize: "13px", fontWeight: 600, color: "#b8860b",
  background: "rgba(255,210,0,0.1)", padding: "8px 12px",
  borderRadius: "8px", border: "1px solid rgba(255,210,0,0.3)",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 24px", borderRadius: "8px", cursor: "pointer",
  background: "var(--accent-color)", color: "#fff",
  border: "none", fontWeight: 700, fontSize: "14px",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "6px",
  padding: "10px 20px", borderRadius: "8px", cursor: "pointer",
  background: "transparent", color: "var(--text-secondary)",
  border: "1px solid var(--border-color)", fontWeight: 700, fontSize: "14px",
};
