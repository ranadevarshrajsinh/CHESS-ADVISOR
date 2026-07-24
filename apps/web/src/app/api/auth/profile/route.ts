import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const session = await requireAuth(request);
  if (session instanceof NextResponse) return session;

  const player = session.app_user.player;
  if (!player) {
    return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasChessKey = Object.prototype.hasOwnProperty.call(body, "chessUsername");
  const hasLichessKey = Object.prototype.hasOwnProperty.call(body, "lichessUsername");

  const chessLower = hasChessKey
    ? (body.chessUsername ? String(body.chessUsername).trim().toLowerCase() : null)
    : player.chess_username;
  const lichessLower = hasLichessKey
    ? (body.lichessUsername ? String(body.lichessUsername).trim().toLowerCase() : null)
    : player.lichess_username;

  if (!chessLower && !lichessLower) {
    return NextResponse.json({ error: "Keep at least one of Chess.com or Lichess username" }, { status: 400 });
  }

  let activePlatform = body.activePlatform ?? player.active_platform;
  if (activePlatform !== "chess.com" && activePlatform !== "lichess") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  // Can't stay active on a platform whose username was just cleared — fall back to whichever remains.
  if (activePlatform === "chess.com" && !chessLower) activePlatform = "lichess";
  if (activePlatform === "lichess" && !lichessLower) activePlatform = "chess.com";

  const [conflictChess, conflictLichess] = await Promise.all([
    chessLower && chessLower !== player.chess_username
      ? prisma.players.findUnique({ where: { chess_username: chessLower } })
      : Promise.resolve(null),
    lichessLower && lichessLower !== player.lichess_username
      ? prisma.players.findUnique({ where: { lichess_username: lichessLower } })
      : Promise.resolve(null),
  ]);

  if ((conflictChess && conflictChess.id !== player.id) || (conflictLichess && conflictLichess.id !== player.id)) {
    return NextResponse.json({ error: "This username is already registered." }, { status: 409 });
  }

  const updated = await prisma.players.update({
    where: { id: player.id },
    data: {
      chess_username: chessLower,
      lichess_username: lichessLower,
      active_platform: activePlatform,
    },
  });

  return NextResponse.json({
    chessUsername: updated.chess_username,
    lichessUsername: updated.lichess_username,
    activePlatform: updated.active_platform,
  });
}
