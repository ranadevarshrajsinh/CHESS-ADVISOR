# Chesskit.org — Complete Analysis, Evaluation & Graph Engine Reference

This document is an exhaustive, source-verified breakdown of **every formula, algorithm, and architectural decision** behind Chesskit's game-analysis pipeline: how a position gets a centipawn score, how that becomes a win %, how moves get labeled (Blunder → Splendid), how "Accuracy" and "Game Rating (Estimated Elo)" are computed, how the evaluation graph is drawn, and — critically — **why the whole thing feels fast despite running a full engine in the browser.**

All code references point to files inside `tools/chesskit/src/` (cloned from `github.com/GuillaumeSD/Chesskit`, branch `main`, commit `9622d50`).

---

## Table of Contents

1. [High-Level Pipeline](#1-high-level-pipeline)
2. [Engine Architecture — Why It's Fast](#2-engine-architecture--why-its-fast)
3. [UCI Protocol Layer — Talking to Stockfish](#3-uci-protocol-layer--talking-to-stockfish)
4. [Core Formula #1: Centipawns → Win Percentage](#4-core-formula-1-centipawns--win-percentage)
5. [Core Formula #2: Move Accuracy (per move)](#5-core-formula-2-move-accuracy-per-move)
6. [Core Formula #3: Game Accuracy (weighted + harmonic blend)](#6-core-formula-3-game-accuracy-weighted--harmonic-blend)
7. [Core Formula #4: Estimated Elo ("Game Rating")](#7-core-formula-4-estimated-elo-game-rating)
8. [Move Classification — The Full Decision Tree](#8-move-classification--the-full-decision-tree)
9. [The Evaluation Graph — Exact Plotting Logic](#9-the-evaluation-graph--exact-plotting-logic)
10. [The Evaluation Bar (board sidebar)](#10-the-evaluation-bar-board-sidebar)
11. [Settings, Defaults & Tunable Parameters](#11-settings-defaults--tunable-parameters)
12. [Data Types Reference](#12-data-types-reference)
13. [Why Accuracy Feels "Right" at Low Depth — Design Rationale](#13-why-accuracy-feels-right-at-low-depth--design-rationale)

---

## 1. High-Level Pipeline

When you click **Analyze**, this sequence runs (`src/sections/analysis/panelHeader/analyzeButton.tsx`):

```
PGN loaded → chess.js game object
    │
    ▼
getEvaluateGameParams(game)          [src/lib/chess.ts]
    → fens[]      : FEN string BEFORE each ply, plus final FEN
    → uciMoves[]  : "e2e4"-style move list
    │
    ▼
engine.evaluateGame({ fens, uciMoves, depth, multiPv, workersNb, playersRatings })
    [src/lib/engine/uciEngine.ts]
    │
    ├─► For every position IN PARALLEL (Promise.all across N workers):
    │      - checkmate?  → synthetic mate-score, skip engine entirely
    │      - stalemate?  → synthetic cp:0, skip engine entirely
    │      - else        → UCI "go depth N" on Stockfish WASM worker
    │
    ▼
positions: PositionEval[]   (raw cp/mate + best lines per ply)
    │
    ├──► getMovesClassification(positions, uciMoves, fens)   → per-move labels
    ├──► computeAccuracy(positions)                          → {white, black} %
    └──► computeEstimatedElo(positions, whiteElo, blackElo)  → {white, black} Elo
    │
    ▼
GameEval { positions, accuracy, estimatedElo, settings }
    │
    ├──► GraphTab        renders the area chart
    ├──► EvaluationBar   renders the board-side bar
    ├──► AnalysisTab     renders Accuracy / Game Rating chips
    └──► ClassificationTab renders per-move Blunder/Mistake/... breakdown
```

Every position is evaluated **independently and in parallel** — this is the single biggest reason analysis feels fast, and it's covered in detail in §2.

---

## 2. Engine Architecture — Why It's Fast

Chesskit runs Stockfish **entirely client-side** as a WebAssembly Web Worker (no server round-trip for the actual search). Speed comes from five compounding design choices:

### 2.1 Full parallelism across positions (not a sequential game-tree walk)

`UciEngine.evaluateGame()` (`src/lib/engine/uciEngine.ts:255`) does **not** analyze move 1, then move 2, then move 3 in sequence. It fires off `Promise.all(fens.map(...))`, evaluating **every ply of the game concurrently**, limited only by how many Stockfish worker instances exist (`workersNb`). A 40-move game (80 plies) with 8 workers evaluates roughly 10 plies "at a time" instead of 80 sequentially.

### 2.2 Multi-threaded worker pool with a job queue

The `UciEngine` class maintains a pool of `EngineWorker` instances (`this.workers`). Each is a full independent Stockfish WASM instance running in its own Web Worker thread:

- `acquireWorker()` grabs any idle worker.
- If none are free, the job is pushed to `workerQueue` and resolved via `releaseWorker()` once a worker frees up (`src/lib/engine/uciEngine.ts:56-83`).
- Worker count is set with `setWorkersNb()`, which spins up/tears down workers to match the target.

The recommended worker count is computed device-adaptively (`src/lib/engine/worker.ts:48`):

```ts
maxWorkersNbFromThreads = max(1, round(hardwareConcurrency - 4), floor(hardwareConcurrency * 2 / 3))
maxWorkersNbFromMemory  = deviceMemory ? max(1, round(deviceMemory)) : 4
maxWorkersNbFromDevice  = isIOS ? 2 : isMobile ? 4 : 8

recommendedWorkers = min(maxWorkersNbFromThreads, maxWorkersNbFromMemory, maxWorkersNbFromDevice)
```

This reserves headroom for the UI thread (subtracting 4 logical cores) while capping at 8 workers on desktop, 4 on mobile, 2 on iOS (Safari's stricter worker/memory limits). Users can override this manually in Settings (1–12 threads).

### 2.3 Fixed-depth search, not fixed-time search

Every position is searched with `go depth N` (default depth **14**, user-adjustable 10–30) rather than `go movetime N`. Depth-limited search on a modern NNUE engine with alpha-beta pruning + late move reductions typically completes depth 14–16 in tens of milliseconds per **quiet** position — fast enough that 40–80 positions in parallel across several workers finishes in a few seconds total.

### 2.4 Engine-tier selection (WASM binary size vs strength)

Chesskit ships multiple prebuilt Stockfish WASM binaries (`public/engines/`) and lets the user pick a speed/strength tradeoff (`src/constants.ts:19-81`, `src/hooks/useEngine.ts`):

| Engine | Size | Notes |
|---|---|---|
| Stockfish 18 | 108MB | Strongest, full NNUE, multi-part WASM |
| **Stockfish 18 Lite** (default) | 7MB | Smaller NNUE net, single WASM file — best speed/strength balance |
| Stockfish 17.1 / 17.1 Lite | 77MB / 7MB | |
| Stockfish 17 / 17 Lite | 75MB / 6MB | |
| Stockfish 16.1 / 16.1 Lite | 64MB / 6MB | |
| Stockfish 16 NNUE / 16 (HCE) | 40MB / 2MB | Legacy hand-crafted-eval fallback |
| Stockfish 11 | 2MB | Oldest, HCE, used as last-resort fallback if WASM unsupported |

`DEFAULT_ENGINE = Stockfish18Lite` — the lite NNUE net is small enough to download instantly and fast enough per-node, while still being strong. `isEngineSupported()` (`src/lib/engine/shared.ts`) probes WASM support and gracefully degrades to Stockfish 11 (asm.js, no WASM required) on unsupported/old browsers.

### 2.5 Skip the engine entirely when the answer is already known

Before calling Stockfish at all, `evaluateGame` checks each FEN with `chess.js`:

```ts
if (checkmate) → synthetic { mate: whoIsCheckmated === "w" ? -1 : 1 }   // instant
if (stalemate) → synthetic { cp: 0 }                                     // instant
```

(`src/lib/engine/uciEngine.ts:284-312`) — terminal positions never touch the engine.

### 2.6 Lichess Cloud Eval cache (single-position hover, not full-game analysis)

When you hover/step through moves on the board (`useCurrentPosition` hook, `src/sections/analysis/hooks/useCurrentPosition.ts`), Chesskit first tries **Lichess's crowd-sourced cloud evaluation cache**:

```
GET https://lichess.org/api/cloud-eval?fen=<fen>&multiPv=<n>     (500ms timeout)
```

If Lichess already has that exact FEN analyzed to sufficient depth/lines, the result is used **instantly with zero local computation** (`src/lib/lichess.ts:13-57`, checked in `evaluatePositionWithUpdate`, `src/lib/engine/uciEngine.ts:359-404`). Only on a cache miss (404/timeout) does it fall back to a local `go depth N` search. This cache is **not** used during full-game batch analysis (`evaluateGame`), only for the interactive single-position eval as you browse the board — full-game analysis always computes locally to guarantee consistent depth/settings across every ply.

A `savedEvals` atom (`src/sections/analysis/states.ts`) also memoizes any FEN already evaluated at the current engine/depth/multiPv combo, so re-visiting a position (or re-analyzing) skips redundant search.

### 2.7 Throttled UI updates, not throttled search

Streaming partial results (used for the live line display while a single position is thinking) are throttled to ~16 updates/sec (`THROTTLE_MS = 60`, `src/lib/engine/uciEngine.ts:372-384`) purely to protect UI render performance — the engine itself is not slowed down; only how often React re-renders is capped.

### 2.8 Non-linear progress bar (perceived speed)

The progress percentage shown during analysis is **not** linear with completed positions:

```ts
progress = completed / totalPositions
displayedProgress = 99 - exp(-4 * progress) * 99
```

(`src/lib/engine/uciEngine.ts:275-280`) — this front-loads visual progress (jumps quickly toward high % early) since early-game/simple positions and forced sequences resolve fastest, giving a snappier subjective feel even though it's cosmetic, not a raw completion percentage.

---

## 3. UCI Protocol Layer — Talking to Stockfish

`src/lib/engine/worker.ts` wraps a raw `Worker` in a promise-based UCI command sender:

```ts
sendCommandsToWorker(worker, commands, finalMessage, onNewMessage) → Promise<string[]>
```

It posts each UCI command string (e.g. `"position fen ..."`, `"go depth 14"`) to the worker, buffers every line the engine prints, and resolves once a line starting with `finalMessage` (usually `"bestmove"`) arrives.

### Parsing (`src/lib/engine/helpers/parseResults.ts`)

For each `info ...` UCI line:
1. Extract `pv` (principal variation, converted from raw UCI squares to castling-aware UCI via `formatUciPv`, which rewrites Chess960-style king-captures-rook castling notation `e1h1`→`e1g1` etc.).
2. Extract `multipv`, `depth`, `cp`, `mate`.
3. **Depth-guard**: if a lower-depth result arrives for a `multipv` slot that already has a deeper result, it's discarded (`if depth < tempResults[multiPv].depth → continue`) — prevents a late/stale shallow update from overwriting a deeper one.
4. **Perspective flip**: UCI `cp`/`mate` scores are always from the *side to move's* perspective. Chesskit normalizes everything to **White's perspective**: if it's Black to move, `cp` and `mate` are negated (`src/lib/engine/helpers/parseResults.ts:49-56`). This is why every downstream formula (win%, classification, accuracy) can assume "positive = good for White" uniformly.
5. Lines are sorted (`sortLines`) so mate-for-me always outranks any cp score, mate-for-me sorted by *shortest mate first*, and mate-against-me always ranks last.

### MultiPV & Elo-limiting

- `setMultiPv(n)` (2–6) sends `setoption name MultiPV value n` to every worker so the engine reports the top N candidate moves, not just the best — this is what allows "second best move" comparisons used in move classification (Splendid/Perfect detection) and the multi-line engine display.
- `setElo(elo)` (1320–3190) is used only for **Play vs Computer** mode (`getEngineNextMove`), via `UCI_LimitStrength` + `UCI_Elo`, unrelated to analysis.

---

## 4. Core Formula #1: Centipawns → Win Percentage

**File**: `src/lib/engine/helpers/winPercentage.ts`. Directly ported from Lichess's `lila` (`modules/analyse/src/main/WinPercent.scala`).

```
cpCeiled = clamp(cp, -1000, 1000)

WinChances = 2 / (1 + e^(-0.00368208 × cpCeiled)) − 1

WinPercentage = 50 + 50 × WinChances
```

Equivalently:

$$W\% = 50 + 50\left(\frac{2}{1+e^{-0.00368208\cdot CP}} - 1\right)$$

- This is a **logistic sigmoid** centered at 0 cp = 50%, saturating toward 0%/100% as `|cp|` grows, clipped at ±1000 cp (10 pawns) so a +25 queen-up position and a +9 queen-up position both read ~100%.
- **Mate scores bypass the sigmoid entirely**: `mate > 0 → 100%`, `mate ≤ 0 → 0%` (`getWinPercentageFromMate`). No distinction between "mate in 1" and "mate in 20" — both are simply a won/lost game state.
- This win% is the *universal currency* the rest of the app converts everything into: move quality, accuracy, and the graph's y-axis are all downstream of this one function.

---

## 5. Core Formula #2: Move Accuracy (per move)

**File**: `src/lib/engine/helpers/accuracy.ts`, function `getMovesAccuracy`. Ported from Lichess `lila`'s `AccuracyPercent.scala`.

Step 1 — compute the win% **drop** caused by the move, from the mover's perspective:

```
winDiff = isWhiteMove
  ? max(0, winPercent_before − winPercent_after)
  : max(0, winPercent_after − winPercent_before)
```

(Only *losses* count — if a move improved your win%, `winDiff = 0`.)

Step 2 — exponential decay curve maps the drop to a 0–100 accuracy score:

$$Acc_{raw} = 103.1668100711649 \times e^{-0.04354415386753951 \times winDiff} - 3.166924740191411$$

```
moveAccuracy = clamp(Acc_raw + 1, 0, 100)
```

- At `winDiff = 0` (perfect, no loss): `Acc ≈ 100`.
- The curve decays smoothly rather than in hard buckets, so a 3% drop and an 8% drop get meaningfully different accuracy scores even though they might land in the same *classification* bucket (Excellent/Okay).
- The `+1` is a constant offset calibration term carried over verbatim from Lichess's source.

---

## 6. Core Formula #3: Game Accuracy (weighted + harmonic blend)

**File**: `src/lib/engine/helpers/accuracy.ts`, `computeAccuracy` / `getPlayerAccuracy` / `getAccuracyWeights`.

This is the most statistically involved part of the whole system — a simple average of per-move accuracies is **not** used. Instead:

### 6.1 Complexity-adaptive weights (sliding window std-dev)

```
windowSize = clamp(ceil(totalPlies / 10), 2, 8)
halfWindow = round(windowSize / 2)

for each ply i (from 1 to end):
    window = winPercentages[i - halfWindow : i + halfWindow]   // clipped to array bounds
             (falls back to the first/last `windowSize` slice at the edges)
    weight[i] = clamp(stdDev(window), 0.5, 12)
```

**Why**: the standard deviation of win% inside a local window measures how *volatile/tactical* that stretch of the game is. A quiet, drawish endgame has near-zero std-dev (low weight); a sharp tactical melee swings win% wildly (high weight, clamped at 12). This means **mistakes in sharp positions count more toward lowering accuracy than mistakes in already-decided/quiet positions** — the opposite of a flat average, which would treat every ply equally regardless of context.

### 6.2 Two independent means, then averaged

For each player (moves filtered by parity — white = even indices, black = odd):

```
weightedMean  = Σ(moveAccuracy[i] × weight[i]) / Σ(weight[i])

harmonicMean  = n / Σ(1 / max(moveAccuracy[i], 10))     // floor of 10 avoids division blow-up

FinalAccuracy = (weightedMean + harmonicMean) / 2
```

- **Weighted mean** rewards/penalizes according to positional complexity (§6.1).
- **Harmonic mean** is mathematically dominated by *small* values — a single very low move-accuracy (a blunder) drags the harmonic mean down far more than it would drag an arithmetic mean, so **one big blunder can't be "hidden" by a streak of perfect moves**. The `max(a, 10)` floor prevents a literal 0-accuracy move from making the harmonic mean degenerate to ~0 for the whole game.
- Averaging the two balances "context-aware fairness" (weighted mean) against "blunders must hurt" (harmonic mean).

This whole pipeline is displayed in `AnalysisTab` as `Accuracy: {white.toFixed(1)}% / {black.toFixed(1)}%`.

---

## 7. Core Formula #4: Estimated Elo ("Game Rating")

**File**: `src/lib/engine/helpers/estimateElo.ts`. Source cited in-code: a Lichess forum post on estimating Elo from ACPL (average centipawn loss).

### 7.1 Average Centipawn Loss (ACPL) per side

```
for each ply pair (previousCp → currentCp), clamped to [-1000, 1000] (mate treated as ±∞ before clamping, i.e. saturates to the clamp bound):

  White move: whiteCpl += max(0, previousCp − currentCp), capped at 1000 per move
  Black move: blackCpl += max(0, currentCp − previousCp), capped at 1000 per move

whiteCpl_avg = Σ whiteCpl / ceil((totalPlies − 1) / 2)
blackCpl_avg = Σ blackCpl / floor((totalPlies − 1) / 2)
```

This is the "damage per move" metric — how many centipawns of evaluation, on average, each player gave back to their opponent relative to the engine's top choice trajectory.

### 7.2 Elo from ACPL (unconditional baseline)

$$Elo_{fromCpl} = 3100 \times e^{-0.01 \times ACPL}$$

(A perfect 0-ACPL game → ~3100 Elo ceiling, roughly super-GM/engine level. As ACPL rises, estimated strength decays exponentially.)

### 7.3 Rating-aware adjustment (if the player's actual rating is known)

If a PGN/Lichess/Chess.com rating (`whiteElo`/`blackElo`) is available, the estimate is **anchored and adjusted relative to expectation at that rating**, rather than used as a raw absolute number:

```
expectedCpl(rating) = -100 × ln( min(rating, 3100) / 3100 )     // inverse of the formula above

cplDiff = actualGameCpl − expectedCpl(rating)

if cplDiff == 0:  estimatedElo = eloFromCpl                     // exactly matches expectation
if cplDiff  > 0:  estimatedElo = rating × e^(-0.005 × cplDiff)   // played worse than usual → adjust down
if cplDiff  < 0:  estimatedElo = rating / e^(-0.005 × |cplDiff|) // played better than usual → adjust up
```

If no rating is provided for a player, the **opponent's** rating is used as a stand-in (`whiteElo ?? blackElo` and vice versa) before falling back to the unconditional `eloFromCpl` if neither side has a known rating.

**Effect**: this is why "Game Rating" tends to track close to a player's real rating rather than swinging wildly to 3100 after one clean game — it's explicitly anchored to prior rating and only drifts based on *this game's* deviation from that rating's expected ACPL, decaying exponentially (0.5%/cp of deviation) rather than linearly.

---

## 8. Move Classification — The Full Decision Tree

**File**: `src/lib/engine/helpers/moveClassification.ts`, function `getMovesClassification`. Evaluated **in this exact priority order** per move — first match wins:

```
1. Opening       → current position's FEN (piece placement only) matches an entry in
                    src/data/openings.ts (an ECO-style named-opening database)

2. Forced        → the PREVIOUS position had only 1 line reported by the engine
                    (no alternative to compare against — nothing else was legal/sane to play)

3. Splendid      → see §8.1 below   (Chesskit's "Brilliant" — sacrifice-based)

4. Perfect       → see §8.2 below   (Chesskit's "Great" — only-move / outcome-changing)

5. Best          → playedMove === previousPosition.bestMove   (matches engine's #1 line exactly)

6. (fallback) Excellent / Okay / Inaccuracy / Mistake / Blunder
                 → pure win%-drop gate, see §8.3
```

Every branch also tags the move with the currently-tracked `opening` name (carried forward from the last matched opening entry) for opening-name display in the UI.

### 8.1 "Splendid" (brilliant-move equivalent)

All of the following must hold:

1. An alternative (2nd-best) line existed at the previous position (`multiPv ≥ 2` had a result).
2. Win% drop from playing this move is `≤ 2` (i.e. it wasn't actually a mistake by the raw eval).
3. `getIsPieceSacrifice(fen, playedMove, bestLinePv)` returns `true` — see §8.1.1.
4. It must **not** be classified as "losing or the alternative is completely winning" (§8.1.2) — i.e., you're not sacrificing while already lost, and the 2nd-best alternative wasn't already a walkover win (>97%/<3%) that would make the sacrifice unnecessary showmanship rather than the *correct* choice.

#### 8.1.1 Piece sacrifice detection (`getIsPieceSacrifice`, `src/lib/chess.ts:194`)

This walks forward through `[playedMove, ...bestLinePv]` (trimmed to an even number of plies so the comparison is symmetric), tracking every capture by color. It then:

- Cancels out pieces of equal type captured by both sides (a piece-for-piece trade isn't a sacrifice).
- Bails out (`false`) if the only "sacrificed" material nets out to a ≤1-piece pawn-only difference (pawn pushes/trades aren't sacrifices).
- Computes material balance (`getMaterialDifference`, standard P=1/N=B=3/R=5/Q=9 point values) **before** vs **after** this forward-looking sequence.
- Returns `true` only if the player's own material balance *decreased* relative to the pre-move baseline — i.e., they are down real material in the resulting principal variation, not just temporarily during an in-between capture.

#### 8.1.2 `isLosingOrAlternateCompletelyWinning` (shared guard, also used by Perfect)

```
isLosing = (mover is White) ? winPercentageAfter < 50 : winPercentageAfter > 50
isAlternateCompletelyWinning = (mover is White)
    ? alternativeLineWinPercentage > 97
    : alternativeLineWinPercentage < 3

reject Splendid/Perfect if isLosing OR isAlternateCompletelyWinning
```

### 8.2 "Perfect" (great-move equivalent)

All of the following must hold:

1. An alternative line existed at the previous position.
2. Win% drop `≤ 2`.
3. **Not** a "simple piece recapture" (`isSimplePieceRecapture`, §8.2.1) two plies back — an automatic recapture on the same square isn't impressive enough to be "Perfect" even if technically best.
4. Passes the same `isLosingOrAlternateCompletelyWinning` guard as Splendid.
5. **AND** at least one of:
   - `getHasChangedGameOutcome` — win% swung from `<50%` to `>50%` (or vice-versa) by more than 10 points because of this move (i.e., the move flipped who's winning).
   - `getIsTheOnlyGoodMove` — the best line beats the runner-up alternative line by more than 10 win% points (i.e. every other move loses meaningfully — this was the *only* correct choice).

#### 8.2.1 Simple piece recapture (`isSimplePieceRecapture`, `src/lib/chess.ts:179`)

Given the two most recent UCI moves, checks whether both moves land on the **same destination square** and that square currently holds a piece (i.e., ply N-1 captured on square X, and this move recaptures on square X). Purely mechanical recaptures are excluded from "Perfect" even when they're objectively the engine's top choice.

### 8.3 Fallback: pure win%-drop gate

If none of Opening/Forced/Splendid/Perfect/Best matched:

```
winPercentageDiff = (winPercentAfter − winPercentBefore) × (isWhiteMove ? 1 : -1)

winPercentageDiff < -20  → Blunder
winPercentageDiff < -10  → Mistake
winPercentageDiff <  -5  → Inaccuracy
winPercentageDiff <  -2  → Okay
otherwise                → Excellent
```

| Classification | Win% swing (mover's perspective) | Color |
|---|---|---|
| Splendid | special (sacrifice) | `#19d4af` |
| Perfect | special (only-move / outcome-changing) | `#3894eb` |
| Best | matches engine's top line | `#22ac38` |
| Excellent | ≥ −2 | `#22ac38` |
| Okay | [−5, −2) | `#74b038` |
| Inaccuracy | [−10, −5) | `#f2be1f` |
| Mistake | [−20, −10) | `#e69f00` |
| Blunder | < −20 | `#df5353` |
| Forced / Opening | n/a | `#dbac86` |

(Color source: `src/constants.ts:6-17`.)

---

## 9. The Evaluation Graph — Exact Plotting Logic

**File**: `src/sections/analysis/panelBody/graphTab/index.tsx`. Built with `recharts` (`AreaChart`).

### 9.1 Y-axis value transform (`formatEvalToChartData`)

The chart's Y domain is fixed to `[0, 20]` (not raw centipawns) — everything is remapped:

```
if mate:      value = mate > 0 ? 20 : 0                         // full-scale saturation for forced mate
elif cp:      value = clamp(cp / 100, -10, 10) + 10             // pawns, shifted so 0 pawns → 10 (mid-chart)
else:         value = 10                                        // no eval yet → dead-center
```

So the chart's midline (10) = dead-equal, top (20) = White completely winning/mating, bottom (0) = Black completely winning/mating. A flat `#ffffff` `Area` fill is drawn against this line with `type="monotone"` smoothing, giving the familiar white/black eval-swing silhouette (the fill's own background block behind it is dark, `#2e2e2e`, so it visually reads as a two-tone White-advantage-vs-Black-advantage graph even though only one series is plotted).

A horizontal `ReferenceLine` at `y=10` marks the equal-material baseline. A vertical `ReferenceLine` at `x = currentPosition.currentMoveIdx`, colored by the current move's classification color, tracks the board cursor across the graph.

### 9.2 Dot annotation strategy (which moves get a visible marker)

Not every move gets a dot — that would be visual noise. `renderDot` (custom dot renderer) shows a marker **only** when:

- Classification is `Splendid`, `Perfect`, `Blunder`, or `Mistake` (always shown — these are the "headline" moments), **or**
- Classification is `Best`, **and** the move's index is in a randomly-sampled 15% subset of all `Best` moves.

The `Best`-move sampling (`bestDotIndices`, lines 40-51) works as follows:

```
bestItems = all chart points with classification === Best
sampleCount = ceil(bestItems.length × 0.15)
shuffle(bestItems.moveNb list)          // Fisher–Yates
bestDotIndices = first `sampleCount` indices from the shuffled list
```

This gives a sparse, randomized sprinkling of "Best" markers so the graph isn't cluttered with a dot on every single good move, while still visually confirming the player found best moves throughout — re-running analysis will show a *different* random subset each time (this sampling is not seeded).

### 9.3 Interaction

Clicking anywhere on the chart (`onClick`) reads the nearest point's `payload.moveNb` and calls `goToMove(moveNb, game)`, jumping the board to that ply — the chart doubles as a scrubber.

### 9.4 Tooltip

Hovering shows `getLineEvalLabel(data)` (`src/lib/chess.ts:345`): `"+1.25"`-style pawn value (`cp / 100`, 2 decimals, sign-prefixed) or `"+M4"` / `"-M4"` for forced mate.

---

## 10. The Evaluation Bar (board sidebar)

**File**: `src/components/board/evaluationBar.tsx` + `getEvaluationBarValue` (`src/lib/chess.ts:133`).

```
whiteBarPercentage = getPositionWinPercentage(position)     // same sigmoid as §4, 0–100 scale directly usable as a fill %

label:
  if mate:      "M{abs(mate)}"
  elif cp:      pEval = abs(cp) / 100 → toFixed(1)   (falls back to toFixed(0) if the string is >3 chars, e.g. "12.3" → "12")
  else:         "0.0"
```

The bar only updates once `bestLine.depth >= 6` (`evaluationBar.tsx:27`) — shallow/in-flight evaluations are ignored to avoid the bar flickering wildly during the first few depth iterations of a live search; it waits for at least a minimally-stable depth-6 read before trusting the number. The bar's fill height is a direct 1:1 mapping of `whiteBarPercentage` — no additional curve is applied at this stage (the sigmoid in §4 already did the perceptual compression).

---

## 11. Settings, Defaults & Tunable Parameters

(`src/sections/analysis/states.ts`, `src/sections/engineSettings/engineSettingsDialog.tsx`)

| Parameter | Default | Range | Effect |
|---|---|---|---|
| Engine | Stockfish 18 Lite | 11 engine options | Strength/size/speed tradeoff |
| Max depth | **14** | 10 – 30 | Passed as `go depth N` per position |
| MultiPV (number of lines) | **3** | 2 – 6 | How many candidate lines the engine reports — required ≥2 for Splendid/Perfect "alternative line" comparisons |
| Worker threads | `getRecommendedWorkersNb()` (device-adaptive) | 1 – 12 | Parallel positions analyzed simultaneously |

All are persisted to `localStorage` via `useAtomLocalStorage` so settings survive reloads.

---

## 12. Data Types Reference

(`src/types/eval.ts`)

```ts
interface LineEval {
  pv: string[];       // principal variation, UCI moves, castling-normalized
  cp?: number;         // centipawns, White-perspective, undefined if mate
  mate?: number;       // moves to mate, White-perspective, undefined if cp
  depth: number;
  multiPv: number;     // 1 = best line, 2 = second best, ...
}

interface PositionEval {
  bestMove?: string;
  moveClassification?: MoveClassification;
  opening?: string;
  lines: LineEval[];   // sorted best-first via sortLines()
}

interface Accuracy         { white: number; black: number; }   // 0-100
interface EstimatedElo     { white: number; black: number; }   // Elo points

interface GameEval {
  positions: PositionEval[];   // length = plies + 1 (includes starting position)
  accuracy: Accuracy;
  estimatedElo?: EstimatedElo;
  settings: { engine, depth, multiPv, date };
}
```

---

## 13. Why Accuracy Feels "Right" at Low Depth — Design Rationale

Putting the whole picture together, three independent design choices compound to make Chesskit's output feel authoritative despite modest default settings (depth 14, not 20+; a 7MB "Lite" NNUE net, not the 108MB full net):

1. **The math absorbs engine noise.** The win%-sigmoid (§4) intentionally compresses large cp swings into a saturating curve — the difference between "+8.00" and "+11.00" (both effectively winning) barely moves the needle, so small evaluation jitter between depth 14 and depth 20 rarely changes a move's *classification* or *accuracy contribution*, even if the raw cp number itself would differ.
2. **Complexity-weighted, dual-mean accuracy (§6) is inherently more forgiving of engine noise in already-decided positions** and inherently *stricter* in sharp ones — exactly where a shallower search is most likely to miss something, the human-perceptible cost of a small miscalculation is also naturally amortized across a high-weight, high-variance window rather than a single misleading cp reading.
3. **Structural shortcuts remove entire classes of engine error**: checkmate/stalemate are hard-coded (§2.5), the "Forced" label short-circuits classification when there's only one sane line, and MultiPV≥2 gives the classifier an actual alternative to reason about (not just "was this the top move") — cutting down on cases where a shallow search's single-PV top choice would otherwise mislabel a move.

Combined with real parallel hardware utilization (§2.1–§2.2) and skipping the network entirely for full-game analysis (local WASM, no server latency), Chesskit trades a small amount of raw search depth for a large, statistically-informed post-processing layer — arriving at ratings/accuracy numbers that track close to Lichess's own (since the constants are literally copied from `lila`), at a fraction of the wall-clock cost of a deep single-threaded search.
