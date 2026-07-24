"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Loader from "@/components/Loader";
import GameCard from "@/components/GameCard";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchGamesByTimeControl } from "@/services/api";
import { ArrowLeft } from "lucide-react";

const TC_META: Record<string, { label: string; icon: string }> = {
  rapid:  { label: "Rapid",  icon: "🕐" },
  blitz:  { label: "Blitz",  icon: "⏱" },
  bullet: { label: "Bullet", icon: "⚡" },
  daily:  { label: "Daily",  icon: "📅" },
};

function GamesPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const tc           = searchParams.get("tc") || "";
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();

  const [games,   setGames]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (playerLoading) return;
    if (!chessUsername || !isApproved) { router.push("/login"); return; }
    if (!tc) { router.push("/dashboard"); return; }

    setLoading(true);
    setError("");
    fetchGamesByTimeControl(chessUsername, tc, 50)
      .then(setGames)
      .catch(() => setError("Could not fetch games from Chess.com. Check your connection."))
      .finally(() => setLoading(false));
  }, [chessUsername, isApproved, playerLoading, router, tc]);

  const meta  = TC_META[tc] || { label: tc, icon: "" };
  const label = meta.label;
  const icon  = meta.icon;

  return (
    <>
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
      >
        {/* Page header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: "32px", flexWrap: "wrap", gap: "16px",
        }}>
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-secondary)", fontSize: "13px",
                padding: 0, display: "flex", alignItems: "center", gap: "4px", marginBottom: "10px",
              }}
            >
              <ArrowLeft size={14} />
              Dashboard
            </button>
            <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 6px" }}>
              {icon} {label} Games
            </h1>
            <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "14px" }}>
              {loading
                ? `Fetching your recent ${label} games from Chess.com…`
                : error
                  ? "Could not load games"
                  : `${games.length} most recent ${label} game${games.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              onClick={() => router.push(`/batch?tc=${tc}`)}
              style={{ padding: "10px 18px", fontSize: "13px" }}
            >
              Analyze with Stockfish
            </button>
            <button
              className="btn btn-primary"
              onClick={() => router.push(`/report?tc=${tc}`)}
              style={{ padding: "10px 18px", fontSize: "13px" }}
            >
              View {label} Report →
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <Loader message={`Loading your ${label} games…`} />
        ) : error ? (
          <div className="glass-card" style={{ padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.5 }}>⚠️</div>
            <p style={{ color: "var(--danger)", marginBottom: "16px" }}>{error}</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setLoading(true);
                setError("");
                fetchGamesByTimeControl(chessUsername!, tc, 50)
                  .then(setGames)
                  .catch(() => setError("Could not fetch games from Chess.com. Check your connection."))
                  .finally(() => setLoading(false));
              }}
            >
              Try Again
            </button>
          </div>
        ) : games.length === 0 ? (
          <div className="glass-card" style={{ padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>{icon}</div>
            <h2 style={{ marginBottom: "8px" }}>No {label} games found</h2>
            <p style={{ color: "var(--text-secondary)" }}>
              No recent {label} games were found on your Chess.com account.
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
            gap: "20px",
          }}>
            {games.map((g, i) => (
              <GameCard key={i} game={g} username={chessUsername!} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export default function GamesPage() {
  return (
    <Suspense>
      <GamesPageInner />
    </Suspense>
  );
}
