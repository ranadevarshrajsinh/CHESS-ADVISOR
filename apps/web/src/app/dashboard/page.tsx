"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import GameCard from "@/components/GameCard";
import Loader from "@/components/Loader";
import { PillTabs } from "@/components/PillTabs";
import { usePlayer } from "@/contexts/PlayerContext";
import { getStats, fetchGames, getBatchJobs } from "@/services/api";
import { ChevronRight, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp, Clock, Zap, Gauge, CalendarDays, Loader2, CheckCircle2 } from "lucide-react";

function MomentumBadge({ momentum }: { momentum: string }) {
  const lower = (momentum || "").toLowerCase();
  const isUp = lower.includes("improv");
  const isDown = lower.includes("declin");
  const color = isUp
    ? "var(--success)"
    : isDown
      ? "var(--danger)"
      : "var(--warning)";
  const bg = isUp
    ? "rgba(16,185,129,0.1)"
    : isDown
      ? "rgba(239,68,68,0.1)"
      : "rgba(245,158,11,0.1)";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 10px",
        borderRadius: "99px",
        background: bg,
        color,
        fontSize: "12px",
        fontWeight: "700",
        border: `1px solid ${color}33`,
      }}
    >
      <Icon size={12} />
      {momentum}
    </span>
  );
}

function winRateColor(pct: number): string {
  if (pct >= 55) return "var(--success)";
  if (pct >= 40) return "var(--warning)";
  return "var(--danger)";
}

function useCountUp(target: number, triggered: boolean, duration = 1400, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!triggered) { setValue(0); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
      setValue(target);
      return;
    }
    let rafId: number;
    let startTime: number | null = null;
    const runTick = (now: number) => {
      if (!startTime) startTime = now;
      const t = Math.min((now - startTime) / duration, 1);
      setValue(Math.round((1 - Math.pow(2, -10 * t)) * target));
      if (t < 1) rafId = requestAnimationFrame(runTick);
      else setValue(target);
    };
    const timerId = setTimeout(() => { rafId = requestAnimationFrame(runTick); }, delay);
    return () => { clearTimeout(timerId); cancelAnimationFrame(rafId); };
  }, [triggered, target, duration, delay]);
  return value;
}

export default function Dashboard() {
  const router = useRouter();
  const { chessUsername, lichessUsername, activePlatform, activeUsername, isApproved, loading: playerLoading } = usePlayer();
  const [stats, setStats] = useState<any>(null);
  const [realStats, setRealStats] = useState<any>(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  // Map of time_class → most recent completed batch job summary
  // null key = all-games job
  const [batchStatus, setBatchStatus] = useState<Record<string, any>>({});
  const [showFetchPanel, setShowFetchPanel] = useState(false);
  const [fetchPlatform, setFetchPlatform] = useState("chess.com");
  const [fetchLimit, setFetchLimit] = useState(10);
  const [fetchMode, setFetchMode] = useState<"append" | "replace">("append");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [replaceConfirmStep, setReplaceConfirmStep] = useState(false);
  const [gameFilter, setGameFilter] = useState<string>("all");

  const platformTabs = useMemo(() => {
    const tabs: { id: "chess.com" | "lichess"; label: string }[] = [];
    if (chessUsername) tabs.push({ id: "chess.com", label: "Chess.com" });
    if (lichessUsername) tabs.push({ id: "lichess", label: "Lichess" });
    return tabs;
  }, [chessUsername, lichessUsername]);

  useEffect(() => {
    setFetchPlatform(activePlatform);
  }, [activePlatform]);

  useEffect(() => {
    if (playerLoading) return;
    if (!activeUsername || !isApproved) {
      router.push("/login");
      return;
    }

    localStorage.removeItem("recentGames"); // remove unnamespaced key that could leak across players
    const gamesKey = `recentGames_${activeUsername}`;
    const storedGames = localStorage.getItem(gamesKey);
    if (storedGames) {
      setGames(JSON.parse(storedGames));
    } else {
      setShowFetchPanel(true);
    }

    const STATS_CACHE_VERSION = "v2";
    const statsKey = `stats_${activeUsername}_${STATS_CACHE_VERSION}`;
    const realStatsKey = `realStats_${activeUsername}_${STATS_CACHE_VERSION}`;

    // Show cached stats immediately so the dashboard renders without a loader
    const cachedStats = localStorage.getItem(statsKey);
    if (cachedStats) {
      try {
        setStats(JSON.parse(cachedStats));
        setLoading(false);
      } catch {}
    }
    const cachedRealStats = localStorage.getItem(realStatsKey);
    if (cachedRealStats) {
      try { setRealStats(JSON.parse(cachedRealStats)); } catch {}
    }

    // Re-fetch in background and update cache
    getStats(activeUsername)
      .then((s) => {
        setStats(s);
        if (s) localStorage.setItem(statsKey, JSON.stringify(s));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Per-time-control career/recent-form stats — sourced differently per platform
    if (activePlatform === "lichess" && lichessUsername) {
      fetch(`/api/lichess/${lichessUsername}/stats`)
        .then((r) => r.json())
        .then((s) => {
          setRealStats(s);
          localStorage.setItem(realStatsKey, JSON.stringify(s));
        })
        .catch(console.error);
    } else if (chessUsername) {
      fetch(`/api/chess-com/${chessUsername}/stats`)
        .then((r) => r.json())
        .then((s) => {
          setRealStats(s);
          localStorage.setItem(realStatsKey, JSON.stringify(s));
        })
        .catch(console.error);
    }

    // Fetch batch job statuses to show analysis state on each tc card
    getBatchJobs(activeUsername)
      .then(jobs => {
        const completed = jobs.filter((j: any) => j.status === "completed");
        const statusMap: Record<string, any> = {};
        for (const job of completed) {
          const key = job.time_class ?? "all";
          // Keep only the most recent per key (jobs are ordered newest-first)
          if (!statusMap[key]) statusMap[key] = job;
        }
        setBatchStatus(statusMap);
      })
      .catch(() => {});

  }, [activeUsername, chessUsername, lichessUsername, activePlatform, isApproved, playerLoading, router]);

  const handleLoadGames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fetchMode === "replace" && (games as any[]).length > 0 && !replaceConfirmStep) {
      setReplaceConfirmStep(true);
      return;
    }
    setReplaceConfirmStep(false);
    setFetching(true);
    setFetchError("");
    try {
      const fetchUsername = fetchPlatform === "lichess" ? lichessUsername : chessUsername;
      const newGames = await fetchGames(fetchPlatform, fetchUsername, fetchLimit);
      setGames((prev: any[]) => {
        let merged: any[];
        if (fetchMode === "replace") {
          merged = newGames;
        } else {
          const existingUrls = new Set(prev.map((g: any) => g.filename));
          merged = [...prev, ...newGames.filter((g: any) => !existingUrls.has(g.filename))];
        }
        localStorage.setItem(`recentGames_${activeUsername}`, JSON.stringify(merged));
        return merged;
      });
      setShowFetchPanel(false);
    } catch (err: any) {
      setFetchError(err.message || "Failed to fetch games.");
    } finally {
      setFetching(false);
    }
  };

  // ── Summary card count-up animation ──────────────────────────────────
  const summaryRef = useRef<HTMLDivElement>(null);
  const [summaryInView, setSummaryInView] = useState(false);
  const summaryTotals = useMemo(() => {
    if (!realStats) return null;
    const allKeys = activePlatform === "lichess"
      ? ["lichess_rapid", "lichess_blitz", "lichess_bullet", "lichess_classical"]
      : ["chess_rapid", "chess_blitz", "chess_bullet", "chess_daily"];
    const keys = allKeys.filter(k => realStats[k]?.record);
    if (!keys.length) return null;
    let wins = 0, losses = 0, draws = 0;
    keys.forEach(k => { wins += realStats[k].record.win; losses += realStats[k].record.loss; draws += realStats[k].record.draw; });
    const total = wins + losses + draws;
    return { wins, losses, draws, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0 };
  }, [realStats, activePlatform]);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || !summaryTotals) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSummaryInView(true); io.disconnect(); } },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [summaryTotals]);
  const animGames   = useCountUp(summaryTotals?.total   ?? 0, summaryInView, 1400,  0);
  const animWinRate = useCountUp(summaryTotals?.winRate  ?? 0, summaryInView, 1200, 120);
  const animWins    = useCountUp(summaryTotals?.wins     ?? 0, summaryInView, 1000, 280);
  const animLosses  = useCountUp(summaryTotals?.losses   ?? 0, summaryInView, 1000, 350);
  const animDraws   = useCountUp(summaryTotals?.draws    ?? 0, summaryInView, 1000, 420);

  if (!activeUsername) return null;

  return (
    <>
      <Header />
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
        aria-label="Dashboard"
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: "16px",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "6px",
                flexWrap: "wrap",
              }}
            >
              <h1 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, margin: 0 }}>
                Welcome, {activeUsername}
              </h1>
              {stats?.momentum && <MomentumBadge momentum={stats.momentum} />}
            </div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-secondary)", margin: 0 }}>
              Here&apos;s an overview of your recent performance.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => router.push("/batch")}
            style={{ padding: "12px 28px", fontSize: "15px", fontWeight: 600, flexShrink: 0 }}
          >
            Batch Analysis
            <ChevronRight size={16} />
          </button>
        </div>

        {loading ? (
          <Loader message="Loading dashboard..." />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "32px" }}
          >
            {/* ── Bento hero row ── */}
            {(summaryTotals != null || games.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "20px", alignItems: "stretch" }}>

                {/* LEFT: Overall — tall vertical card */}
                {summaryTotals != null && (
                  <div ref={summaryRef} className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Win rate — hero metric, shown first */}
                    <div>
                      <div style={{ fontSize: "clamp(2.2rem, 8vw, 3rem)", fontWeight: 800, lineHeight: 1, color: "var(--success)" }}>{animWinRate}%</div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.8rem", fontWeight: 500, letterSpacing: "0.02em", color: "var(--text-secondary)", marginTop: "4px", textTransform: "uppercase" }}>overall win rate</div>
                    </div>
                    {/* Games played — secondary metric */}
                    <div>
                      <div style={{ fontSize: "clamp(1.5rem, 5vw, 2rem)", fontWeight: 700, lineHeight: 1 }}>{animGames.toLocaleString()}</div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>games played</div>
                    </div>
                    {/* W/L/D breakdown */}
                    <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid var(--glass-border)" }}>
                      {/* Stacked bar */}
                      {summaryTotals.total > 0 && (
                        <div
                          role="img"
                          aria-label={`Win/Draw/Loss split`}
                          style={{ height: "5px", borderRadius: "99px", overflow: "hidden", display: "flex", marginBottom: "14px", background: "var(--border-subtle)" }}
                        >
                          <div style={{ width: `${(summaryTotals.wins / summaryTotals.total) * 100}%`, background: "var(--success)" }} />
                          <div style={{ width: `${(summaryTotals.draws / summaryTotals.total) * 100}%`, background: "var(--warning)" }} />
                          <div style={{ width: `${(summaryTotals.losses / summaryTotals.total) * 100}%`, background: "var(--danger)" }} />
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "24px" }}>
                        <div>
                          <div style={{ fontSize: "clamp(1rem, 4vw, 1.2rem)", fontWeight: 700, color: "var(--success)" }}>{animWins.toLocaleString()}</div>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>Wins</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "clamp(1rem, 4vw, 1.2rem)", fontWeight: 700, color: "var(--danger)" }}>{animLosses.toLocaleString()}</div>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>Losses</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "clamp(1rem, 4vw, 1.2rem)", fontWeight: 700, color: "var(--warning)" }}>{animDraws.toLocaleString()}</div>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>Draws</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* RIGHT: Bento — White / Black / games count / Accuracy in 4 quadrants */}
                {games.length > 0 && (() => {
                  const colorStats = { white: { wins: 0, losses: 0, draws: 0 }, black: { wins: 0, losses: 0, draws: 0 } };
                  const chessLower = chessUsername?.toLowerCase();
                  const lichessLower = lichessUsername?.toLowerCase();
                  const WHITE_LOSS = new Set(["checkmated", "resigned", "timeout", "abandoned", "loss"]);
                  (games as any[]).forEach((g) => {
                    const userLower = g.platform === "lichess" ? lichessLower : chessLower;
                    const isWhite = (g.white || "").toLowerCase() === userLower;
                    const side = colorStats[isWhite ? "white" : "black"];
                    const r = (g.result || "").toLowerCase().trim();
                    if (r === "1-0" || r === "white") { isWhite ? side.wins++ : side.losses++; }
                    else if (r === "0-1" || r === "black") { isWhite ? side.losses++ : side.wins++; }
                    else if (r === "win") { isWhite ? side.wins++ : side.losses++; }
                    else if (WHITE_LOSS.has(r)) { isWhite ? side.losses++ : side.wins++; }
                    else { side.draws++; }
                  });
                  const total = games.length;
                  return (
                    <div className="glass-card bento-color-grid" style={{ padding: 0 }}>
                      {(["white", "black"] as const).map((color, i) => {
                        const { wins, losses, draws } = colorStats[color];
                        const sideTotal = wins + losses + draws;
                        const pct = sideTotal > 0 ? Math.round((wins / sideTotal) * 100) : 0;
                        return (
                          <div key={color} style={{
                            padding: "24px",
                            borderRight: i === 0 ? "1px solid var(--glass-border)" : "none",
                            borderBottom: "1px solid var(--glass-border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}>
                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>As {color}</div>
                            <div style={{ fontSize: "clamp(1.5rem, 5vw, 2.2rem)", fontWeight: 800, color: winRateColor(pct), lineHeight: 1 }} aria-label={`${pct}% win rate as ${color}`}>{pct}%</div>
                            <div style={{ display: "flex", gap: "10px", fontFamily: "'Inter', sans-serif", fontSize: "12px", alignItems: "center" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--success)", flexShrink: 0, display: "inline-block" }} />
                                <span style={{ color: "var(--success)" }} aria-label={`${wins} wins`}>{wins}</span>
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--danger)", flexShrink: 0, display: "inline-block" }} />
                                <span style={{ color: "var(--danger)" }} aria-label={`${losses} losses`}>{losses}</span>
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--warning)", flexShrink: 0, display: "inline-block" }} />
                                <span style={{ color: "var(--warning)" }} aria-label={`${draws} draws`}>{draws}</span>
                              </span>
                            </div>
                            {sideTotal > 0 && (
                              <div
                                role="img"
                                aria-label={`Win/Draw/Loss: ${Math.round((wins/sideTotal)*100)}% / ${Math.round((draws/sideTotal)*100)}% / ${Math.round((losses/sideTotal)*100)}%`}
                                style={{ height: "5px", borderRadius: "99px", background: "var(--border-subtle)", overflow: "hidden", display: "flex" }}
                              >
                                <div style={{ width: `${(wins / sideTotal) * 100}%`, background: "var(--success)" }} />
                                <div style={{ width: `${(draws / sideTotal) * 100}%`, background: "var(--warning)" }} />
                                <div style={{ width: `${(losses / sideTotal) * 100}%`, background: "var(--danger)" }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div style={{ padding: "14px 24px", borderRight: "1px solid var(--glass-border)", display: "flex", alignItems: "center" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "var(--text-secondary)" }}>{total} game{total !== 1 ? "s" : ""} loaded</span>
                      </div>
                      <div style={{ padding: "14px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px" }}>
                        {stats?.accuracy != null ? (
                          <>
                            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg Accuracy</div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-color)" }}>{parseFloat(stats.accuracy).toFixed(1)}%</div>
                          </>
                        ) : (
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "var(--text-secondary)" }}>No analysis yet</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}

            {/* ── Stats by Time Control ── */}
            {realStats && (() => {
              const formats = (activePlatform === "lichess"
                ? [
                    { key: "lichess_rapid",     label: "Rapid",     Icon: Clock },
                    { key: "lichess_blitz",     label: "Blitz",     Icon: Zap },
                    { key: "lichess_bullet",    label: "Bullet",    Icon: Gauge },
                    { key: "lichess_classical", label: "Classical", Icon: CalendarDays },
                  ]
                : [
                    { key: "chess_rapid",  label: "Rapid",  Icon: Clock },
                    { key: "chess_blitz",  label: "Blitz",  Icon: Zap },
                    { key: "chess_bullet", label: "Bullet", Icon: Gauge },
                    { key: "chess_daily",  label: "Daily",  Icon: CalendarDays },
                  ]
              ).filter(({ key }) => realStats[key]?.record);

              if (formats.length === 0) return null;

              let totalWins = 0, totalLosses = 0, totalDraws = 0;
              formats.forEach(({ key }) => {
                totalWins   += realStats[key].record.win;
                totalLosses += realStats[key].record.loss;
                totalDraws  += realStats[key].record.draw;
              });
              const totalGames = totalWins + totalLosses + totalDraws;
              const overallWinRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

              return (
                <section aria-labelledby="tc-stats-heading">
                  <h2 id="tc-stats-heading" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "1.1rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)", marginBottom: "16px" }}>
                    Stats by Time Control
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "8px" }}>
                      {activePlatform === "lichess" ? "Lichess" : "Chess.com"}
                    </span>
                  </h2>

                  {/* Per-time-control cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                    {formats.map(({ key, label, Icon }) => {
                      const { record, last } = realStats[key];
                      const games = record.win + record.loss + record.draw;
                      const wr = games > 0 ? Math.round((record.win / games) * 100) : 0;
                      const tc = label.toLowerCase();
                      const job = batchStatus[tc];
                      const analyzed = job?.status === "completed";
                      const daysAgo = analyzed
                        ? Math.floor((Date.now() - new Date(job.created_at).getTime()) / 86400000)
                        : null;
                      const analysisLabel = analyzed
                        ? daysAgo === 0
                          ? "Today"
                          : daysAgo === 1
                            ? "Yesterday"
                            : `${daysAgo}d ago`
                        : null;

                      return (
                        <Link
                          key={key}
                          href={`/games?tc=${tc}`}
                          className="glass-card tc-nav-card"
                          aria-label={`Browse ${label} games — ${wr}% win rate, ${games.toLocaleString()} games`}
                        >
                          {/* Header: label left, rating right */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                              <Icon size={15} aria-hidden="true" style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "0.95rem", fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</span>
                            </div>
                            {last?.rating && (
                              <span style={{ fontSize: "1rem", fontWeight: 800, color: "var(--accent-color)", letterSpacing: "-0.01em" }}>
                                {last.rating}
                              </span>
                            )}
                          </div>

                          {/* Games count + win rate */}
                          <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1, marginBottom: "3px" }}>
                            {games.toLocaleString()}
                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.8rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "6px" }}>games</span>
                          </div>
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", color: winRateColor(wr), fontWeight: 700, marginBottom: "10px" }}>
                            {wr}% win rate
                          </div>

                          {/* W/L/D with dots */}
                          <div style={{ display: "flex", gap: "12px", fontFamily: "'Inter', sans-serif", fontSize: "12px", alignItems: "center", marginBottom: "10px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--success)", flexShrink: 0, display: "inline-block" }} />
                              <span style={{ color: "var(--success)" }} aria-label={`${record.win} wins`}>{record.win}</span>
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--danger)", flexShrink: 0, display: "inline-block" }} />
                              <span style={{ color: "var(--danger)" }} aria-label={`${record.loss} losses`}>{record.loss}</span>
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--warning)", flexShrink: 0, display: "inline-block" }} />
                              <span style={{ color: "var(--warning)" }} aria-label={`${record.draw} draws`}>{record.draw}</span>
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div
                            role="img"
                            aria-label={`Win/Draw/Loss: ${games > 0 ? Math.round((record.win/games)*100) : 0}% / ${games > 0 ? Math.round((record.draw/games)*100) : 0}% / ${games > 0 ? Math.round((record.loss/games)*100) : 0}%`}
                            style={{ marginBottom: "14px", height: "5px", borderRadius: "99px", background: "var(--border-subtle)", overflow: "hidden", display: "flex" }}
                          >
                            <div style={{ width: `${games > 0 ? (record.win / games) * 100 : 0}%`, background: "var(--success)" }} />
                            <div style={{ width: `${games > 0 ? (record.draw / games) * 100 : 0}%`, background: "var(--warning)" }} />
                            <div style={{ width: `${games > 0 ? (record.loss / games) * 100 : 0}%`, background: "var(--danger)" }} />
                          </div>

                          {/* Analysis status */}
                          <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "12px", marginTop: "auto", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                            {analyzed
                              ? <CheckCircle2 size={12} style={{ color: "var(--success)", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                              : <Clock size={12} style={{ color: "var(--text-secondary)", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                            }
                            <div>
                              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: analyzed ? "var(--success)" : "var(--text-secondary)" }}>
                                {analyzed ? `Analyzed ${analysisLabel}` : "Not analyzed yet"}
                              </div>
                              {analyzed && job.summary?.average_accuracy != null && (
                                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "var(--text-secondary)", marginTop: "1px" }}>
                                  {job.summary.average_accuracy}% avg accuracy
                                </div>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                </section>
              );
            })()}


            {/* ── Recent Games ── */}
            <section aria-labelledby="recent-games-heading">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <h2
                  id="recent-games-heading"
                  style={{
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  Recent Games
                  {games.length > 0 && <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: "0.88rem", color: "var(--text-secondary)", marginLeft: "8px" }}>{games.length}</span>}
                </h2>
                <button
                  onClick={() => { setShowFetchPanel((v) => !v); setFetchError(""); setReplaceConfirmStep(false); }}
                  className="btn btn-secondary"
                  aria-expanded={showFetchPanel}
                  aria-controls="load-games-panel"
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "13px" }}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Load Games
                  {showFetchPanel ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                </button>
              </div>

              {/* Time control filter chips */}
              {games.length > 0 && (() => {
                const counts: Record<string, number> = { all: games.length };
                (games as any[]).forEach(g => {
                  const k = (g.time_class || "other").toLowerCase();
                  counts[k] = (counts[k] || 0) + 1;
                });
                const filters = ["all", "rapid", "blitz", "bullet", "daily"];
                return (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    {filters.map(f => {
                      const cnt = counts[f] ?? 0;
                      if (f !== "all" && cnt === 0) return null;
                      const active = gameFilter === f;
                      return (
                        <button
                          key={f}
                          onClick={() => setGameFilter(f)}
                          aria-pressed={active}
                          className={active ? "filter-chip filter-chip--active" : "filter-chip"}
                        >
                          {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                          <span style={{ marginLeft: "6px", opacity: 0.65, fontSize: "11px", fontWeight: 500 }}>{cnt}</span>
                        </button>
                      );
                    })}
                    {gameFilter !== "all" && (
                      <button
                        onClick={() => router.push(`/games?tc=${gameFilter}`)}
                        className="filter-chip"
                        style={{ marginLeft: "auto", color: "var(--accent-color)", borderColor: "var(--accent-color)" }}
                      >
                        Browse all {gameFilter.charAt(0).toUpperCase() + gameFilter.slice(1)} →
                      </button>
                    )}
                  </div>
                );
              })()}

              {showFetchPanel && (
                <div
                  id="load-games-panel"
                  role="region"
                  aria-label="Load games"
                  className="glass-card"
                  style={{ marginBottom: "20px", padding: "20px" }}
                >
                  <form onSubmit={handleLoadGames} className="load-games-form">
                    <div className="load-games-field">
                      <label style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Platform</label>
                      {platformTabs.length > 1 ? (
                        <PillTabs
                          tabs={platformTabs}
                          activeTab={(fetchPlatform as "chess.com" | "lichess") || "chess.com"}
                          onChange={setFetchPlatform}
                        />
                      ) : (
                        <span style={{ fontSize: "15px", color: "var(--text-primary)", padding: "8px 0" }}>
                          {platformTabs[0]?.label ?? "Chess.com"}
                        </span>
                      )}
                    </div>
                    <div className="load-games-field">
                      <label htmlFor="fetch-count" style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Count (max 50)</label>
                      <input
                        id="fetch-count"
                        type="number"
                        className="input-field"
                        value={fetchLimit}
                        onChange={(e) => setFetchLimit(Math.min(50, Math.max(1, Number(e.target.value))))}
                        min={1}
                        max={50}
                        style={{ padding: "8px 12px", fontSize: "16px" }}
                      />
                    </div>
                    <div className="load-games-field">
                      <span id="fetch-mode-label" style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Mode</span>
                      <div role="group" aria-labelledby="fetch-mode-label" style={{ display: "flex", gap: "8px" }}>
                        {(["append", "replace"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { setFetchMode(m); setReplaceConfirmStep(false); }}
                            aria-pressed={fetchMode === m}
                            style={{
                              flex: 1,
                              padding: "8px 14px",
                              fontSize: "12px",
                              fontWeight: "600",
                              borderRadius: "8px",
                              border: `1px solid ${fetchMode === m ? (m === "replace" ? "var(--danger)" : "var(--accent-color)") : "var(--glass-border)"}`,
                              background: fetchMode === m ? (m === "replace" ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "color-mix(in srgb, var(--accent-color) 12%, transparent)") : "transparent",
                              color: fetchMode === m ? (m === "replace" ? "var(--danger)" : "var(--accent-color)") : "var(--text-secondary)",
                              cursor: "pointer",
                              textTransform: "capitalize",
                              minHeight: "44px",
                            }}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary load-games-submit"
                      disabled={fetching}
                      style={{
                        padding: "8px 20px",
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                        ...(replaceConfirmStep ? { background: "var(--danger)", borderColor: "var(--danger)" } : {}),
                      }}
                    >
                      {fetching && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                      {fetching ? "Fetching…" : replaceConfirmStep ? `Confirm — replace ${(games as any[]).length} game${(games as any[]).length !== 1 ? "s" : ""}` : "Fetch Games"}
                    </button>
                  </form>
                  {replaceConfirmStep && (
                    <div role="alert" style={{ marginTop: "12px", color: "var(--danger)", fontSize: "13px", background: "color-mix(in srgb, var(--danger) 8%, transparent)", padding: "10px 14px", borderRadius: "8px", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
                      This will clear your {(games as any[]).length} loaded game{(games as any[]).length !== 1 ? "s" : ""}. Click the button again to confirm.
                    </div>
                  )}
                  {fetchError && (
                    <div role="alert" aria-live="assertive" style={{ marginTop: "12px", color: "var(--danger)", fontSize: "13px", background: "color-mix(in srgb, var(--danger) 8%, transparent)", padding: "10px 14px", borderRadius: "8px" }}>
                      {fetchError}
                    </div>
                  )}
                  <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                    <strong>Append</strong> adds new games to your existing list (duplicates skipped). <strong>Replace</strong> clears your list and loads fresh games.
                  </p>
                </div>
              )}

              {games.length > 0 ? (() => {
                const filtered = gameFilter === "all"
                  ? games as any[]
                  : (games as any[]).filter(g => (g.time_class || "").toLowerCase() === gameFilter);
                return filtered.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: "20px" }}>
                    {filtered.map((g, i) => (
                      <GameCard key={i} game={g} chessUsername={chessUsername ?? undefined} lichessUsername={lichessUsername ?? undefined} />
                    ))}
                  </div>
                ) : (
                  <div className="glass" style={{ padding: "40px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <RefreshCw size={22} style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
                      No {gameFilter} games in your loaded set.
                    </p>
                    <button
                      onClick={() => router.push(`/games?tc=${gameFilter}`)}
                      className="btn btn-secondary"
                      style={{ fontSize: "13px", padding: "8px 18px" }}
                    >
                      Browse {gameFilter.charAt(0).toUpperCase() + gameFilter.slice(1)} games →
                    </button>
                  </div>
                );
              })() : (
                <div
                  className="glass"
                  style={{ padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}
                >
                  <RefreshCw size={24} style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
                    No recent games found.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setShowFetchPanel(true); setFetchError(""); }}
                    style={{ fontSize: "13px", padding: "10px 22px" }}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Load Games
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
