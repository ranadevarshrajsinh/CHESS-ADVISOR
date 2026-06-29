import { Game } from "@repo/types";

const HEADERS = { "User-Agent": "ChessCoachPlatform/1.0 (Contact: your@email.com)" };

export async function fetchChessComGames(username: string, limit: number): Promise<Game[]> {
  const archivesUrl = `https://api.chess.com/pub/player/${username}/games/archives`;
  try {
    const response = await fetch(archivesUrl, { headers: HEADERS });
    if (!response.ok) return [];

    const { archives } = await response.json();
    if (!archives || archives.length === 0) return [];

    const allGames: any[] = [];
    for (const archiveUrl of [...archives].reverse()) {
      const archiveResponse = await fetch(archiveUrl, { headers: HEADERS });
      if (archiveResponse.ok) {
        const { games } = await archiveResponse.json();
        allGames.push(...[...games].reverse());
        if (allGames.length >= limit) break;
      }
    }

    return allGames.slice(0, limit).map((game: any) => {
      let result: string;
      if (game.white.result === "win") result = "1-0";
      else if (game.black.result === "win") result = "0-1";
      else result = "1/2-1/2";
      return {
        platform: "chess.com",
        url: game.url,
        filename: game.url,
        pgn: game.pgn,
        white: game.white.username,
        black: game.black.username,
        result,
        end_time: game.end_time,
      };
    });
  } catch (error) {
    console.error("Error fetching Chess.com games:", error);
    return [];
  }
}

export async function fetchLichessGames(username: string, limit: number): Promise<Game[]> {
  const url = `https://lichess.org/api/games/user/${username}?max=${limit}&pgnInJson=true`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/x-ndjson" },
    });
    if (!response.ok) return [];

    const text = await response.text();
    const games = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const game = JSON.parse(line);
          let result: string;
          if (game.winner === "white") result = "1-0";
          else if (game.winner === "black") result = "0-1";
          else result = "1/2-1/2";
          const stdGame: Game = {
            platform: "lichess",
            url: `https://lichess.org/${game.id}`,
            filename: `https://lichess.org/${game.id}`,
            pgn: game.pgn,
            white: game.players.white.user?.name ?? game.players.white.name ?? "",
            black: game.players.black.user?.name ?? game.players.black.name ?? "",
            result,
            end_time: game.createdAt,
          };
          return stdGame;
        } catch (e) {
          return null;
        }
      })
      .filter((g): g is Game => g !== null);

    return games;
  } catch (error) {
    console.error("Error fetching Lichess games:", error);
    return [];
  }
}
