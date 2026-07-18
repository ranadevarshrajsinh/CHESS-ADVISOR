# Chess Advisor — Payments & Subscription System

## Context

Chess Advisor is currently fully ungated: all users have unlimited game analyses, batch analyses, and puzzles. The goal is to add a subscription system with a free tier that enforces usage limits, a payment upgrade flow, and a full admin panel to see and manage every user's plan.

> **Design principle:** All tier limits live in a single config file (`lib/plans.ts`). Changing a number there changes all enforcement automatically — no scattered constants across routes.

---

## Free Tier Defaults

> All values are configurable in `lib/plans.ts` — changing them there updates all enforcement automatically.

| Feature | Free Limit | Resets |
|---------|-----------|--------|
| Game analysis | 3 / day | Daily |
| Batch analysis | 1 total (ever) | Never |
| Puzzles attempted | 5 / day | Daily |
| AI Doubts | 3 / month | Monthly (Phase 2) |

---

# Phase 1 — Usage Limits + Mock Checkout + Billing UI + Admin Panel

**Goal:** Ship all the visible infrastructure — limit enforcement, a billing page with usage bars, a fake checkout with hardcoded test cards, and a full admin panel — without wiring real Razorpay. Everything built here carries directly into Phase 2; the only swap is replacing the mock checkout with the real Razorpay modal.

---

## P1 · New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/plans.ts` | Single source of truth: all plan IDs, limits, prices |
| `apps/web/src/lib/usage.ts` | `getEffectivePlan`, `checkUsage`, `checkAndIncrement`, `resolveUserIdFromUsername` |
| `apps/web/src/app/api/billing/status/route.ts` | Current plan + usage stats for billing page |
| `apps/web/src/app/api/billing/mock-upgrade/route.ts` | Mock checkout: sets plan in DB with no real payment |
| `apps/web/src/app/api/admin/subscriptions/route.ts` | GET all users + plans, PATCH manual override |
| `apps/web/src/app/billing/page.tsx` | Billing page: usage bars, current plan, mock upgrade |

## P1 · Files to Modify

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add `subscriptions` and `feature_usage` models |
| `apps/web/src/app/api/analyze/route.ts` | Add usage check in POST before `analysis_jobs.create` |
| `apps/web/src/app/api/batch/route.ts` | Add usage check in POST before `batch_jobs.create` |
| `apps/web/src/app/api/puzzles/[username]/[puzzleId]/attempt/route.ts` | Add usage check before writing |
| `apps/web/src/app/api/puzzles/[username]/queue/route.ts` | Cap returned queue size by remaining daily allowance |
| `apps/web/src/app/admin/dashboard/page.tsx` | Add "Subscriptions & Usage" tab (5th tab) |
| `apps/web/src/components/Header.tsx` | Add "Billing" to `NAV_ITEMS` (CreditCard icon) |
| `apps/web/src/services/api.ts` | Propagate 429 from `analyzeGame` and `createBatchJob` |

---

## P1 · Step 1 — Plan Config (`lib/plans.ts`)

```ts
type PlanLimits = {
  analysisPerDay:    number | null  // null = unlimited
  batchAnalysisEver: number | null  // 1 = one-time, null = unlimited
  puzzlesPerDay:     number | null
  aiDoubtsPerMonth:  number | null  // stubbed in Phase 1
}

type Plan = {
  id:           string
  name:         string
  priceMonthly: number          // paise (₹499 = 49900)
  currency:     "INR"
  maxSeats:     number | null   // null = personal plan
  limits:       PlanLimits
  targetRole:   "player" | "coach" | "academy_owner" | "any"
}

export const PLANS: Record<string, Plan> = {
  free:            { ..., limits: { analysisPerDay: 3, batchAnalysisEver: 1, puzzlesPerDay: 5, aiDoubtsPerMonth: 3 } },
  student_pro:     { priceMonthly: 49900,   limits: all null, maxSeats: null },
  coach_solo:      { priceMonthly: 99900,   limits: all null, maxSeats: 10  },
  academy_starter: { priceMonthly: 249900,  limits: all null, maxSeats: 30  },
  academy_pro:     { priceMonthly: 699900,  limits: all null, maxSeats: 100 },
  academy_scale:   { priceMonthly: 2499900, limits: all null, maxSeats: 500 },
  enterprise:      { priceMonthly: 0,       limits: all null, maxSeats: null },
}

export type FeatureKey = "analysis" | "batch_analysis" | "puzzles" | "ai_doubts"

export const FEATURE_CONFIG: Record<FeatureKey, {
  limitField:  keyof PlanLimits
  resetPeriod: "daily" | "monthly" | "never"
}> = {
  analysis:       { limitField: "analysisPerDay",    resetPeriod: "daily"   },
  batch_analysis: { limitField: "batchAnalysisEver", resetPeriod: "never"   },
  puzzles:        { limitField: "puzzlesPerDay",      resetPeriod: "daily"   },
  ai_doubts:      { limitField: "aiDoubtsPerMonth",   resetPeriod: "monthly" },
}
```

---

## P1 · Step 2 — DB Schema Additions (`prisma/schema.prisma`)

### `subscriptions` table

```prisma
model subscriptions {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscriber_id        String    @db.Uuid   // app_users.id
  subscriber_type      String               // "player" | "coach" | "academy_owner" | "manual"
  plan_id              String
  status               String    @default("active")  // "active" | "cancelled" | "past_due"
  razorpay_payment_id  String?   @unique   // null in Phase 1 (mock upgrades)
  razorpay_customer_id String?
  current_period_start DateTime  @db.Timestamptz(6)
  current_period_end   DateTime  @db.Timestamptz(6)
  cancelled_at         DateTime? @db.Timestamptz(6)
  created_at           DateTime  @default(now()) @db.Timestamptz(6)
  updated_at           DateTime  @default(now()) @db.Timestamptz(6)

  @@index([subscriber_id])
  @@index([status])
  @@schema("public")
}
```

### `feature_usage` table

```prisma
model feature_usage {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @db.Uuid  // app_users.id
  feature    String             // FeatureKey
  period_key String             // "2026-07-18" | "2026-07" | "all-time"
  count      Int      @default(0)
  created_at DateTime @default(now()) @db.Timestamptz(6)
  updated_at DateTime @default(now()) @db.Timestamptz(6)

  @@unique([user_id, feature, period_key], name: "feature_usage_unique_per_period")
  @@index([user_id, feature])
  @@schema("public")
}
```

> **Why string `period_key`?** Daily → `"2026-07-18"`, monthly → `"2026-07"`, never → `"all-time"`. The key naturally rolls at midnight/month boundary with zero cron jobs needed. Old rows become stale but harmless.

### Migration backfill (run once on prod)

Grandfather existing users who already ran batch analysis — they shouldn't get a free batch attempt when the gate goes live:

```sql
INSERT INTO public.feature_usage (user_id, feature, period_key, count)
SELECT DISTINCT p.user_id, 'batch_analysis', 'all-time', 1
FROM public.batch_jobs bj
JOIN public.players p ON p.chess_username = bj.username
WHERE bj.status = 'completed' AND p.user_id IS NOT NULL
ON CONFLICT (user_id, feature, period_key) DO NOTHING;
```

---

## P1 · Step 3 — Usage Library (`lib/usage.ts`)

### `getPeriodKey(feature)` → string

| Reset period | Returns |
|-------------|---------|
| `"never"` | `"all-time"` |
| `"daily"` | `new Date().toISOString().split("T")[0]` |
| `"monthly"` | `new Date().toISOString().slice(0, 7)` |

### `getEffectivePlan(userId)` → Plan

Lookup chain — returns first match:

1. Active `subscriptions` row for `userId` where `current_period_end > now`
2. Player's coach's active subscription (via `players.coach_id`)
3. Coach's academy owner's active subscription (via `profiles.academy_id → academies.owner_id`)
4. Fallback: `PLANS.free`

### `checkAndIncrement(userId, feature)` → `{ allowed, used, limit, resetAt }`

- If `limit === null`: return `{ allowed: true }` immediately — no DB read
- Otherwise: read `feature_usage` row, check `count < limit`, then upsert `count: { increment: 1 }`

### `resolveUserIdFromUsername(chessUsername)` → `string | null`

```ts
export async function resolveUserIdFromUsername(chessUsername: string): Promise<string | null> {
  const player = await prisma.players.findUnique({
    where: { chess_username: chessUsername },
    select: { user_id: true },
  });
  return player?.user_id ?? null;
}
```

> If `user_id` is null (player has no account), skip enforcement — unregistered players can't be billed.

---

## P1 · Step 4 — Gate the API Routes

### Enforcement pattern (identical for all gated routes)

```ts
const userId = await resolveUserIdFromUsername(username);

if (userId) {
  const usage = await checkAndIncrement(userId, "analysis");
  if (!usage.allowed) {
    return NextResponse.json({
      error:      `Daily limit reached (${usage.used}/${usage.limit})`,
      feature:    "analysis",
      used:       usage.used,
      limit:      usage.limit,
      resetAt:    usage.resetAt,
      upgradeUrl: "/billing?blocked=analysis",
    }, { status: 429 });
  }
}
```

### Insertion points

| Route | Insert after | Feature key |
|-------|-------------|-------------|
| `POST /api/analyze` (line 16) | `existing` early-return | `"analysis"` |
| `POST /api/batch` (line 19) | `existing` early-return | `"batch_analysis"` |
| `POST /api/puzzles/[username]/[puzzleId]/attempt` | top of handler | `"puzzles"` |
| `GET /api/puzzles/[username]/queue` | after resolving userId | cap `limit` param only — no 429 |

For the queue route: cap `limit` to `min(requested, remaining_daily_allowance)`. Return `{ queue: [], limitReached: true, upgradeUrl: "/billing?blocked=puzzles" }` when remaining = 0.

### Propagate 429 in `apps/web/src/services/api.ts`

```ts
if (res.status === 429) {
  const body = await res.json();
  throw Object.assign(new Error("limit_reached"), { limitBody: body });
}
```

Then in `analysis/[filename]/page.tsx`, `batch/page.tsx`, and the puzzle attempt caller:

```ts
} catch (e: any) {
  if (e.message === "limit_reached") {
    router.push(`/billing?blocked=${e.limitBody?.feature ?? "feature"}`);
    return;
  }
}
```

---

## P1 · Step 5 — Mock Checkout (`/api/billing/mock-upgrade`)

No real Razorpay in Phase 1. Instead, the billing page shows a payment form with hardcoded test cards. On submit, this route writes a real `subscriptions` row so all the limit logic works end-to-end.

### `POST /api/billing/mock-upgrade`

```ts
// Requires requireAuth
// Body: { plan_id, mock_card_number }

const VALID_MOCK_CARDS = ["4111111111111111", "5500005555555559", "371449635398431"];

if (!VALID_MOCK_CARDS.includes(body.mock_card_number.replace(/\s/g, ""))) {
  return NextResponse.json({ error: "Invalid test card" }, { status: 400 });
}

// Cancel existing subscription, create new one
await prisma.$transaction([
  prisma.subscriptions.updateMany({
    where: { subscriber_id: userId, status: "active" },
    data:  { status: "cancelled", cancelled_at: new Date() },
  }),
  prisma.subscriptions.create({
    data: {
      subscriber_id:        userId,
      subscriber_type:      subscriberType,
      plan_id:              body.plan_id,
      status:               "active",
      current_period_start: now,
      current_period_end:   addMonths(now, 1),
    },
  }),
]);

return NextResponse.json({ success: true, plan_id: body.plan_id });
```

### Mock test cards shown in the UI

| Card number | Type | Result |
|------------|------|--------|
| `4111 1111 1111 1111` | Visa | Success |
| `5500 0055 5555 5559` | Mastercard | Success |
| `3714 496353 98431` | Amex | Success |

> These are standard industry test card numbers. No real charge occurs — Phase 1 mock only.

---

## P1 · Step 6 — Billing Page (`/billing`)

### Sections

1. **BlockedBanner** — shown when `?blocked=` param is present. "You've reached your [Game Analysis] limit for today. Upgrade to continue." (dismissible with ✕)

2. **CurrentPlanCard** — plan name badge, renewal date, status. For free tier: "Free Plan — no renewal date."

3. **UsageStats** — 4 bars (analysis, batch, puzzles, ai_doubts — doubts show as "Coming soon"):
   ```
   Game Analysis     [████████░░] 3 / 3   Resets at midnight
   Batch Analysis    [██████████] 1 / 1   One-time limit
   Puzzles           [████░░░░░░] 2 / 5   Resets at midnight
   AI Doubts         [░░░░░░░░░░] —       Coming soon
   ```

4. **UpgradeCTAs** — one card per plan above the user's current plan. Each shows: plan name, price (₹/mo), seat count if applicable, and an "Upgrade" button.

5. **MockCheckoutModal** — opens when "Upgrade" is clicked. Shows:
   - Selected plan name + price
   - Card number input (with hint: use test card `4111 1111 1111 1111`)
   - Expiry + CVV fields (any values accepted in mock mode)
   - "Pay ₹X" button → calls `POST /api/billing/mock-upgrade` → on success shows "Plan activated!" and refreshes usage stats

### Navigation

```ts
// apps/web/src/components/Header.tsx — NAV_ITEMS
{ name: "Billing", path: "/billing", matchPrefixes: ["/billing"], icon: <CreditCard size={14} /> }
```

---

## P1 · Step 7 — Admin Panel (`/admin/dashboard` — 5th tab)

The admin panel needs to be the full picture: every user, their current plan, their usage this period, and the ability to manually override anything.

### `GET /api/admin/subscriptions`

Returns all users (not just paying ones) with their effective plan and current period usage:

```ts
// Returns:
{
  users: [
    {
      user_id:         string
      email:           string
      name:            string
      chess_username:  string | null
      subscriber_type: "player" | "coach" | "academy_owner"
      plan_id:         string          // "free" if no subscription row
      plan_name:       string
      status:          "active" | "free" | "cancelled"
      period_end:      string | null
      payment_source:  "mock" | "razorpay" | "manual" | "free"
      usage: {
        analysis:       { used: number, limit: number | null }
        batch_analysis: { used: number, limit: number | null }
        puzzles:        { used: number, limit: number | null }
      }
    }
  ],
  stats: {
    total_users:          number
    free_users:           number
    paid_users:           number
    revenue_this_month:   number   // paise, 0 in Phase 1
    plan_breakdown: Record<string, number>  // { free: 42, student_pro: 8, ... }
  }
}
```

### `PATCH /api/admin/subscriptions`

Body: `{ subscriber_id, plan_id }`. Cancels existing sub, creates new one. Setting to `"free"` just cancels (free is the default fallback — no row needed).

### 5th tab UI

**Summary row (top of tab):**

```
[ Total Users: 87 ]  [ Free: 65 ]  [ Paid: 22 ]  [ Revenue this month: ₹0 (Phase 1) ]
```

**Plan breakdown chart** — a horizontal bar chart (or pie chart) showing how many users are on each plan. One bar per `PLANS` entry.

**Usage heatmap or stat cards** — for the current day/month:
- Analysis requests today: X total across all users
- Puzzles attempted today: X total
- Batch jobs created (all-time): X total

**Users table** — searchable, sortable:

| User | Email | Type | Plan | Status | Period Ends | Usage Today | Override |
|------|-------|------|------|--------|-------------|-------------|---------|
| Magnus | m@chess.com | Player | Free | free | — | 2/3 analysis, 4/5 puzzles | `[select ▾]` |
| Coach A | a@chess.com | Coach | Coach Solo | active | 2026-08-18 | — | `[select ▾]` |

- **Override column:** `<select>` populated from `Object.keys(PLANS)` pre-selected to current plan — `onChange` calls `PATCH /api/admin/subscriptions` with confirmation dialog
- **Status badge:** Green = active paid, Grey = free, Red = cancelled/past_due
- **Usage columns:** Show `used/limit` for today's analysis and puzzles; batch shows `used/limit` (all-time)

---

## P1 · Implementation Sequence

1. Add `subscriptions` + `feature_usage` to `prisma/schema.prisma` → `npx prisma db push && npx prisma generate`
2. Create `lib/plans.ts`
3. Create `lib/usage.ts`
4. Gate `POST /api/analyze`, `POST /api/batch`, `POST /api/puzzles/.../attempt`, cap `GET .../queue`
5. Update `services/api.ts` to propagate 429; update call sites to redirect
6. Create `POST /api/billing/mock-upgrade`
7. Create `GET /api/billing/status`
8. Create `app/billing/page.tsx` (usage bars + mock checkout modal)
9. Update `Header.tsx` with Billing nav item
10. Create `GET|PATCH /api/admin/subscriptions`
11. Add subscriptions tab to `admin/dashboard/page.tsx` (table + charts)
12. Run batch-analysis backfill SQL on prod DB

## P1 · Verification

| Test | Expected |
|------|---------|
| Hit POST `/api/analyze` 3× | 4th returns 429, frontend redirects to `/billing?blocked=analysis` |
| Set `period_key` to yesterday in DB | Analysis allowed again |
| Create one batch job → try second | 429 redirect |
| Attempt 5 puzzles | 6th returns 429; queue returns `{ limitReached: true }` |
| Enter test card `4111 1111 1111 1111` on billing page | Plan upgrades, usage bars show unlimited |
| Enter invalid card number | "Invalid test card" error shown |
| Admin overrides player to `student_pro` | Billing page shows unlimited immediately |
| Admin panel plan breakdown chart | Shows correct count per plan |

---

---

# Phase 2 — Real Razorpay Integration

**Goal:** Replace the mock checkout with real Razorpay. Everything from Phase 1 stays — the only changes are in the payment flow itself (billing routes + the checkout modal swap).

---

## P2 · New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/razorpay.ts` | Razorpay SDK singleton |
| `apps/web/src/app/api/billing/create-order/route.ts` | Create Razorpay order |
| `apps/web/src/app/api/billing/verify/route.ts` | Verify payment signature + write subscription row |
| `apps/web/src/app/api/billing/webhook/route.ts` | Handle renewals + cancellations from Razorpay |

## P2 · Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/billing/page.tsx` | Replace MockCheckoutModal with real Razorpay modal |
| `apps/web/src/app/api/admin/subscriptions/route.ts` | Add `payment_source: "razorpay"` to enriched data; add revenue calculation |
| `apps/web/src/app/admin/dashboard/page.tsx` | Update revenue stat from 0 to real total |

---

## P2 · Step 1 — Environment Variables

```
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
```

---

## P2 · Step 2 — Razorpay API Routes

**`POST /api/billing/create-order`**
- Requires `requireAuth`
- Creates Razorpay order: `{ amount, currency: "INR", receipt, notes: { user_id, plan_id } }`
- Returns `{ orderId, amount, currency, keyId }`

**`POST /api/billing/verify`**
- Requires `requireAuth`
- Verifies HMAC: `sha256(order_id + "|" + payment_id, KEY_SECRET) === razorpay_signature`
- On success: cancel existing sub → create new `subscriptions` row with `razorpay_payment_id` set
- Returns `{ success: true, plan_id }`

**`POST /api/billing/webhook`**
- Verifies `x-razorpay-signature` header against `RAZORPAY_WEBHOOK_SECRET`
- `subscription.charged` → extend `current_period_end` by 1 month
- `subscription.cancelled` → set `status: "cancelled"`, `current_period_end: now`
- `payment.failed` → set `status: "past_due"`

---

## P2 · Step 3 — Replace Mock Checkout

In `apps/web/src/app/billing/page.tsx`, swap out `MockCheckoutModal` with:

```ts
async function handleUpgrade(planId: string) {
  const { orderId, amount, currency, keyId } = await fetch("/api/billing/create-order", {
    method: "POST", body: JSON.stringify({ plan_id: planId }),
  }).then(r => r.json());

  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  document.body.appendChild(script);
  await new Promise(r => script.onload = r);

  new (window as any).Razorpay({
    key:      keyId,
    amount,
    currency,
    order_id: orderId,
    name:     "Chess Advisor",
    handler:  async (response: any) => {
      await fetch("/api/billing/verify", {
        method: "POST",
        body:   JSON.stringify({ ...response, plan_id: planId }),
      });
      router.push("/billing?success=1");
    },
  }).open();
}
```

> The `MockCheckoutModal` component can be kept behind a `NEXT_PUBLIC_MOCK_PAYMENTS=true` env flag for staging/testing after Phase 2 goes live.

---

## P2 · Step 4 — Admin Revenue Stats

Once real payments flow, update `GET /api/admin/subscriptions` to calculate actual monthly revenue:

```ts
// Sum priceMonthly from PLANS for all active paid subscriptions
const revenue = activeSubscriptions
  .filter(s => s.plan_id !== "free" && s.razorpay_payment_id)
  .reduce((sum, s) => sum + (PLANS[s.plan_id]?.priceMonthly ?? 0), 0);

// Return in paise; frontend formats as ₹X,XXX
```

---

## P2 · Verification

| Test | Expected |
|------|---------|
| Click Upgrade → Razorpay modal opens | Modal shows correct plan name + price |
| Complete with test card `4111 1111 1111 1111` | `/api/billing/verify` called, sub row created with `razorpay_payment_id` set |
| Plan active on billing page | Usage bars show unlimited |
| Razorpay webhook `subscription.cancelled` | `status` set to `"cancelled"`, user falls back to free tier |
| Admin revenue stat | Shows sum of all active paid plan prices |
| Stage with `NEXT_PUBLIC_MOCK_PAYMENTS=true` | Mock checkout still works for internal testing |

---

## Key Codebase Facts (reference)

- **Auth:** `apps/web/src/lib/auth.ts` — `getSessionFromRequest(req)` returns session with `session.app_user.id` (UUID), `.player`, `.profile`
- **No auth on gated routes today:** `/api/analyze` and `/api/batch` take `username` (chess_username) from request body. Usage is tracked via `players.chess_username → user_id` lookup — no session required
- **Prisma conventions:** `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` for UUIDs; `@@schema("public")` for all app tables
- **Admin dashboard:** `apps/web/src/app/admin/dashboard/page.tsx` — 4 existing tabs
- **Navigation:** `apps/web/src/components/Header.tsx` — `NAV_ITEMS` array
