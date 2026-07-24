import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { app_user: user } = session;
  const profile = user.profile;
  const player = user.player;

  const userType = profile ? "staff" : "player";

  return NextResponse.json({
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified,
    userType,
    // Staff fields
    role: profile?.role ?? null,
    status: profile?.status ?? player?.status ?? null,
    fullName: profile?.full_name ?? player?.full_name ?? null,
    academyId: profile?.academy_id ?? null,
    inviteCode: profile?.invite_code ?? null,
    // Player fields
    chessUsername: player?.chess_username ?? null,
    lichessUsername: player?.lichess_username ?? null,
    activePlatform: player?.active_platform ?? "chess.com",
    coachId: player?.coach_id ?? null,
    isApproved: (profile?.status ?? player?.status) === "approved",
  });
}
