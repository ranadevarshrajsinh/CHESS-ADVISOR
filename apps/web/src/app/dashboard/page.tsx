"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import GameCard from "@/components/GameCard";
import Loader from "@/components/Loader";
import { usePlayer } from "@/contexts/PlayerContext";
import { getStats, batchAnalyze } from "@/services/api";
import { Play, TrendingUp, TrendingDown, Minus } from "lucide-react";

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
        borderRadius: "20px",
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

export default function Dashboard() {
  const router = useRouter();
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();
  const [stats, setStats] = useState<any>(null);
  const [realStats, setRealStats] = useState<any>(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  useEffect(() => {
    if (playerLoading) return;
    if (!chessUsername || !isApproved) {
      router.push("/login");
      return;
    }

    const storedGames = localStorage.getItem("recentGames");
    if (storedGames) {
      let parsed = JSON.parse(storedGames);
      // Migrate old cached data: if filename contains a full URL, extract just the game ID
      parsed = parsed.map((g: any) => {
        if (g.filename && (g.filename.includes('://') || g.filename.includes('/'))) {
          const segments = g.filename.split('/');
          g.filename = segments[segments.length - 1] || g.filename;
        }
        return g;
      });
      localStorage.setItem("recentGames", JSON.stringify(parsed));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGames(parsed);
    }

    getStats(chessUsername)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch(`/api/chess-com/${chessUsername}/stats`)
      .then((r) => r.json())
      .then(setRealStats)
      .catch(console.error);
  }, [chessUsername, isApproved, playerLoading, router]);

  const handleBatchAnalyze = async () => {
    setBatchAnalyzing(true);
    setBatchResult(null);
    try {
      const result = await batchAnalyze(chessUsername, 5);
      setBatchResult(result);
      setBatchAnalyzing(false);
    } catch (e) {
      console.error(e);
      alert(
        "Batch analysis failed. Please ensure the backend and Stockfish are running properly.",
      );
      setBatchAnalyzing(false);
    }
  };

  if (!chessUsername) return null;

  return (
    <>
      <Header />
      <main
        className="container animate-fade-in"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
      >
        <div className="flex-between" style={{ marginBottom: "32px" }}>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "8px",
              }}
            >
              <h1 style={{ fontSize: "32px", margin: 0 }}>
                Welcome, {chessUsername}
              </h1>
              {stats?.momentum && <MomentumBadge momentum={stats.momentum} />}
            </div>
            <p style={{ color: "var(--text-secondary)" }}>
              Here&apos;s an overview of your recent performance.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleBatchAnalyze}
            disabled={batchAnalyzing}
            style={{ padding: "12px 24px", fontSize: "15px" }}
          >
            <Play size={18} fill="currentColor" />
            {batchAnalyzing ? "Analyzing..." : "Run Batch Analysis"}
          </button>
        </div>

        {/* ── Batch Analysis Success Banner ── */}
        {batchResult && (
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              marginBottom: "8px",
            }}
          >
            <div>
              <div style={{ fontWeight: "700", fontSize: "16px", color: "var(--success)" }}>
                Batch Analysis Started
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--text-secondary)" }}>
                {batchResult.jobs_created} job{batchResult.jobs_created !== 1 ? "s" : ""} created
                from {batchResult.total_games} game{batchResult.total_games !== 1 ? "s" : ""}.
                The worker is processing them now — check back shortly.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => router.push("/report")}
              style={{ padding: "10px 20px", fontSize: "14px", whiteSpace: "nowrap" }}
            >
              View Report
            </button>
          </div>
        )}

        {loading ? (
          <Loader message="Loading dashboard..." />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "32px" }}
          >
            {/* ── Overall Stats ── */}
            {realStats &&
              (() => {
                let wins = 0,
                  losses = 0,
                  draws = 0;
                [
                  "chess_rapid",
                  "chess_blitz",
                  "chess_bullet",
                  "chess_daily",
                ].forEach((fmt) => {
                  if (realStats[fmt]?.record) {
                    wins += realStats[fmt].record.win;
                    losses += realStats[fmt].record.loss;
                    draws += realStats[fmt].record.draw;
                  }
                });
                const totalGames = wins + losses + draws;
                const winRate =
                  totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

                return (
                  <section>
                    <h2
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        marginBottom: "16px",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                      }}
                    >
                      Overall Stats (Chess.com)
                    </h2>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "20px",
                      }}
                    >
                      <div className="glass-card">
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            marginBottom: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Total Games
                        </div>
                        <div style={{ fontSize: "32px", fontWeight: "700" }}>
                          {totalGames.toLocaleString()}
                        </div>
                      </div>
                      <div className="glass-card">
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            marginBottom: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Win Rate
                        </div>
                        <div
                          style={{
                            fontSize: "32px",
                            fontWeight: "700",
                            color: "var(--success)",
                          }}
                        >
                          {winRate}%
                        </div>
                      </div>
                      <div
                        className="glass-card"
                        style={{ display: "flex", gap: "24px" }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                              marginBottom: "4px",
                            }}
                          >
                            Wins
                          </div>
                          <div
                            style={{
                              fontSize: "24px",
                              fontWeight: "600",
                              color: "var(--success)",
                            }}
                          >
                            {wins.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                              marginBottom: "4px",
                            }}
                          >
                            Losses
                          </div>
                          <div
                            style={{
                              fontSize: "24px",
                              fontWeight: "600",
                              color: "var(--danger)",
                            }}
                          >
                            {losses.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-secondary)",
                              marginBottom: "4px",
                            }}
                          >
                            Draws
                          </div>
                          <div
                            style={{
                              fontSize: "24px",
                              fontWeight: "600",
                              color: "var(--warning)",
                            }}
                          >
                            {draws.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })()}

            {/* ── Win Rate by Color (from backend stats) ── */}
            {stats?.win_rate &&
              (stats.win_rate.as_white ||
                stats.win_rate.as_black ||
                stats.win_rate.white ||
                stats.win_rate.black) && (
                <section>
                  <h2
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      marginBottom: "16px",
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.8px",
                    }}
                  >
                    Win Rate by Color (Analyzed Games)
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "20px",
                    }}
                  >
                    {(["white", "black"] as const).map((color) => {
                      const d =
                        stats.win_rate[`as_${color}`] || stats.win_rate[color];
                      if (!d) return null;
                      const w = d.wins ?? d.win ?? 0;
                      const l = d.losses ?? d.loss ?? 0;
                      const dr = d.draws ?? d.draw ?? 0;
                      const total = w + l + dr;
                      const pct = total > 0 ? Math.round((w / total) * 100) : 0;
                      return (
                        <div key={color} className="glass-card">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              marginBottom: "12px",
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "4px",
                                background: color === "white" ? "#eee" : "#333",
                                color: color === "white" ? "#111" : "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "bold",
                                fontSize: "12px",
                              }}
                            >
                              {color === "white" ? "W" : "B"}
                            </div>
                            <span
                              style={{
                                fontWeight: "600",
                                textTransform: "capitalize",
                              }}
                            >
                              As {color}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "28px",
                              fontWeight: "700",
                              color: "var(--success)",
                              marginBottom: "8px",
                            }}
                          >
                            {pct}%
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "14px",
                              fontSize: "13px",
                            }}
                          >
                            <span style={{ color: "var(--success)" }}>
                              {w}W
                            </span>
                            <span style={{ color: "var(--danger)" }}>{l}L</span>
                            <span style={{ color: "var(--warning)" }}>
                              {dr}D
                            </span>
                          </div>
                          {total > 0 && (
                            <div
                              style={{
                                marginTop: "10px",
                                height: "5px",
                                borderRadius: "3px",
                                background: "var(--surface-2)",
                                overflow: "hidden",
                                display: "flex",
                              }}
                            >
                              <div
                                style={{
                                  width: `${(w / total) * 100}%`,
                                  background: "var(--success)",
                                }}
                              />
                              <div
                                style={{
                                  width: `${(dr / total) * 100}%`,
                                  background: "var(--warning)",
                                }}
                              />
                              <div
                                style={{
                                  width: `${(l / total) * 100}%`,
                                  background: "var(--danger)",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Overall accuracy from stats if available */}
                    {stats?.accuracy != null && (
                      <div className="glass-card">
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            marginBottom: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Avg Accuracy
                        </div>
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: "700",
                            color: "var(--accent-color)",
                          }}
                        >
                          {parseFloat(stats.accuracy).toFixed(1)}%
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            marginTop: "4px",
                          }}
                        >
                          From analyzed games
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

            {/* ── Recent Games ── */}
            <section>
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  marginBottom: "16px",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                Recent Games
              </h2>
              {games.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: "20px",
                  }}
                >
                  {games.map((g, i) => (
                    <GameCard key={i} game={g} />
                  ))}
                </div>
              ) : (
                <div
                  className="glass"
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  No recent games found. You might need to fetch them again from
                  the Onboarding page.
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
