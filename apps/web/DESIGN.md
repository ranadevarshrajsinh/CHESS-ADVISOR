---
name: Chess Advisor
description: Stockfish-powered chess analysis and coaching platform
colors:
  accent: "#1dc189"
  accent-deep: "#15a373"
  ink: "#f7f7f7"
  ink-muted: "#a1a1aa"
  ground: "#0f0f0f"
  surface-1: "#161616"
  surface-2: "#1f1f1f"
  border: "#2a2a2a"
  border-strong: "#3a3a3a"
  quality-best: "#10b981"
  quality-inaccuracy: "#f59e0b"
  quality-mistake: "#f97316"
  quality-blunder: "#ef4444"
  quality-brilliant: "#6366f1"
  quality-muted: "#71717a"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2.8rem, 5.5vw, 5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "99px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "#f5f5f5"
    textColor: "#050505"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "#000000"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  input-focus:
    backgroundColor: "{colors.surface-2}"
---

# Design System: Chess Advisor

## 1. Overview

**Creative North Star: "The Analyst's Cockpit"**

Chess Advisor is precision instrumentation for serious minds. Every surface earns its place by informing a decision — not by looking impressive. The design aesthetic is that of a high-end tool used in a focused environment: no ambient decoration, no blur atmospherics, no surface for the sake of surface. The information is the design.

The palette is near-black with tonal charcoal steps and a single saturated accent. Cards are solid, bordered, and clear — the tonal step from `#0f0f0f` ground to `#161616` surface to `#1f1f1f` elevated element provides all the depth the interface needs. Backdrop blur is prohibited. Gradients are prohibited. The discipline of restraint is what separates a tool from a toy.

Typography carries the hierarchy. Space Grotesk leads on headings — geometric, confident, slightly technical. Inter handles dense body copy and labels — readable, neutral, precise. The two fonts create a clear analytic voice: one for structure, one for content.

This design explicitly rejects corporate enterprise aesthetics (blue-gray tables, lifeless layouts) and the saturated AI startup aesthetic (glassmorphism, cream backgrounds, gradient text). It also rejects the gamified chess-platform look (neon, particle effects, trophy animations). The model is a professional-grade analytical tool that happens to be for chess.

**Key Characteristics:**
- Near-black tonal surfaces with no blur, no transparency layers
- Signal Green (`#1dc189`) as the sole saturated color — used exclusively for correct play, accuracy, and primary CTAs
- Move quality palette (6 semantic data colors) used only for classification — never for decoration
- Space Grotesk + Inter type pairing: display confidence meets reading clarity
- Tight radii (6–12px); surfaces feel precise, not soft
- Transitions present but restrained — state changes only, 0.2s max

## 2. Colors: The Cockpit Palette

A near-monochromatic dark system with one intentional breach of restraint: Signal Green.

### Primary
- **Signal Green** (`#1dc189`): The engine's verdict. Used for best moves, high accuracy scores, and primary action buttons. Its rarity is the point — when it appears, it means something correct happened.
- **Signal Green Deep** (`#15a373`): Hover state for Signal Green elements only. Never used standalone.

### Neutral
- **Ground** (`#0f0f0f`): The page background. Near-black, not pure black — pure black creates harsh contrast that fatigues on long analysis sessions.
- **Surface One** (`#161616`): Card and panel backgrounds. The primary content container.
- **Surface Two** (`#1f1f1f`): Elevated elements — hover states, focused inputs, nested panels within cards.
- **Border** (`#2a2a2a`): Default structural border. 1px solid on all cards and inputs.
- **Border Strong** (`#3a3a3a`): Active/hover border state. Signals interactivity without color.
- **Ink** (`#f7f7f7`): Primary text. Not pure white — the slight warmth reduces harshness against the near-black ground.
- **Ink Muted** (`#a1a1aa`): Secondary text, labels, placeholders, helper copy.

### Secondary (Move Quality Data Palette)
These colors classify chess move quality. They are a data legend, not a brand palette — never used for layout decoration, background fills, or button colors.

- **Quality Best** (`#10b981`): Best, excellent, and good moves.
- **Quality Brilliant** (`#6366f1`): Brilliant moves (rare; the indigo distinguishes it from Best).
- **Quality Inaccuracy** (`#f59e0b`): Inaccuracies.
- **Quality Mistake** (`#f97316`): Mistakes.
- **Quality Blunder** (`#ef4444`): Blunders.
- **Quality Muted** (`#71717a`): Book moves and forced moves — gray signals no judgment.

### Named Rules
**The One Signal Rule.** Signal Green is the only saturated color on any given screen. Move quality colors exist at small scale (badges, dots, bars). If Signal Green and a quality color appear in the same view, Signal Green must always read as primary — never let a quality color compete with it by size or placement.

**The Data Palette Quarantine Rule.** Quality colors (`quality-best` through `quality-muted`) are forbidden from appearing on buttons, backgrounds, borders, or decorative elements. Their meaning is semantic: they classify moves. Using them decoratively destroys the semantic signal.

## 3. Typography

**Display Font:** Space Grotesk (wght 400–800, from Google Fonts)
**Body Font:** Inter (wght 300–700, from Google Fonts)
**Notation Font:** System monospace (`Courier New, monospace`) — for PGN, move sequences, and engine output only.

**Character:** Space Grotesk is geometric and slightly technical — it reads as authored and confident without being cold. Inter is the most readable sans-serif for dense data and long analysis copy. Together they create a clear analytic voice: Space Grotesk for structure and identity, Inter for content and legibility.

### Hierarchy
- **Display** (Space Grotesk, 700, `clamp(2.8rem, 5.5vw, 5rem)`, lh 1.05, ls -0.02em): Landing page hero and major section titles only.
- **Headline** (Space Grotesk, 600, `clamp(1.8rem, 3.5vw, 2.8rem)`, lh 1.15, ls -0.02em): Section headings within the app; report page titles.
- **Title** (Space Grotesk, 600, `1.1rem`, lh 1.3, ls -0.01em): Card headings, panel titles, dialog headers.
- **Body** (Inter, 400, `0.95rem`, lh 1.6): Analysis text, explanations, game metadata. Cap line length at 70ch on desktop.
- **Label** (Inter, 500, `0.8rem`, lh 1.4, ls 0.02em): Form labels, stat labels, table headers, badge text. Often uppercase for structural labels.
- **Notation** (Courier New, 400, `0.88rem`, lh 1.5): PGN moves, engine lines, coordinate notation only.

### Named Rules
**The Heading Weight Rule.** Headings (`h1`–`h3`) use letter-spacing `-0.02em`. This is not a preference — at display sizes, default tracking makes Space Grotesk feel loose. Never override to a positive value on large type.

**The Monospace Quarantine Rule.** Monospace (Courier New or system mono) appears only for chess notation, engine output, and coordinates. It never appears in nav, labels, headings, or body copy — using it outside notation contexts undermines the semantic signal.

## 4. Elevation

Chess Advisor uses **tonal layering**, not shadows. Depth is communicated entirely through surface color steps: the page sits on Ground (`#0f0f0f`), cards float on Surface One (`#161616`), and elevated or active states sit on Surface Two (`#1f1f1f`). A 1px solid border in `#2a2a2a` delineates surfaces from each other.

Backdrop-filter blur is not part of this system. Glass morphism is explicitly prohibited.

### Elevation Steps
- **Ground** (`#0f0f0f`): The base. Nothing sits at ground level except the body background.
- **Surface One** (`#161616`, 1px border `#2a2a2a`): Cards, panels, sidebars — the primary container elevation.
- **Surface Two** (`#1f1f1f`, 1px border `#3a3a3a`): Hover states on interactive cards, focused inputs, nested elements inside a Surface One card.

### Shadow Vocabulary
No ambient shadow on resting surfaces. One selective exception:

- **Focus Ring** (`0 0 0 3px rgba(255, 255, 255, 0.08)`): Applied to focused interactive elements (inputs, buttons) — a glow, not a shadow. Keeps keyboard focus accessible against the dark ground without introducing depth.

### Named Rules
**The No-Blur Rule.** `backdrop-filter: blur()` and `-webkit-backdrop-filter` are prohibited. Depth is tonal — Surface One sits 7 lightness steps above Ground; Surface Two sits 7 more. The visual hierarchy is just as clear; the blur is just visual noise.

**The Flat-at-Rest Rule.** Resting surfaces carry no `box-shadow`. Hover states may shift border color from `#2a2a2a` to `#3a3a3a` and background from Surface One to Surface Two. That is the full hover vocabulary for non-interactive cards.

## 5. Components

### Buttons
Buttons are the one place contrast is allowed to spike. The primary button is white-on-dark: `#f5f5f5` background, `#050505` text. Against the near-black ground, it reads as the single strongest CTA on the page. No accent color on primary buttons — Signal Green is reserved for data meaning.

- **Shape:** Gently curved (8px radius, `{rounded.md}`)
- **Primary:** `#f5f5f5` background, `#050505` text, `10px 20px` padding, 600 weight, 14px size
- **Primary Hover:** `#ffffff` background, `translateY(-1px)`, `box-shadow: 0 8px 24px rgba(255, 255, 255, 0.12)` — the one place a subtle shadow appears
- **Secondary:** Surface One background (`#161616`), Ink Muted text, 1px border `#2a2a2a`
- **Secondary Hover:** Surface Two background (`#1f1f1f`), Ink text, border `#3a3a3a`
- **Touch (pointer: coarse):** No translateY on hover. Active state: `scale(0.97)`, 0.1s ease.

### Cards / Panels
Cards are the primary information container. Solid, bordered, no blur.

- **Corner Style:** Gently curved (8px, `{rounded.md}`)
- **Background:** Surface One (`#161616`)
- **Border:** 1px solid `#2a2a2a`
- **Hover (interactive cards only):** Background shifts to Surface Two (`#1f1f1f`), border shifts to `#3a3a3a`, `translateY(-2px)` lift, 0.3s transition
- **Internal Padding:** `24px` desktop, `16px` mobile
- **Shadow:** None at rest. No inset rim-lighting effect.

### Inputs / Fields
Inputs blend into the surface — they are not heavily styled containers.

- **Style:** Surface One background (`#161616`), 1px solid border `#2a2a2a`, 6px radius (`{rounded.sm}`)
- **Focus:** Border shifts to `rgba(255, 255, 255, 0.52)`, background to Surface Two (`#1f1f1f`), focus ring `0 0 0 3px rgba(255, 255, 255, 0.08)`
- **Label:** Inter 500, 13px, Ink Muted, 6px below the label
- **Font Size:** 15px desktop, 16px mobile (prevents iOS auto-zoom)
- **Disabled:** Opacity 0.4, cursor not-allowed

### Navigation
The header is a contained element: Surface One background, 1px bottom border `#2a2a2a`. No blur.

- **Height:** 70px desktop, 60px mobile
- **Logo:** ♛ chess queen glyph in a 36px rounded-square container, gradient `135deg, #ffffff → #9ca3af`. "Chess" in Inter 500, "Advisor" in Inter 600 bright white.
- **Nav links:** Inter 500, 14px, Ink Muted default, Ink on hover/active. No underlines.
- **Mobile:** Hamburger icon (3 × 1px lines), full-screen or panel slide-in.
- **Border:** 1px solid `#2a2a2a` on bottom only; no shadow.

### Move Quality Badge (Signature Component)
The chess-specific classification badge: a small colored dot or pill that appears on each analyzed move.

- **Shape:** 20px diameter dot, or `4px 8px` pill with text (border-radius 99px)
- **Color:** Semantic only — one of the six quality colors
- **Text (when pill):** Inter 500, 11px, uppercase
- **Pop-in animation:** `symPop` 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) on appear
- **Never:** Use quality colors as card background or section fill. Dot or pill only.

### Win Probability / Phase Accuracy Bars
Recharts-based horizontal bars for game phase accuracy (opening / middlegame / endgame).

- **Track background:** Border color `#2a2a2a`
- **Fill:** `quality-best` (`#10b981`) for accuracy, gradient from `quality-blunder` to `quality-best` for win probability
- **Height:** 8px resting, 10px on hover
- **Phase order:** Always opening → middlegame → endgame. Never reordered.

## 6. Do's and Don'ts

### Do:
- **Do** use Surface One (`#161616`) as the card background and Surface Two (`#1f1f1f`) as the hover/elevated state — these two steps provide all the depth the interface needs.
- **Do** reserve Signal Green (`#1dc189`) for correct play, high accuracy, and primary actions only. Its scarcity is its meaning.
- **Do** use 1px solid borders in `#2a2a2a` on all cards and inputs. Borderless surfaces on a dark ground read as merged and ambiguous.
- **Do** shift border color from `#2a2a2a` to `#3a3a3a` and background from Surface One to Surface Two for hover states on interactive cards — this is the full hover vocabulary.
- **Do** use monospace (Courier New) exclusively for PGN notation and engine output. Body copy and labels use Inter.
- **Do** apply `letter-spacing: -0.02em` to all display and headline type (Space Grotesk at large sizes needs it).
- **Do** use `text-wrap: balance` on h1–h3 to prevent uneven line breaks at responsive sizes.
- **Do** respect `@media (prefers-reduced-motion)` — all transitions must have a reduced-motion alternative (typically instant or crossfade).
- **Do** maintain minimum 44px touch targets on all interactive elements on mobile.

### Don't:
- **Don't** use `backdrop-filter: blur()` or `-webkit-backdrop-filter` anywhere in the system. Glassmorphism is prohibited — it was the old system and this is the replacement.
- **Don't** use transparency layers or `rgba()` glass-card backgrounds. Surfaces are solid colors from the tonal scale.
- **Don't** use gradient text (`background-clip: text`). Never. It is decorative, never meaningful, and explicitly banned.
- **Don't** use quality colors (`quality-best`, `quality-blunder`, etc.) on backgrounds, borders, or decorative elements. They are a data legend; using them decoratively destroys their semantic meaning.
- **Don't** use `box-shadow` on resting card surfaces. Shadows appear only on the primary button hover state and focus rings.
- **Don't** use the corporate enterprise aesthetic: blue-gray neutrals, dense unloved tables, lifeless typography. Chess Advisor is a craft product.
- **Don't** introduce a second accent hue. Signal Green is the only saturated color in the system. Introducing a second one collapses the "one signal" doctrine.
- **Don't** use eyebrow labels (small all-caps text above every section heading). One deliberate named label in a specific context is voice; an eyebrow on every section is AI scaffold.
- **Don't** nest cards. Surface One inside Surface One creates no depth; it creates visual mud. Use spacing and border to delineate nested content instead.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe. Never a valid design choice — use full borders, background tints, or leading icons instead.
