# Bug Report

## Metadata

* Report Date: 2026-06-24
* Bug Title: Batch Analysis Creates Jobs But Worker Never Processes Them — Empty Report and Training Plan
* Severity: Critical
* Status: Open
* Confidence: High

---

## User Report

When batch analysis is run from the dashboard, no data appears in the report or training plan pages. The worker logs only show startup and idle polling messages — no jobs are ever processed. The user observes:

- "Batch analysis is run" (the button is clicked and the API responds)
- "No data is shown in the report or training" (pages display empty/null sections)
- "Logs don't show anything other than the worker is running" (worker boots but never processes any jobs)

---

## Reproduction Steps

1. Start the worker: `cd apps/stockfish-worker && venv/bin/python worker.py`
2. Open the frontend dashboard at `/dashboard`
3. Click the "Run Batch Analysis" button
4. Observe the response shows `jobs_created: N` (e.g. 5)
5. The browser navigates to `/report`
6. Observe the report page shows — "0.0%" accuracy, no strengths, no openings, no patterns, etc.
7. Check the worker terminal — logs show only `WORKER_STARTED` and repeated `IDLE poll=N — waiting for pending jobs (checking every 5s)`
8. No `POLL_HIT`, `JOB_START`, `JOB_COMPLETED`, or `JOB_FAILED` logs appear

---

## Expected Behavior

1. The batch API creates `analysis_jobs` rows with `status: "pending"`
2. The worker polls Supabase and finds the pending jobs
3. The worker processes each job (runs `GameAnalyzer` analysis and stores results)
4. The worker updates each job to `status: "completed"` with the `result` JSON
5. The report page queries completed jobs and renders the full report with accuracy, openings, patterns, etc.

---

## Actual Behavior

The batch API creates jobs successfully (using the service_role key), but the worker **never sees any pending jobs**. The worker logs show:

```
WORKER_STARTED table=analysis_jobs total_rows=?
IDLE poll=3 — waiting for pending jobs (checking every 5s)
IDLE poll=6 — waiting for pending jobs (checking every 5s)
...
```

Jobs remain `pending` forever. The report API returns the "No completed analysis found" fallback response. The training plan API returns the "Not enough data" fallback.

---

## Root Cause Analysis

### PRIMARY ROOT CAUSE: Worker Uses Anon Key Instead of Service Role Key (Supabase RLS)

**Relevant files:**
- `apps/stockfish-worker/.env` (line 2: `SUPABASE_SERVICE_KEY=<anon key>`)
- `apps/stockfish-worker/worker_config.py` (line 8: reads `SUPABASE_SERVICE_KEY`)
- `apps/stockfish-worker/worker.py` (line 19: creates Supabase client with anon key)

**Execution flow:**

1. **Batch API creates jobs** — The frontend calls `GET /api/analyze/{username}/batch?limit=N`. The route handler (`apps/web/src/app/api/analyze/[username]/batch/route.ts`) uses `supabaseAdmin` (created in `apps/web/src/lib/supabase-admin.ts` with `process.env.SUPABASE_SERVICE_ROLE_KEY`) to insert `analysis_jobs` rows. The **service_role key bypasses RLS**, so jobs are created successfully with `status: "pending"`.

2. **Worker polls with anon key** — The worker (`worker.py` line 19) creates a Supabase client using `settings.SUPABASE_SERVICE_KEY`. The `.env` file stores an **anon key** under this name:
   ```
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZm5pc2FibmhhbGp0a3NpdXRuIiwicm9sZSI6ImFub24i...
   ```
   The JWT's `role` claim is `anon`, NOT `service_role`.

3. **RLS filters out all rows** — With the anon key, the Supabase client is subject to Row-Level Security. If no SELECT policy exists for the anon role on the `analysis_jobs` table (which is the default when RLS is enabled), the query:
   ```python
   supabase.table("analysis_jobs").select("*").eq("status", "pending").limit(1).execute()
   ```
   Returns `res.data` as an empty array (no error thrown, just empty results due to RLS filtering). The worker never sees any pending jobs.

4. **Perpetual idle loop** — The worker's `if res.data:` condition is falsy, so it falls into the else branch and logs `IDLE poll=N — waiting for pending jobs` repeatedly. The jobs remain `pending` forever.

**Why this doesn't cause an error:**
PostgREST (the RESTful API layer Supabase uses) silently returns empty results for queries that are permitted by the schema but filtered by RLS. The Python client receives a valid HTTP 200 response with an empty `data` array — no exception is thrown. The worker's error handling never triggers.

**Why the startup check appears to succeed:**

```python
check = supabase.table("analysis_jobs").select("id", count="exact").limit(1).execute()
logger.info("WORKER_STARTED table=analysis_jobs total_rows=%s", check.count if hasattr(check, 'count') else '?')
```

Even with RLS, the query succeeds (HTTP 200). The `count` attribute might be missing (because PostgREST omits the count header when RLS applies), so it logs `total_rows=?`. The user sees `WORKER_STARTED` and assumes connectivity is fine.

### SECONDARY ISSUE: Env Var Name Mismatch in Worker .env

**Relevant files:**
- `apps/stockfish-worker/.env` (lines 2-3)

The `.env` file has TWO keys:
```
SUPABASE_SERVICE_KEY=eyJ...anon...   ← anon key (stored under misleading name)
SERVICE_ROLE=eyJ...service_role...   ← actual service_role key (never read)
```

But `worker_config.py` only reads `SUPABASE_SERVICE_KEY`:
```python
SUPABASE_SERVICE_KEY: str = ""   # service_role key (not publishable) — keep secret
```

The config's docstring says "service_role key" but it actually reads the anon key because the env var name `SUPABASE_SERVICE_KEY` maps to the anon key in `.env`. The real service role key is stored in `SERVICE_ROLE` but is never read by any config.

### TERTIARY ISSUE: Worker Placeholder Returns Mock Results (Not Real Analysis)

**Relevant files:**
- `apps/stockfish-worker/worker.py` (lines 34-46)

Even if the RLS issue were fixed, the worker's `process_job` function uses a **mock placeholder** instead of real analysis:

```python
# Placeholder for demonstration
time.sleep(5) 
result = {
    "message": "Analysis completed successfully",
    "filename": filename,
    "summary": "Mock analysis result"
}
```

The actual `GameAnalyzer` and `BatchAnalyzer` code is **commented out** (lines 38-39). The mock result format (`message`, `filename`, `summary`) does NOT match the format expected by the report API endpoint, which looks for fields like `total_analyzed`, `average_accuracy`, `game_accuracy`, `move_history`, etc.

This means even successfully processed jobs would result in empty/broken reports.

### QUATERNARY ISSUE: Race Condition on Report Navigation

**Relevant files:**
- `apps/web/src/app/dashboard/page.tsx` (line 94)

The dashboard navigates to `/report` **immediately** after `batchAnalyze` resolves (which returns as soon as jobs are created, not when they're processed):

```typescript
await batchAnalyze(chessUsername, 5);
router.push("/report");  // Navigates before any job is processed
```

Even in a working system, the report page would initially show empty data because no jobs are completed yet. The user would need to wait for the worker to process jobs and then refresh. However, this is a UX concern, not the root cause of data never appearing.

---

## Evidence

### Evidence 1 — Worker .env Has Anon Key Under Service Key Name

```
$ cat apps/stockfish-worker/.env
SUPABASE_URL=https://psfnisabnhaljtksiutn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZm5pc2FibmhhbGp0a3NpdXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTUzNDcsImV4cCI6MjA5NTQzMTM0N30...
SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZm5pc2FibmhhbGp0a3NpdXRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg1NTM0NywiZXhwIjoyMDk1NDMxMzQ3fQ...
```

The `SUPABASE_SERVICE_KEY` JWT has `"role":"anon"`, confirming it's an anon key.
The `SERVICE_ROLE` JWT has `"role":"service_role"`, confirming it's the correct key.

### Evidence 2 — Worker Config Reads SUPABASE_SERVICE_KEY

**`worker_config.py` line 8:**
```python
SUPABASE_SERVICE_KEY: str = ""   # service_role key (not publishable) — keep secret
```

**`worker.py` line 19:**
```python
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
```

The code reads `settings.SUPABASE_SERVICE_KEY` which maps to the anon key.

### Evidence 3 — Batch API Uses Correct Service Role Key

**`apps/web/src/lib/supabase-admin.ts`:**
```typescript
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

**`apps/web/.env` line 4:**
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZm5pc2FibmhhbGp0a3NpdXRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg1NTM0NywiZXhwIjoyMDk1NDMxMzQ3fQ...
```

The web app correctly uses `SUPABASE_SERVICE_ROLE_KEY` (service role key) for admin operations. Jobs are created without RLS restriction.

### Evidence 4 — Worker Uses Mock Placeholder

**`worker.py` lines 34-46:**
```python
# In a real worker, we would:
# 1. Fetch the PGN text from Supabase Storage or a 'games' table
# 2. Run the actual analysis core

# analyzer = GameAnalyzer()
# result = analyzer.analyze_pgn(pgn_text, username)

# Placeholder for demonstration
time.sleep(5) 
result = {
    "message": "Analysis completed successfully",
    "filename": filename,
    "summary": "Mock analysis result"
}
```

The worker never calls `GameAnalyzer` or `BatchAnalyzer`. It returns a mock result.

### Evidence 5 — Report Format Mismatch

The report API (`apps/web/src/app/api/report/[username]/route.ts`) looks for these fields in job results:
- `total_analyzed` / `average_accuracy` (line 73) — for batch results
- `game_accuracy` (line 113) — for individual game results

The mock result has `message`, `filename`, `summary` — none of which match. Even if jobs were processed, reports would show `0.0%` accuracy and all null sections.

### Evidence 6 — Worker Logs Show Only Idle Messages

Expected log pattern for a working worker:
```
WORKER_STARTED table=analysis_jobs total_rows=5
POLL_HIT poll=1 job_id=xxx
JOB_START job_id=xxx username=yyy filename=zzz
JOB_PROCESSING job_id=xxx
JOB_COMPLETED job_id=xxx
```

Actual log pattern:
```
WORKER_STARTED table=analysis_jobs total_rows=?
IDLE poll=3 — waiting for pending jobs (checking every 5s)
IDLE poll=6 — waiting for pending jobs (checking every 5s)
...
```

The `total_rows=?` indicates the count header was not returned, consistent with RLS filtering.

---

## Impact Assessment

| Area | Impact |
|------|--------|
| **Who is affected** | ALL users — every user who tries to use Batch Analysis, Reports, or Training Plans |
| **What breaks** | - Batch analysis flow creates jobs that are never processed
- Report page shows empty data (0% accuracy, no sections)
- Training plan page shows "Not enough data" fallback
- Complete end-to-end data pipeline is broken |
| **Production impact** | **Critical** — the core feature of the application (automated chess analysis) is non-functional |
| **Security impact** | Medium — anon key is exposed in `.env` and is used by the worker (should use service_role key). The anon key is publishable but its use for server-side operations is inappropriate and causes the RLS issue |
| **Performance impact** | None (system doesn't process jobs) |

---

## Possible Solutions

### Solution A — Fix the Supabase Key Used by the Worker (Primary Fix)

**Description:**
Change the worker to use the actual service role key. The `.env` already has the correct key stored under `SERVICE_ROLE`. This can be done in two ways:

**Option A1: Rename env var in worker_config.py**
Change `worker_config.py` line 8 from:
```python
SUPABASE_SERVICE_KEY: str = ""
```
to:
```python
SUPABASE_SERVICE_KEY: str = ""   # Will read SERVICE_ROLE from .env
```
AND either:
- Rename the key in `.env` from `SERVICE_ROLE` to `SUPABASE_SERVICE_KEY` (remove the old anon key line), OR
- Add an alias in the Settings model using `Field(validation_alias="SERVICE_ROLE")` or similar

**Option A2: Read SERVICE_ROLE directly**
Change `worker.py` line 19:
```python
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
```
to read from another env var like `SERVICE_ROLE`.

**Option A3: Create Supabase RLS policy for anon role**
Create a policy allowing the anon role to SELECT from `analysis_jobs`:
```sql
CREATE POLICY "anon_can_read_analysis_jobs" ON public.analysis_jobs
  FOR SELECT USING (true);
```
And similarly for UPDATE:
```sql
CREATE POLICY "anon_can_update_analysis_jobs" ON public.analysis_jobs
  FOR UPDATE USING (true);
```
This is less secure but fixes the immediate issue without code changes.

**Pros:**
- Solves the primary root cause
- Minimal code change (1-2 lines)
- The service role key already exists in `.env`

**Cons:**
- Option A1/A2 only: The service_role key must be kept secret (never committed to git)
- Option A3 only: Less secure, anon clients get full access to analysis_jobs

---

### Solution B — Replace Mock Placeholder with Real Analysis (Required Anyway)

**Description:**
Uncomment and activate the real analysis logic in `worker.py`:

```python
# 1. Fetch PGN from Supabase Storage
pgn_text = fetch_pgn_from_storage(job)  # needs implementation

# 2. Run actual analysis
analyzer = GameAnalyzer()
result = analyzer.analyze_pgn(pgn_text, username)
```

Also need to:
1. Implement PGN storage/fetching — currently the batch API stores `username` and `filename` but not the PGN content
2. Ensure `GameAnalyzer.analyze_pgn()` is called correctly
3. Handle the result format to match what the report API expects (it already does, since `GameAnalyzer.analyze_pgn` returns the correct format)

**Pros:**
- Enables real game analysis
- Uses the already-implemented `GameAnalyzer` code
- The analysis code is already written and tested (imports pass)

**Cons:**
- Requires implementing PGN storage (jobs currently don't store PGN content)
- Stockfish engine must be available on the worker machine
- Analysis is CPU-intensive

---

### Solution C — Fix Report Navigation Race Condition (UX Improvement)

**Description:**
Instead of navigating to `/report` immediately after `batchAnalyze`, either:
1. Poll the report API until it returns real data, then navigate
2. Show a progress indicator on the dashboard with the option to navigate when ready
3. Navigate to a "processing" interstitial page that auto-redirects when analysis completes

**Pros:**
- Better UX
- Prevents confusion when jobs are being processed

**Cons:**
- Doesn't fix the underlying data pipeline issue
- Adds complexity

---

## Files Involved

### Primary (Root Cause)
- `apps/stockfish-worker/worker_config.py` (line 8 — reads `SUPABASE_SERVICE_KEY` which is an anon key)
- `apps/stockfish-worker/worker.py` (line 19 — creates Supabase client with anon key)
- `apps/stockfish-worker/.env` (line 2 — stores anon key as `SUPABASE_SERVICE_KEY`; line 3 — stores service role key as `SERVICE_ROLE`)

### Secondary (Mock Placeholder)
- `apps/stockfish-worker/worker.py` (lines 34-46 — mock placeholder instead of real analysis)

### Tertiary (Frontend Orchestration)
- `apps/web/src/app/api/analyze/[username]/batch/route.ts` (batch analysis endpoint — creates jobs with service_role key)
- `apps/web/src/lib/supabase-admin.ts` (creates admin Supabase client with service_role key)
- `apps/web/src/app/dashboard/page.tsx` (line 94 — navigates to report immediately after batch API returns)
- `apps/web/src/app/api/report/[username]/route.ts` (report endpoint — queries for completed jobs)
- `apps/web/src/app/api/training-plan/[username]/route.ts` (training plan endpoint — queries for completed jobs)
- `apps/web/src/services/api.ts` (lines 68-83 — API service functions)

### References
- `apps/stockfish-worker/worker_core/game_analyzer.py` (actual analysis code — currently commented out in worker.py)
- `apps/stockfish-worker/worker_core/batch_analyzer.py` (batch aggregation — currently unused by worker.py)
- `apps/web/prisma/schema.prisma` (line 659 — `analysis_jobs` model definition)

---

## Recommended Fix Order

### Immediate Fixes
1. **Fix the Supabase key used by the worker** — Change either the `.env` file or `worker_config.py` so the worker uses the service_role key instead of the anon key. This is a 1-line fix that unblocks the entire pipeline.

### Secondary Fixes
2. **Replace the worker placeholder with real analysis** — Uncomment the `GameAnalyzer` code in `worker.py` and implement PGN content storage/retrieval so the worker performs actual analysis instead of mock processing.

### UX Improvements
3. **Fix the report navigation race condition** — Don't navigate to `/report` immediately after jobs are created. Show a progress indicator or poll for completion.

### Preventative
4. **Add RLS policies or document key requirements** — Either create RLS policies for the anon role on `analysis_jobs`, or clearly document that the worker requires the service_role key.
5. **Add validation logging** — The worker should log a warning when the Supabase client returns empty results on a fresh poll, to help diagnose RLS issues faster.

---

## Notes For Implementation Agent

### Fix #1 — Worker Supabase Key
**File to modify:** `apps/stockfish-worker/worker_config.py`
**Change:** The `Settings` class reads `SUPABASE_SERVICE_KEY` from env vars. The `.env` has `SERVICE_ROLE` as the actual service role key. Either:
  - Rename `SERVICE_ROLE` to `SUPABASE_SERVICE_KEY` in `.env` and remove the anon key line, OR
  - Add a new field `SERVICE_ROLE_KEY` to the Settings class and update `worker.py` to use it, OR
  - Use pydantic's `Field(validation_alias=...)` to read `SERVICE_ROLE` into `SUPABASE_SERVICE_KEY`

**Simplest fix:**
In `apps/stockfish-worker/.env`, replace the current `SUPABASE_SERVICE_KEY` value (anon key) with the value from `SERVICE_ROLE`, and remove the `SERVICE_ROLE` line:
```
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xl...
```

### Fix #2 — Activate Real Worker Analysis
**File to modify:** `apps/stockfish-worker/worker.py`
**Changes:**
1. Replace the mock placeholder (lines 34-46) with real analysis code.
2. PGN text must be available — currently the batch API stores only `username` and `filename`. The worker needs to fetch the PGN from somewhere. Options:
   - Store PGN content in a new column on `analysis_jobs` table (requires schema migration)
   - Fetch games from Chess.com/Lichess APIs directly in the worker (same as the batch route does)
   - Store PGN in a Supabase Storage bucket
3. The uncommented code would look like:
```python
# Fetch PGN from source (needs implementation based on how PGNs are stored)
pgn_text = fetch_pgn(username, filename)  # TODO: implement

analyzer = GameAnalyzer()
result = analyzer.analyze_pgn(pgn_text, username)
```

### Edge Cases to Test After Fix
- Worker starts and polls with service_role key — should find pending jobs
- Worker processes a single game analysis end-to-end (PGN → Stockfish → result JSON)
- Worker processes multiple jobs sequentially
- Report page shows real data (accuracy, openings, patterns, etc.) after jobs complete
- Training plan page shows personalized plan after batch analysis completes
- What happens when Stockfish is not installed on the worker machine
- What happens when Chess.com/Lichess API is unreachable
- Jobs should not be double-processed (worker should use atomic status transitions)

### Verification
After fix #1:
```bash
# Verify the worker can see pending jobs
cd apps/stockfish-worker
venv/bin/python -c "
from supabase import create_client
from worker_config import settings
s = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
res = s.table('analysis_jobs').select('count', count='exact').limit(1).execute()
print(f'Count: {res.count}')
"
```
This should return the actual count of rows, not `None`.

---

## Success Criteria

- Worker logs show `POLL_HIT poll=N job_id=X` after a batch analysis is triggered
- Worker logs show `JOB_START`, `JOB_PROCESSING`, `JOB_COMPLETED` for each job
- Report page shows real accuracy data (non-zero, with phases, openings, patterns)
- Training plan page shows personalized recommendations (not "Not enough data")
- Jobs transition from `pending` → `processing` → `completed` in the database
