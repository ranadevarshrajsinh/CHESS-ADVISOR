import { NextRequest, NextResponse } from "next/server";
import { fetchChessComGames, fetchLichessGames } from "@/lib/chess/integrations";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const username = searchParams.get("username");
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const tc = searchParams.get("tc") || undefined;

  if (!platform || !username) {
    return NextResponse.json({ error: "Platform and username are required" }, { status: 400 });
  }

  if (platform.toLowerCase() === "chess.com") {
    const games = await fetchChessComGames(username, limit, tc);
    return NextResponse.json(games);
  } else if (platform.toLowerCase() === "lichess") {
    const games = await fetchLichessGames(username, limit, tc);
    return NextResponse.json(games);
  } else {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
}
