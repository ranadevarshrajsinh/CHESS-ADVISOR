# Product

## Register

product

<!-- The landing page is a brand surface; analysis, dashboard, puzzles, and coach portal are product surfaces. Commands scoped to marketing pages should apply the brand register. -->

## Users

**Chess players** (the primary audience) — active Chess.com or Lichess players who want to understand *why* they're losing, not just that they are. They range from motivated club players to self-coaching amateurs. They sit down after a game (or after a bad blunder) and want actionable insight fast.

**Coaches** — use the portal to review student games, leave move-level annotations, and track improvement over time. They value precision and context, not summaries.

**Students in a coach relationship** — younger or less technical; guided by their coach but use the puzzle and analysis tools independently between sessions.

## Product Purpose

Chess Advisor is a full-stack chess analysis and coaching platform. It runs Stockfish 18 (WASM) in the browser to analyze individual games from Chess.com or Lichess, surface accuracy breakdowns by phase (opening / middlegame / endgame), flag blunders and best moves, and train weaknesses through spaced-repetition puzzles generated from the player's own mistakes.

The platform caches results in Supabase so repeat visits are instant. A coach portal lets coaches manage players, view their analyses, and annotate specific moves. A batch mode queues up to 10 recent games for analysis in one pass.

Success looks like a player finishing a session with a clear, ranked list of the 1–2 things to fix — not a wall of data.

## Brand Personality

Smart · Clean · Focused

The tone is a sharp analyst, not a cheerleader. No gamified language, no badge noise, no empty encouragement. It respects the player's intelligence and their time.

## Anti-references

- **Corporate enterprise tools** — blue-gray neutrals, dense unloved tables, no personality. Chess Advisor should feel like a craft product, not an HR dashboard.
- Generic SaaS "AI startup" aesthetic as a secondary soft-avoid: no sand/cream backgrounds, no gradient text, no eyebrow labels on every section.

## Design Principles

1. **Data over decoration** — every visual element earns its place by serving comprehension of the analysis. If it doesn't help a player understand their game, remove it.
2. **Precision as personality** — the UI should feel as accurate and deliberate as the engine. Layouts are tight, labels are exact, hierarchy is unambiguous.
3. **Accessible depth** — complex multi-layered analysis behind a simple, scannable surface. Never hide the power, but never lead with the complexity either.
4. **Consistent across surfaces** — the same design identity from the landing hero to the deepest engine parameter screen. Marketing and app use the same tokens, the same components, the same voice.
5. **Credibility through restraint** — earn trust by staying out of the way. No motion that isn't purposeful, no color that isn't informative, no copy that isn't precise.

## Accessibility & Inclusion

WCAG AA minimum throughout: body text ≥ 4.5:1, large text ≥ 3:1. Reduced motion respected via `@media (prefers-reduced-motion)` on all transitions and animations. Touch targets ≥ 44px on mobile. The dark-first theme is the primary surface; light mode is a supported override.
