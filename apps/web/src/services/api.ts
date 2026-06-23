const BASE_URL = "";

function apiFetch(url: string, options?: RequestInit) {
  return fetch(url, options);
}

// Deduplicates in-flight GET requests: if the same URL is already being fetched,
// return the existing promise instead of firing a second network request.
const inFlight = new Map<string, Promise<any>>();

function dedupedGet(url: string): Promise<any> {
  const existing = inFlight.get(url);
  if (existing) return existing;
  const p = fetch(url)
    .then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, p);
  return p;
}

export async function checkHealth() {
  try {
    const res = await apiFetch(`${BASE_URL}/`);
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchGames(platform, username, limit = 10) {
  const res = await apiFetch(
    `${BASE_URL}/api/games?platform=${platform}&username=${username}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("Failed to fetch games");
  return res.json();
}

export async function getStats(username) {
  const res = await apiFetch(`${BASE_URL}/api/stats/${username}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function analyzeGame(
  username: string,
  filename: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<any> {
  const { engineConfig } = await import("@/lib/engine-config");
  if (!engineConfig.enabled) {
    throw new Error("Client-side analysis is disabled. Set NEXT_PUBLIC_ANALYSIS_ENABLE_WASM=true");
  }

  const { isWasmSupported, getRecommendedWorkersNb } = await import("@/lib/engine/wasm-detect");
  if (typeof window === "undefined" || !isWasmSupported()) {
    throw new Error("WebAssembly is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.");
  }

  const { analyzeLocally } = await import("@/services/local-analysis");
  return await analyzeLocally(username, filename, onProgress);
}

export async function batchAnalyze(username, limit = 5) {
  const res = await apiFetch(
    `${BASE_URL}/api/analyze/${username}/batch?limit=${limit}`,
  );
  if (!res.ok) throw new Error("Batch analysis failed");
  return res.json();
}

export function getReport(username, limit = 50) {
  return dedupedGet(`${BASE_URL}/api/report/${username}?limit=${limit}`);
}

export function getTrainingPlan(username, limit = 50) {
  return dedupedGet(
    `${BASE_URL}/api/training-plan/${username}?limit=${limit}`,
  );
}

export function getOpenings(username, limit = 50) {
  return dedupedGet(`${BASE_URL}/api/openings/${username}?limit=${limit}`);
}

export type Annotation = {
  id: string;
  coach_id: string;
  player_username: string;
  filename: string;
  move_index: number;
  note: string;
};

export async function fetchAnnotations(
  coachId: string,
  playerUsername: string,
  filename: string,
): Promise<Annotation[]> {
  const res = await fetch(
    `/api/annotations?coach_id=${encodeURIComponent(coachId)}&player_username=${encodeURIComponent(playerUsername)}&filename=${encodeURIComponent(filename)}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export async function saveAnnotation(payload: {
  coach_id: string;
  player_username: string;
  filename: string;
  move_index: number;
  note: string;
}): Promise<Annotation | null> {
  const res = await fetch("/api/annotations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteAnnotation(id: string): Promise<void> {
  await fetch(`/api/annotations/${id}`, { method: "DELETE" });
}

// ── Puzzle API ────────────────────────────────────────────────────────────────

export async function getPuzzleQueue(username: string, limit = 10, phase?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (phase) params.set("phase", phase);
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/queue?${params}`);
  if (!res.ok) throw new Error("Failed to fetch puzzle queue");
  return res.json();
}

export async function generatePuzzles(username: string) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/generate`);
  if (!res.ok) throw new Error("Failed to generate puzzles");
  return res.json();
}

export async function recordPuzzleAttempt(
  username: string,
  puzzleId: string,
  solved: boolean,
  timeTakenSeconds: number,
  puzzleRating?: number,
  source: "own_game" | "library" = "own_game",
) {
  const res = await apiFetch(
    `${BASE_URL}/api/puzzles/${username}/${encodeURIComponent(puzzleId)}/attempt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solved,
        time_taken_seconds: timeTakenSeconds,
        puzzle_rating:      puzzleRating ?? null,
        player_rating:      null,
        source,
      }),
    },
  );
  if (!res.ok) throw new Error("Failed to record attempt");
  return res.json();
}

export async function getPlayerRating(username: string) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/rating`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCalibrationPuzzles(username: string) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/calibrate`);
  if (!res.ok) throw new Error("Failed to fetch calibration puzzles");
  return res.json();
}

export async function submitCalibration(
  username: string,
  results: Array<[number, boolean]>,
) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/calibrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error("Failed to submit calibration");
  return res.json();
}

export async function getPuzzleStats(username: string) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/${username}/stats`);
  if (!res.ok) throw new Error("Failed to fetch puzzle stats");
  return res.json();
}

export async function getThemedPuzzles(
  theme: string,
  minDifficulty = 0,
  maxDifficulty = 9999,
  limit = 10,
) {
  const res = await apiFetch(
    `${BASE_URL}/api/puzzles/themed/${theme}?min_difficulty=${minDifficulty}&max_difficulty=${maxDifficulty}&limit=${limit}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch themed puzzles");
  return res.json();
}

export async function submitRushScore(payload: {
  username: string;
  score: number;
  duration_seconds: number;
  wrong_count: number;
  end_reason: "time" | "strikes";
}) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/rush/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to submit rush score");
  return res.json();
}

export async function getRushLeaderboard(
  duration: 180 | 300,
  period: "week" | "all" = "week",
  limit = 10,
  username?: string,
) {
  const params = new URLSearchParams({
    duration: String(duration),
    period,
    limit: String(limit),
  });
  if (username) params.set("username", username);
  const res = await apiFetch(`${BASE_URL}/api/puzzles/rush/leaderboard?${params}`);
  if (!res.ok) throw new Error("Failed to fetch rush leaderboard");
  return res.json();
}

export async function getRushPuzzles(count = 60) {
  const res = await apiFetch(`${BASE_URL}/api/puzzles/rush?count=${count}`);
  if (!res.ok) throw new Error("Failed to fetch rush puzzles");
  return res.json();
}

export async function getLibraryPuzzles(
  theme?: string,
  phase?: string,
  ratingMin = 800,
  ratingMax = 2500,
  limit = 10,
) {
  const params = new URLSearchParams({
    rating_min: String(ratingMin),
    rating_max: String(ratingMax),
    limit: String(limit),
  });
  if (theme) params.set("theme", theme);
  if (phase) params.set("phase", phase);
  const res = await apiFetch(`${BASE_URL}/api/puzzles/library?${params}`);
  if (!res.ok) throw new Error("Failed to fetch library puzzles");
  return res.json();
}
