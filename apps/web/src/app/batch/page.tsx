"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import Header from "@/components/Header";
import Loader from "@/components/Loader";
import { usePlayer } from "@/contexts/PlayerContext";
import { createBatchJob, getBatchJob, getBatchJobs, fetchGamesByTimeControl } from "@/services/api";

const TC_LABELS: Record<string, string> = {
  rapid: "Rapid", blitz: "Blitz", bullet: "Bullet", daily: "Daily",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function BatchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tc = searchParams.get("tc") || "";
  const tcLabel = TC_LABELS[tc] || "";
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();

  const [games, setGames] = useState<any[]>([]);
  const [tcGames, setTcGames] = useState<any[]>([]);
  const [fetchingTc, setFetchingTc] = useState(false);
  const [fetchTcError, setFetchTcError] = useState("");
  const [activeJob, setActiveJob] = useState<any>(null);
  const [pastJobs, setPastJobs] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [analyzeCount, setAnalyzeCount] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobStartRef = useRef<number | null>(null);
  // Track if the user started a job in this session (used to suppress
  // showing previous all-game analyses when a tc filter is active)
  const sessionJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (playerLoading) return;
    if (!chessUsername || !isApproved) { router.push("/login"); return; }

    const stored = localStorage.getItem(`recentGames_${chessUsername}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setGames(parsed);
      } catch {}
    }

    getBatchJobs(chessUsername)
      .then(jobs => {
        // Match jobs to the current tc filter (null = all-games)
        const matchesTc = (j: any) =>
          tc ? j.time_class === tc : j.time_class == null;
        const inProgress = jobs.find(j =>
          matchesTc(j) && (j.status === "pending" || j.status === "processing")
        );
        if (inProgress) {
          setActiveJob(inProgress);
          startPolling(inProgress.id);
        }
        // Don't restore completed jobs for tc-specific flows — always show trigger panel
        setPastJobs(jobs.filter(j => j.status === "completed" || j.status === "failed").slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setPageLoading(false));
  }, [chessUsername, isApproved, playerLoading, router]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // When a tc filter is active, fetch matching games directly from Chess.com
  useEffect(() => {
    if (!tc || !chessUsername || playerLoading) return;
    setFetchingTc(true);
    setFetchTcError("");
    setTcGames([]);
    fetchGamesByTimeControl(chessUsername, tc, 50)
      .then(fetched => setTcGames(fetched))
      .catch(() => setFetchTcError("Could not fetch games from Chess.com. Check your connection and try again."))
      .finally(() => setFetchingTc(false));
  }, [tc, chessUsername, playerLoading]);

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await getBatchJob(jobId);
        setActiveJob(job);
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          getBatchJobs(chessUsername!).then(jobs =>
            setPastJobs(jobs.filter(j => j.status === "completed" || j.status === "failed").slice(0, 5))
          ).catch(() => {});
        }
      } catch {}
    }, 5000);
  }

  async function handleStart() {
    const count = analyzeCount > 0 ? analyzeCount : filteredGames.length;
    const gamesToSubmit = filteredGames.slice(0, count);
    if (!chessUsername || gamesToSubmit.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const urls = gamesToSubmit.map((g: any) => g.filename).filter(Boolean);
      const job = await createBatchJob(chessUsername, urls, tc || undefined);
      sessionJobIdRef.current = job.id;
      setActiveJob(job);
      jobStartRef.current = Date.now();
      startPolling(job.id);
    } catch (e: any) {
      setError(e.message || "Failed to start batch analysis.");
    } finally {
      setSubmitting(false);
    }
  }

  // When tc is set use the freshly-fetched tcGames; otherwise use localStorage games
  const filteredGames = tc ? tcGames : games;

  // Sync analyzeCount whenever the available set changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAnalyzeCount(filteredGames.length); }, [filteredGames.length]);

  // All derived values before early return
  const result = activeJob?.result;
  const isRunning = activeJob?.status === "pending" || activeJob?.status === "processing";
  // When tc is active, only show done/failed for jobs submitted this session
  const isSessionJob = !tc || activeJob?.id === sessionJobIdRef.current;
  const isFailed = activeJob?.status === "failed" && isSessionJob;
  const isDone = activeJob?.status === "completed" && result && isSessionJob;

  const gamesDone   = activeJob?.games_done  ?? 0;
  const gamesTotal  = activeJob?.games_total ?? 0;
  const currentGame = activeJob?.current_game ?? null;
  const progressPct = gamesTotal > 0 ? Math.round((gamesDone / gamesTotal) * 100) : 0;

  const etaLabel = useMemo(() => {
    if (!isRunning || gamesDone < 2 || !jobStartRef.current) return null;
    const elapsed = (Date.now() - jobStartRef.current) / 1000;
    const avgPerGame = elapsed / gamesDone;
    const remaining = Math.round(avgPerGame * (gamesTotal - gamesDone));
    if (remaining <= 0) return null;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return m > 0 ? `~${m}m ${s}s remaining` : `~${s}s remaining`;
  }, [isRunning, gamesDone, gamesTotal]);

  if (playerLoading || pageLoading) {
    return (
      <>
        <Header />
        <div className="flex-center" style={{ minHeight: "60vh" }}>
          <Loader message="Loading..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container animate-fade-in page-content-mobile" style={{ paddingTop: "40px", paddingBottom: "80px" }}>

        {/* Page header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 8px" }}>
            Batch Analysis{tcLabel ? ` — ${tcLabel}` : ""}
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {tcLabel
              ? `Analyzing ${tcLabel} games only using the full Stockfish engine — server-side, so you can close this tab.`
              : "Analyze all your loaded games at once using the full Stockfish engine — server-side, so you can close this tab."}
          </p>
        </div>

        {/* Time control picker */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "32px" }}>
          {["", "rapid", "blitz", "bullet", "daily"].map(f => {
            const active = tc === f;
            return (
              <button
                key={f || "all"}
                onClick={() => router.push(f ? `/batch?tc=${f}` : "/batch")}
                disabled={isRunning}
                aria-pressed={active}
                className={active ? "filter-chip filter-chip--active" : "filter-chip"}
              >
                {f ? TC_LABELS[f] : "All formats"}
              </button>
            );
          })}
        </div>

        {/* Trigger panel */}
        {!isRunning && !isDone && (
          <div className="glass-card" style={{ marginBottom: "32px", padding: "24px" }}>
            {/* Time control fetch state */}
            {tc && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "18px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: fetchTcError ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.08)",
                border: `1px solid ${fetchTcError ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.2)"}`,
                fontSize: "13px",
              }}>
                {fetchingTc ? (
                  <span style={{ color: "var(--text-secondary)" }}>
                    Finding your {tcLabel} games on Chess.com…
                  </span>
                ) : fetchTcError ? (
                  <span style={{ color: "var(--danger)" }}>{fetchTcError}</span>
                ) : (
                  <span>
                    <strong>{filteredGames.length}</strong> {tcLabel} game{filteredGames.length !== 1 ? "s" : ""} found on Chess.com
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <div style={{ fontSize: "15px", fontWeight: "600", marginBottom: "4px" }}>
                  {fetchingTc
                    ? "Fetching games…"
                    : `${filteredGames.length} ${tcLabel || ""} game${filteredGames.length !== 1 ? "s" : ""} available`}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: !fetchingTc && filteredGames.length > 0 ? "16px" : "0" }}>
                  {fetchingTc
                    ? `Searching your Chess.com history for ${tcLabel} games…`
                    : filteredGames.length === 0
                      ? tc
                        ? fetchTcError
                          ? "Failed to load games. Check your connection and try again."
                          : `No ${tcLabel} games found in your recent Chess.com history.`
                        : "Go to the dashboard and load some games first."
                      : "The Python worker will fetch PGNs and run Stockfish on each game. Results appear in the Report section when done."}
                </div>

                {/* Count picker — only shown when games are available and not loading */}
                {!fetchingTc && filteredGames.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Analyze last</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface-2)", borderRadius: "8px", padding: "4px 8px", border: "1px solid var(--glass-border)" }}>
                      <button
                        onClick={() => setAnalyzeCount(c => Math.max(1, c - 1))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "16px", lineHeight: 1, padding: "0 4px", minWidth: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={filteredGames.length}
                        value={analyzeCount}
                        onChange={e => {
                          const v = Math.max(1, Math.min(filteredGames.length, parseInt(e.target.value) || 1));
                          setAnalyzeCount(v);
                        }}
                        style={{
                          width: "42px",
                          textAlign: "center",
                          background: "none",
                          border: "none",
                          color: "var(--text-primary)",
                          fontSize: "16px",
                          fontWeight: "700",
                          outline: "none",
                          fontVariantNumeric: "tabular-nums",
                          MozAppearance: "textfield",
                        } as React.CSSProperties}
                      />
                      <button
                        onClick={() => setAnalyzeCount(c => Math.min(filteredGames.length, c + 1))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "16px", lineHeight: 1, padding: "0 4px", minWidth: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >+</button>
                    </div>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>of {filteredGames.length} games</span>
                    {analyzeCount < filteredGames.length && (
                      <button
                        onClick={() => setAnalyzeCount(filteredGames.length)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-color)", fontSize: "12px", textDecoration: "underline" }}
                      >
                        All
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleStart}
                disabled={submitting || fetchingTc || filteredGames.length === 0}
                style={{ padding: "12px 28px", fontSize: "15px", flexShrink: 0, alignSelf: "flex-end" }}
              >
                {fetchingTc
                  ? "Loading…"
                  : submitting
                    ? "Starting…"
                    : `Analyze ${analyzeCount > 0 ? analyzeCount : filteredGames.length} Game${(analyzeCount > 0 ? analyzeCount : filteredGames.length) !== 1 ? "s" : ""}`}
              </button>
            </div>
            {error && (
              <div style={{ marginTop: "14px", color: "var(--danger)", fontSize: "13px", background: "rgba(239,68,68,0.08)", padding: "10px 14px", borderRadius: "8px" }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* In-progress state */}
        {isRunning && (
          <div className="glass-card" style={{ marginBottom: "32px", padding: "24px 28px" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "14px", height: "14px", border: "2px solid var(--accent-color)", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                <span style={{ fontSize: "15px", fontWeight: "700" }}>Analyzing your games</span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Safe to close this tab — analysis runs on the server
              </span>
            </div>

            {currentGame && (
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentGame}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: "var(--surface-2, rgba(255,255,255,0.06))", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: "100%",
                  background: "var(--accent-color)",
                  borderRadius: "4px",
                  transformOrigin: "left",
                  transform: `scaleX(${gamesTotal > 0 ? progressPct / 100 : 0})`,
                  transition: "transform 0.5s ease",
                }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--accent-color)", minWidth: "36px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {gamesTotal > 0 ? `${progressPct}%` : "—"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-secondary)" }}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {gamesTotal > 0
                  ? `${gamesDone} of ${gamesTotal} game${gamesTotal !== 1 ? "s" : ""}`
                  : "Fetching games…"}
              </span>
              {etaLabel && <span>{etaLabel}</span>}
            </div>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="glass-card" style={{ marginBottom: "32px", padding: "24px", borderColor: "var(--danger)" }}>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--danger)", marginBottom: "6px" }}>Analysis failed</div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              The worker encountered an error. This usually means a PGN could not be fetched from Chess.com or Lichess. Try again or load different games.
            </div>
            <button className="btn btn-primary" onClick={handleStart} disabled={submitting || games.length === 0}>
              {submitting ? "Starting…" : "Try Again"}
            </button>
          </div>
        )}

        {/* Done — send to report */}
        {isDone && (
          <div className="glass-card" style={{ marginBottom: "32px", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
              <CheckCircle size={32} color="var(--success)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{ fontSize: "17px", fontWeight: "700", marginBottom: "4px" }}>
                  Analysis complete
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {result.total_analyzed} game{result.total_analyzed !== 1 ? "s" : ""} analyzed
                  {" · "}avg accuracy {result.average_accuracy}%
                  {" · "}analyzed {fmtDate(activeJob.created_at)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                onClick={() => router.push(tc ? `/report?tc=${tc}` : "/report")}
                style={{ padding: "10px 24px" }}
              >
                View {tcLabel || "Full"} Report
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleStart}
                disabled={submitting || games.length === 0}
              >
                {submitting ? "Starting…" : "Re-analyze"}
              </button>
            </div>
          </div>
        )}

        {/* Past analyses */}
        {pastJobs.length > 0 && (
          <div style={{ marginTop: isDone ? "8px" : "0" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-secondary)", margin: "0 0 12px" }}>
              Past Analyses
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {pastJobs.map(job => (
                <div
                  key={job.id}
                  className="glass-card"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px" }}
                >
                  <div style={{ fontSize: "13px" }}>
                    {job.summary?.total_analyzed ?? "?"} games
                    {job.time_class ? ` · ${job.time_class}` : ""}
                    {" — "}{fmtDate(job.created_at)}
                  </div>
                  <div style={{ fontSize: "12px", color: job.status === "completed" ? "var(--success)" : "var(--danger)", fontWeight: "600", textTransform: "capitalize" }}>
                    {job.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </>
  );
}

export default function BatchPage() {
  return (
    <Suspense>
      <BatchPageInner />
    </Suspense>
  );
}
