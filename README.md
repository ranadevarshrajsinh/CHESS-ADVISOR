# Chess Advisor

A full-stack chess analysis and coaching platform. Players can analyze games with Stockfish 18, track performance stats, train with personalized puzzles, and connect with coaches through an academy system.

---

## Features

- **Game Analysis** — Analyze individual Chess.com or Lichess games using Stockfish 18 (WASM, runs in browser). Shows win-probability graph, move quality, phase accuracy (opening/middlegame/endgame), blunders, and best moves.
- **Analysis Caching** — Results are saved to Supabase after first analysis. Revisiting the same game loads instantly from cache.
- **Batch Analysis** — Queue up to 10 recent games for analysis at once.
- **Report** — Aggregates all completed analyses into accuracy trends, opening stats, and phase breakdown.
- **Dashboard** — Performance overview with per-time-control stats (Rapid/Blitz/Bullet/Daily), win rate by color, and recent games.
- **Puzzle Training** — Spaced-repetition (SM-2) puzzles generated from your own game mistakes. Includes timed rush mode and calibration.
- **Coach / Academy Portal** — Coaches can manage players, view their analyses, and leave move-level annotations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| Frontend | Next.js 14 (App Router), TypeScript |
| Styling | CSS variables + glass-card design system |
| Engine | Stockfish 18 (WASM, single-threaded web worker) |
| Database | Supabase (Postgres + Auth) |
| ORM | Prisma |
| Chess logic | chess.js, react-chessboard |
| Charts | Recharts |

---

## Project Structure

```
apps/
  web/          # Main Next.js app
    src/
      app/      # Pages and API routes
        api/
          analyze/        # Single game + batch analysis + caching
          report/         # Aggregate report from completed jobs
          chess-com/      # Chess.com stats proxy
          games/          # Game fetching (Chess.com + Lichess)
          stats/          # Win rate calculation
          puzzles/        # Puzzle queue, rating, rush, library
          annotations/    # Coach move annotations
      components/         # UI components (GameCard, MistakeCard, etc.)
      contexts/           # Auth, Player, Settings, Theme contexts
      lib/
        engine/           # Stockfish pool, accuracy helpers, win%
        chess/            # Game fetching integrations, stats calc
      services/
        api.ts            # Client-side API calls
        local-analysis.ts # In-browser Stockfish analysis logic
  docs/         # Next.js docs app
packages/
  ui/           # Shared React component library
  types/        # Shared TypeScript types
  eslint-config/
  typescript-config/
```

---

## Data Storage

| Data | Location |
|---|---|
| Recent games list | `localStorage` → key `recentGames` |
| Analysis results | Supabase → `analysis_jobs` table |
| Dashboard stats cache | `localStorage` → `stats_{username}_v2`, `realStats_{username}_v2` |
| Puzzle progress | Supabase |
| Coach annotations | Supabase |

---

## Getting Started

**Install dependencies:**
```sh
npm install
```

**Set up environment variables** in `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_ANALYSIS_ENABLE_WASM=true
```

**Run the dev server:**
```sh
turbo dev --filter=web
# or
npx turbo dev --filter=web
```

**Build:**
```sh
turbo build --filter=web
```

---

## Key Implementation Notes

- **Result format** — Chess.com games are normalized to `"1-0"` / `"0-1"` / `"1/2-1/2"` at the integration layer (`lib/chess/integrations.ts`). Legacy localStorage data may still have raw Chess.com values (`"win"`, `"resigned"`, `"checkmated"` etc.) — all display/computation code handles both formats.
- **Analysis caching** — `POST /api/analyze` checks for an existing completed job before inserting. `GET /api/analyze?username=X&filename=Y` returns cached results. `PATCH /api/analyze` saves results after Stockfish finishes.
- **Stats by time control** — Dashboard pulls career stats from `pub/player/{username}/stats` (Chess.com API). Win rate by color is computed from the user's locally loaded games — these are different datasets and are labelled accordingly.

---

## Known Issues / Next Up

- `patterns`, `time_analysis`, `opening_recommendation` fields are `null` in analysis — tabs exist but show "not available"
- No progress indicator during Stockfish analysis (can take 30–60s on long games)
- No re-analyze button on analysis page
- Batch analysis queues jobs as `"pending"` in Supabase — verify worker picks them up
- Old localStorage cache keys (`_v1`) not cleaned up automatically
- Report page UI needs verification with real completed job data

---

## Changelog

### 2026-06-28
- Analysis results cached in Supabase — subsequent visits load instantly
- Dashboard stats cached in localStorage — instant load on return visits
- Fixed win rate by color: now computed from loaded games, handles all result formats
- Fixed Chess.com result normalization — was storing `white.result` for all games
- GameCard now shows Win / Loss / Draw instead of raw result strings
- Phase accuracy bars now always render in correct order (opening → middlegame → endgame)
- Added per-time-control stats cards (Rapid / Blitz / Bullet / Daily) with rating + W/L/D
- Added "Load Games" panel on dashboard — fetch more games without going through onboarding (append or replace mode)
