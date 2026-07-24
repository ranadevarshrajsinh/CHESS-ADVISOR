import { Game } from "@repo/types";

const HEADERS = { "User-Agent": "ChessCoachPlatform/1.0 (Contact: your@email.com)" };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lichess's games-export endpoint (used by both fetchLichessGames and
// fetchLichessPerfStats below) rejects overlapping requests from the same
// client with a 429 ("Please only run 1 request(s) at a time") and wants
// real spacing between calls, not just non-overlap. Different routes in this
// process can independently decide to hit it around the same time (e.g. the
// dashboard's getStats() call and its time-control stats card both fire on
// load) — so the lock has to live at module scope, not per-call.
let lichessGamesQueue: Promise<unknown> = Promise.resolve();
function withLichessGamesLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lichessGamesQueue.then(fn, fn);
  lichessGamesQueue = run.then(
    () => sleep(600),
    () => sleep(600),
  );
  return run;
}

function recentMonthUrls(username: string, count = 12): string[] {
  const now = new Date();
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    urls.push(`https://api.chess.com/pub/player/${username}/games/${y}/${m}`);
  }
  return urls;
}

export async function fetchChessComGames(username: string, limit: number, timeClass?: string): Promise<Game[]> {
  try {
    const monthUrls = recentMonthUrls(username, 12);
    const allGames: any[] = [];

    for (const url of monthUrls) {
      if (allGames.length >= limit) break;
      try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const { games } = await res.json();
        if (!games?.length) continue;
        const batch = ([...games] as any[]).reverse();
        const filtered = timeClass
          ? batch.filter(g => (g.time_class || "").toLowerCase() === timeClass.toLowerCase())
          : batch;
        allGames.push(...filtered.slice(0, limit - allGames.length));
      } catch {
        continue;
      }
    }

    return allGames.slice(0, limit).map((game: any) => {
      let result: string;
      if (game.white?.result === "win") result = "1-0";
      else if (game.black?.result === "win") result = "0-1";
      else result = "1/2-1/2";
      return {
        platform: "chess.com",
        url: game.url,
        filename: game.url,
        pgn: game.pgn,
        white: game.white?.username ?? "",
        black: game.black?.username ?? "",
        white_rating: game.white?.rating,
        black_rating: game.black?.rating,
        result,
        end_time: game.end_time,
        time_class: game.time_class,
        time_control: game.time_control,
      };
    });
  } catch (error) {
    console.error("Error fetching Chess.com games:", error);
    return [];
  }
}

export async function fetchLichessGames(username: string, limit: number, speed?: string): Promise<Game[]> {
  const perfType = speed && speed !== "daily" ? `&perfType=${speed}` : "";
  const url = `https://lichess.org/api/games/user/${username}?max=${limit}${perfType}&pgnInJson=true`;
  try {
    const response = await withLichessGamesLock(() =>
      fetch(url, { headers: { Accept: "application/x-ndjson" } }),
    );
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

const LICHESS_PERFS = ["bullet", "blitz", "rapid", "classical"] as const;

type PerfStats = { last: { rating: number }; record: { win: number; loss: number; draw: number } };

async function fetchLichessRecentGamesForPerf(username: string, perf: string) {
  const url = `https://lichess.org/api/games/user/${username}?perfType=${perf}&max=30&pgnInJson=false`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await withLichessGamesLock(() =>
      fetch(url, { headers: { Accept: "application/x-ndjson" } }),
    );
    if (res.ok) return res.text();
    if (res.status === 429 && attempt === 0) {
      await sleep(1500);
      continue;
    }
    console.error(`Lichess games fetch for ${perf} failed: ${res.status}`);
    return null;
  }
  return null;
}

// Lichess's /api/user/{username} gives rating + total games per perf, but no
// win/loss/draw breakdown — unlike Chess.com's stats endpoint. We approximate
// a "recent form" record from a bounded recent-games sample per perf instead
// of paginating a player's entire history.
export async function fetchLichessPerfStats(username: string): Promise<Record<string, PerfStats>> {
  const stats: Record<string, PerfStats> = {};
  try {
    const res = await fetch(`https://lichess.org/api/user/${username}`, { headers: HEADERS });
    if (!res.ok) return stats;
    const data = await res.json();
    const perfs = data?.perfs ?? {};

    // Lichess's games-export endpoint rejects overlapping requests from the
    // same client with a 429 ("Please only run 1 request(s) at a time") and
    // also appears to want real spacing, not just non-overlap — these must
    // run strictly sequentially with a short delay between them, never via
    // Promise.all.
    for (const perf of LICHESS_PERFS) {
      const p = perfs[perf];
      if (!p?.games) continue;

      const record = { win: 0, loss: 0, draw: 0 };
      try {
        const text = await fetchLichessRecentGamesForPerf(username, perf);
        if (text) {
          text.trim().split("\n").filter(Boolean).forEach((line) => {
            try {
              const g = JSON.parse(line);
              const isWhite = (g.players?.white?.user?.name ?? "").toLowerCase() === username.toLowerCase();
              if (!g.winner) record.draw++;
              else if ((g.winner === "white") === isWhite) record.win++;
              else record.loss++;
            } catch {}
          });
        }
      } catch (e) {
        console.error(`Lichess games fetch for ${perf} threw:`, e);
      }

      stats[`lichess_${perf}`] = { last: { rating: p.rating }, record };
    }
  } catch (error) {
    console.error("Error fetching Lichess perf stats:", error);
  }
  return stats;
}
