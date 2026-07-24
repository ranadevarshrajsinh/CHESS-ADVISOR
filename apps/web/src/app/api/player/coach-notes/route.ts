import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = session.app_user.player;
  const identities = [player?.chess_username, player?.lichess_username].filter(
    (u): u is string => Boolean(u),
  );
  if (identities.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const notes = await prisma.game_annotations.findMany({
    where: {
      OR: identities.map((u) => ({ player_username: { equals: u, mode: "insensitive" as const } })),
    },
    orderBy: { created_at: "desc" },
    select: { id: true, filename: true, move_index: true, note: true, created_at: true, coach_id: true },
  });

  return NextResponse.json({ notes });
}
