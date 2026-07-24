"use client";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DRAW_RESULTS = new Set([
  "stalemate", "insufficient", "agreed", "repetition",
  "timevsinsufficient", "50move", "1/2-1/2",
]);
const LOSS_RESULTS = new Set([
  "checkmated", "resigned", "timeout", "abandoned", "loss",
]);

function resolveOutcome(
  result: string,
  white: string,
  black: string,
  username: string,
): "Win" | "Loss" | "Draw" {
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

export default function GameCard({
  game,
  chessUsername = "",
  lichessUsername = "",
}: {
  game: any;
  chessUsername?: string;
  lichessUsername?: string;
}) {
  const username = game.platform === "lichess" ? lichessUsername : chessUsername;
  const outcome = resolveOutcome(game.result, game.white, game.black, username);
  const isUserWhite = (game.white || "").toLowerCase() === username.toLowerCase();

  return (
    <Card className="flex flex-col motion-safe:hover:-translate-y-0.5 hover:border-[var(--border-medium)] hover:bg-[var(--card-hover)]">
      {/* Platform + Date */}
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <Badge variant="accent" className="uppercase tracking-wider text-[11px]">
          {game.platform}
        </Badge>
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Calendar size={12} aria-hidden="true" />
          {new Date(game.end_time * 1000).toLocaleDateString()}
        </div>
      </CardHeader>

      {/* Players (left) + Outcome anchored top-right */}
      <CardContent className="flex-1 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none shrink-0" aria-hidden="true" style={{ color: "var(--text-secondary)" }}>♙</span>
            <span className={cn("text-[14px] truncate", isUserWhite ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {game.white}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none shrink-0" aria-hidden="true" style={{ color: "var(--border-medium)" }}>♟</span>
            <span className={cn("text-[14px] truncate", !isUserWhite ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {game.black}
            </span>
          </div>
        </div>

        <Badge
          variant={outcome === "Win" ? "success" : outcome === "Loss" ? "danger" : "secondary"}
          className="shrink-0 mt-0.5 font-semibold tracking-wide uppercase text-[11px]"
        >
          {outcome}
        </Badge>
      </CardContent>

      {/* CTA */}
      <CardFooter className="justify-end">
        <Link
          href={`/analysis/${encodeURIComponent(game.filename)}`}
          className="btn btn-primary btn-sm"
          aria-label={`Analyze game: ${game.white} vs ${game.black}, ${new Date(game.end_time * 1000).toLocaleDateString()}`}
        >
          Analyze
        </Link>
      </CardFooter>
    </Card>
  );
}
