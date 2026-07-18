# Chess Advisor — Infrastructure Cost Analysis & Pricing Recommendation

> **Internal document.** Cost model, scaling projections, and suggested pricing for Coaches and Academies.
> Last updated: 2026-07-18

---

## 1. Executive Summary

Chess Advisor is architecturally cheap to run because **the most compute-heavy workload — Stockfish 18 analysis — runs client-side in the user's browser via WASM**. This shifts what would otherwise be our largest recurring cost (engine CPU) onto the student's device for free.

Our real recurring costs are:
- **Hosting** (Next.js on Vercel) — bandwidth + serverless function invocations
- **Database** (Supabase Postgres) — storage and egress only; auth is custom-built so no MAU charges
- **Email** (SMTP transactional) — signup, invites, password reset, coach notifications
- **AI Doubt Feature** (Claude API — planned) — the only variable per-student cost that scales linearly with engagement

At academy scale, the marginal cost per student sits between **₹8 and ₹35/month (~$0.10–$0.42)** depending on how heavily they use the AI Doubt feature. This gives us a very healthy gross margin at the target pricing.

---

## 2. Services Currently In Use

| # | Service | Purpose | Billing Model |
|---|---------|---------|---------------|
| 1 | **Vercel** (assumed host for Next.js 16) | Web hosting, edge network, serverless API routes | Tiered (Hobby / Pro / Enterprise) + bandwidth + function GB-hours |
| 2 | **Supabase** | Postgres DB + row-level security (**Supabase Auth is NOT used**) | Tiered (Free / Pro / Team) + storage + egress — **no MAU charges** |
| 3 | **SMTP provider** (Gmail/Zoho — currently) | Transactional email (invites, password reset, coach → parent) | Per-email or flat monthly |
| 4 | **Stockfish 18 WASM** | Chess engine (runs in browser) | **Free** — client-side compute |
| 5 | **Chess.com API** | Fetch student games | **Free** (public API, rate-limited) |
| 6 | **Lichess API** | Fetch student games | **Free** (public API) |
| 7 | **Claude API** *(planned — Doubt Feature)* | Position Q&A, coach-like explanations | Per-token (input/output) |
| 8 | **Domain + DNS** | chessadvisor.\* | Flat annual |

Not yet in use but likely required at scale:
- **Object storage** (Supabase Storage or S3) — PGN archives, board-photo uploads for Phase 2 Doubt Feature
- **Stripe / Razorpay** — subscription billing (~2.9% + ₹2 per transaction; not a variable per-student cost, taken out of revenue)
- **Sentry / PostHog** — error tracking + product analytics
- **CDN cache for engine WASM** — likely covered by Vercel edge

---

## 3. Per-Service Cost Breakdown

All figures below are **list prices as of 2026**. USD → INR conversion at ₹83/USD.

### 3.1 Vercel

| Plan | Price | Included | Overage |
|------|-------|----------|---------|
| Hobby | $0 | 100 GB bandwidth, 100k function invocations | Not for commercial use |
| **Pro** | **$20/user/mo** | 1 TB bandwidth, 1M function invocations, 1000 GB-hrs | $40/100 GB bandwidth, $0.60/1M invocations |
| Enterprise | ~$3.5k+/mo | Custom, SLA, SSO | Custom |

**Our footprint**: light. Each analysis is client-side so API routes only handle: auth callbacks, saving analysis JSON to Supabase, coach/annotation reads, Chess.com/Lichess proxy calls.

### 3.2 Supabase

> **Important:** Supabase is used as a **Postgres host only**. Auth is fully custom — bcrypt password hashing, session tokens stored in our own `user_sessions` table, email verification and password-reset tokens in their own tables, all managed via Prisma. Supabase's Auth service is not used, so **MAU-based charges do not apply at all**.

| Plan | Price | Included | Overage |
|------|-------|----------|---------|
| Free | $0 | 500 MB DB, 5 GB egress | — (paused after limit) |
| **Pro** | **$25/mo** | 8 GB DB, 250 GB egress, daily backups | $0.125/GB DB, $0.09/GB egress |
| Team | $599/mo | SOC2, priority support | — |

**Our footprint**: `analysis_jobs` rows are the largest table (~50 KB per analyzed game). One active student generates ~40 analyses/month → ~2 MB/month → **24 MB/year per active student**. Custom auth adds a small number of rows per user to `user_sessions`, `email_verification_tokens`, and `password_reset_tokens` — negligible storage.

### 3.3 Email (SMTP)

| Provider | Price | Volume |
|----------|-------|--------|
| Gmail / Zoho (current) | ~₹0 | Fine up to ~500 emails/day, not designed for transactional |
| **Resend** (recommended at scale) | **$20/mo** | 50k emails/month + $1 per additional 1k |
| SendGrid Essentials | $19.95/mo | 50k emails/month |
| AWS SES | $0.10/1k emails | Cheapest, needs setup |

**Our footprint**: signup + invite + weekly digest = ~5 emails per student per month.

### 3.4 Claude API (Doubt Feature — planned)

Sonnet 4.6 pricing: **$3/M input tokens, $15/M output tokens**. With aggressive prompt caching (chess position context is highly reusable), effective input cost drops to ~$0.30/M.

Estimated per-doubt cost:
- Input: ~2k tokens (board state + question + short history) → $0.0006 (cached) to $0.006 (uncached)
- Output: ~400 tokens (explanation) → $0.006
- **Effective cost per doubt query: ~₹0.55–₹1.00 (~$0.007–$0.012)**

Assumed usage: an engaged student asks 20 doubts/month → **₹11–₹20/month**. A casual student asks 3 → **₹2–₹3/month**.

### 3.5 Object Storage (Phase 2)

Supabase Storage: **$0.021/GB/month** + $0.09/GB egress. Board photos ~200 KB each; negligible until we hit thousands of daily uploads.

### 3.6 Payment Processing

Razorpay (India): **2% + ₹3 per transaction** for domestic cards, 3% for international. On a ₹499 Academy subscription, that's ~₹13/month lost to fees. Modelled as a **revenue haircut**, not a variable cost.

---

## 4. Per-Student Cost Model

We model three student personas because usage isn't uniform.

| Persona | Description | Analyses/mo | Doubts/mo | Puzzles/mo |
|---------|-------------|-------------|-----------|------------|
| **Casual** | Weekend player | 10 | 3 | 40 |
| **Regular** | Weekly-lesson academy student | 40 | 15 | 200 |
| **Power** | Daily-play serious student | 120 | 40 | 600 |

### 4.1 Marginal cost per student per month

| Cost line | Casual | Regular | Power |
|-----------|--------|---------|-------|
| Vercel bandwidth + functions | ₹1 | ₹3 | ₹8 |
| Supabase DB compute share (no MAU charges — custom auth) | ₹2 | ₹4 | ₹8 |
| Supabase egress (PGN + analysis reads) | ₹1 | ₹3 | ₹6 |
| Email (transactional) | ₹0.5 | ₹0.5 | ₹0.5 |
| Claude API (Doubt) | ₹3 | ₹15 | ₹40 |
| Storage (Phase 2 photos) | ₹0.5 | ₹1 | ₹2 |
| **Total marginal cost / student** | **₹8** | **₹26** | **₹65** |
| **In USD** | **$0.10** | **$0.31** | **$0.78** |

Notes:
- Fixed costs (Vercel Pro seat, Supabase Pro baseline, Resend baseline) are ~₹4,000/month total. Amortized across 100 students that's ₹40/student; across 1000 students it's ₹4/student. The "per-student" table above excludes these.
- **No Supabase MAU charges ever** — custom auth means Supabase never counts our users against an Auth limit.
- The **Stockfish analysis itself has zero server cost** — this is our structural advantage.

---

## 5. Scaling Projections

Fully-loaded monthly cost (fixed + variable) at four scale points. Assumes student mix of **50% Casual / 40% Regular / 10% Power** — typical for academies.

### 5.1 At 100 students (~5 small academies)

| Line | Monthly | Note |
|------|---------|------|
| Vercel Pro | ₹1,660 | 1 seat |
| Supabase Pro | ₹2,075 | Well under limits |
| Resend | ₹1,660 | Optional at this scale |
| Domain, monitoring | ₹500 | |
| **Fixed subtotal** | **₹5,895** | |
| Variable (student mix × 100) | ₹2,300 | avg ₹23/student |
| **Total** | **~₹8,200/mo** | **~₹82/student all-in** |

### 5.2 At 1,000 students (~50 academies)

| Line | Monthly | Note |
|------|---------|------|
| Vercel Pro | ₹1,660 | Still 1 seat, may hit bandwidth overage ~₹1,500 |
| Supabase Pro | ₹2,075 + ~₹1,500 egress | 24 GB DB — well within 8 GB… wait, 24 GB/yr per student × 1000 = trim retention or add ₹2,000 storage |
| Resend | ₹1,660 | |
| Claude API | ₹23,000 | The dominant variable line |
| **Total** | **~₹35,000/mo** | **~₹35/student all-in** |

### 5.3 At 10,000 students (~500 academies — target market share)

| Line | Monthly | Note |
|------|---------|------|
| Vercel Pro + overages | ₹15,000 | Consider Enterprise negotiation at this point |
| Supabase Pro + overages | ₹25,000 | Or upgrade to Team plan (~₹50k flat) |
| Resend | ₹8,000 | ~500k emails |
| Claude API | ₹2,30,000 | Aggressive caching essential; consider Haiku fallback for cheap doubts |
| Storage (Phase 2) | ₹5,000 | |
| Monitoring, misc | ₹5,000 | |
| **Total** | **~₹2,88,000/mo** | **~₹29/student all-in** |

### 5.4 At 50,000 students (federation / national scale)

| Line | Monthly |
|------|---------|
| Infra (Vercel + Supabase Team + overages) | ₹1,50,000 |
| Email | ₹40,000 |
| Claude API (with heavy caching + Haiku routing) | ₹9,00,000 |
| Storage + CDN | ₹30,000 |
| Ops (Sentry, PostHog, backups) | ₹20,000 |
| **Total** | **~₹11,40,000/mo** | **~₹23/student all-in** |

Cost per student **decreases with scale** because fixed platform fees amortize and we can negotiate volume rates on Vercel, Supabase, and Anthropic.

---

## 6. Pricing Recommendation for Coaches & Academies

### 6.1 What we know

- Our fully-loaded cost per active student at any realistic scale is **₹23–₹82/month**.
- The dominant variable is the AI Doubt feature. Every other cost line is trivial.
- Competitors: ChessKid ($49/yr per kid = ~₹340/mo per academy of 8), Aimchess ($9.99/mo consumer), no serious academy-native product.
- Indian academies charge parents ₹1,500–₹4,000/month per student. A software line item under ₹200/student is easy to justify.

### 6.2 Recommended tiers

| Tier | Target | Price | Includes | Our cost | Gross margin |
|------|--------|-------|----------|----------|--------------|
| **Coach Solo** | Independent coach, ≤10 students | **₹999/mo** (or $19) | 10 student seats, coach dashboard, annotations, unlimited analyses, 5 doubts/student/mo | ~₹350 | **65%** |
| **Academy Starter** | Small academy, up to 30 students | **₹2,499/mo** (or $49) | 30 seats, all Coach Solo features, parent portal, weekly reports | ~₹850 | **66%** |
| **Academy Pro** | Growing academy, up to 100 students | **₹6,999/mo** (or $129) | 100 seats, unlimited doubts, custom branding on parent emails, priority support | ~₹2,500 | **64%** |
| **Academy Scale** | Large academy / chain, up to 500 students | **₹24,999/mo** (or $449) | 500 seats, coach analytics dashboard, bulk import, API access | ~₹11,000 | **56%** |
| **Enterprise / Federation** | 500+ students, federations | **Custom** (from ₹1L/mo, ~$1,199) | White-label, SSO, dedicated support, tournament prep module | Custom | **60%+** |
| **Student Pro** *(direct-to-student)* | Serious individual player | **₹499/mo** (or $9) | Full analysis, unlimited doubts, all puzzles | ~₹65 | **87%** |
| **Student Free** | Any player | **₹0** | Basic analysis, 5 puzzles/week, 3 doubts/mo | ~₹5 | Loss-leader / funnel |

### 6.3 Why these prices work

1. **Every paid tier maintains ≥55% gross margin at expected usage.** That's healthy SaaS territory and lets us absorb heavy-usage outliers without a per-student overage bill (which academies hate).
2. **Per-seat prices at Academy Pro and Scale come out to ₹50–₹70/student** — below what any academy would consider material vs. the ₹2,000+/mo they charge parents.
3. **The doubt-feature quota on lower tiers is a real cost control**, not a marketing gimmick. Unlimited-doubt tiers should be priced to survive Power-user mix.
4. **Anchoring**: Enterprise at ₹1L makes ₹25k Academy Scale look reasonable and ₹7k Academy Pro feel obvious.
5. **Coach Solo at ₹999** captures the long tail of solo coaches — a huge Indian market — at a price point they'll pay out of pocket without needing academy approval.

### 6.4 Levers if margins compress

- Route casual doubts to **Claude Haiku** instead of Sonnet — 4–5x cheaper.
- Aggressive **prompt caching** on the board-state prefix — realistic 10x input cost reduction.
- Move analysis JSON to **compressed columnar storage** after 90 days — cut DB size 5x.
- Cap included doubts on lower tiers; sell **doubt packs** as add-ons (₹199 for 100 extra).

### 6.5 What to launch with

Start with **three tiers only**: **Coach Solo (₹999)**, **Academy Pro (₹6,999)**, **Enterprise (call us)**. Adding tiers is easy; removing them looks bad. Once you have 20 paying customers you'll know whether Starter or Scale sells better.

---

## 7. Assumptions & Caveats

- Vercel is assumed as the host based on Next.js 16 + typical stack; if actually on Railway/Fly/self-host, hosting figures shift ±30% but the shape of the model doesn't.
- Claude API costs assume Sonnet 4.6 list pricing and moderate caching. Actual costs at scale should be 30–50% lower with proper caching architecture.
- Supabase Auth (and its MAU billing) is not used. Auth is custom — bcrypt + session tokens in Postgres. No MAU metric applies.
- Active user estimates are used only for estimating Vercel function invocations and egress, not for Supabase billing.
- Currency conversion at ₹83/USD; adjust ±5% for FX.
- Payment gateway fees (~2–3% of revenue) are excluded from cost lines and should be modeled as a revenue haircut.
- The Doubt Feature is not yet shipped. Until it is, per-student costs are ~50% of the figures above.
