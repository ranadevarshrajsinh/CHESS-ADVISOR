import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchChessComGames, fetchLichessGames } from "@/lib/chess/integrations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    // Fetch recent games from both platforms
    const [chessComGames, lichessGames] = await Promise.all([
      fetchChessComGames(username, limit),
      fetchLichessGames(username, limit),
    ]);

    const allGames = [...chessComGames, ...lichessGames].slice(0, limit);

    if (allGames.length === 0) {
      return NextResponse.json(
        { error: "No games found for this user", jobs: [] },
        { status: 404 }
      );
    }

    // Create analysis jobs for each game
    const jobs = [];
    for (const game of allGames) {
      // Use a stable filename derived from the game URL or metadata
      const filename =
        game.filename ||
        game.url?.split("/").pop() ||
        `${game.opponent || "unknown"}_${game.date || Date.now()}.pgn`;

      const { data, error } = await supabaseAdmin
        .from("analysis_jobs")
        .insert({
          username,
          filename,
          status: "pending",
          result: {
            pgn: game.pgn,
            platform: game.platform,
          },
        })
        .select()
        .single();

      if (!error && data) {
        jobs.push(data);
      } else {
        console.error(`Failed to create job for ${filename}:`, error);
      }
    }

    return NextResponse.json({
      username,
      total_games: allGames.length,
      jobs_created: jobs.length,
      jobs,
    });
  } catch (err) {
    console.error("Batch analysis error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
