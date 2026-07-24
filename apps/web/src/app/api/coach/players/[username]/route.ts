import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await requireRole(request, "coach");
  if (session instanceof NextResponse) return session;

  const coachId = session.app_user.profile?.id;
  const { username } = await params;

  const player = await prisma.players.findFirst({
    where: {
      OR: [{ chess_username: username }, { lichess_username: username }],
      coach_id: coachId,
    },
  });

  if (!player) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(player);
}
