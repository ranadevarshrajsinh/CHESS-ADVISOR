"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "./GameRow.css";

const DRAW_RESULTS = new Set([
  "stalemate", "insufficient", "agreed", "repetition",
  "timevsinsufficient", "50move", "1/2-1/2",
]);
const LOSS_RESULTS = new Set([
  "checkmated", "resigned", "timeout", "abandoned", "loss",
]);

type Outcome = "Win" | "Loss" | "Draw";

function resolveOutcome(result: string, white: string, black: string, username: string): Outcome {
  const r = (result || "").toLowerCase().trim();
  const isWhite = white?.toLowerCase() === username?.toLowerCase();
  if (r === "1-0") return isWhite ? "Win" : "Loss";
  if (r === "0-1") return isWhite ? "Loss" : "Win";
  if (r === "white") return isWhite ? "Win" : "Loss";
  if (r === "black") return isWhite ? "Loss" : "Win";
  if (DRAW_RESULTS.has(r)) return "Draw";
  if (r === "win") return "Win";
  if (LOSS_RESULTS.has(r)) return "Loss";
  return "Draw";
}

function formatDate(endTimeSec: number): string {
  if (!endTimeSec) return "";
  const then = new Date(endTimeSec * 1000);
  const now = new Date();
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

function timeClassLabel(game: any): string | null {
  const cls = (game.time_class || "").toLowerCase();
  if (!cls) return null;
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}

interface GameRowProps {
  game: any;
  username?: string;
  opening?: string;
  eco?: string;
  plyCount?: number;
  analysisStatus?: { analyzed: true; accuracy?: number } | { analyzed: false } | undefined;
}

export default function GameRow({ game, username = "", opening, eco, plyCount }: GameRowProps) {
  const outcome = resolveOutcome(game.result, game.white, game.black, username);
  const isUserWhite = (game.white || "").toLowerCase() === username.toLowerCase();
  const opponent = isUserWhite ? (game.black || "Opponent") : (game.white || "Opponent");
  const opponentRating = isUserWhite
    ? (game.black_rating ?? game.blackRating)
    : (game.white_rating ?? game.whiteRating);

  const openingLabel = opening || eco || null;

  const metaParts: string[] = [];
  if (opponentRating != null) metaParts.push(String(opponentRating));
  const cls = timeClassLabel(game);
  if (cls) metaParts.push(cls);
  if (plyCount) metaParts.push(`${Math.ceil(plyCount / 2)} moves`);

  const chipLetter = outcome === "Win" ? "W" : outcome === "Loss" ? "L" : "D";
  const chipMod = outcome.toLowerCase();
  const dateStr = game.end_time ? formatDate(game.end_time) : "";

  return (
    <Link
      href={`/analysis/${encodeURIComponent(game.filename)}`}
      className="game-row"
      aria-label={`Analyze ${outcome.toLowerCase()} vs ${opponent}${dateStr ? `, ${dateStr}` : ""}`}
    >
      <div className={`game-row__chip game-row__chip--${chipMod}`} aria-hidden="true">
        {chipLetter}
      </div>

      <div className="game-row__body">
        <div className="game-row__title">
          <span className="game-row__you">{username || "you"}</span>
          <span className="game-row__vs" aria-hidden="true"> vs </span>
          <span className="game-row__opponent">{opponent}</span>
        </div>
        {metaParts.length > 0 && (
          <div className="game-row__meta">
            {metaParts.map((m, i) => (
              <span key={i} className="game-row__meta-item">
                {m}
                {i < metaParts.length - 1 && <span className="game-row__meta-sep" aria-hidden="true">·</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="game-row__opening-col">
        {openingLabel && (
          <span className="game-row__opening" title={openingLabel}>
            {openingLabel}
          </span>
        )}
      </div>

      <div className="game-row__date-col">
        <div className="game-row__date-label">Date</div>
        <div className="game-row__date-value">{dateStr || "—"}</div>
      </div>

      <ArrowUpRight size={16} className="game-row__arrow" aria-hidden="true" />
    </Link>
  );
}
