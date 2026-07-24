"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchGames } from "@/services/api";
import Loader from "@/components/Loader";
import { PillTabs } from "@/components/PillTabs";

export default function OnboardingPage() {
  const router = useRouter();
  const { chessUsername, lichessUsername, activePlatform, activeUsername, isApproved, loading } = usePlayer();
  const [platform, setPlatform] = useState("chess.com");
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState("idle"); // idle, fetching, success, error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!loading && (!activeUsername || !isApproved)) {
      router.push("/login");
    }
  }, [activeUsername, isApproved, loading, router]);

  useEffect(() => {
    setPlatform(activePlatform);
  }, [activePlatform]);

  const platformTabs = [
    ...(chessUsername ? [{ id: "chess.com" as const, label: "Chess.com" }] : []),
    ...(lichessUsername ? [{ id: "lichess" as const, label: "Lichess" }] : []),
  ];

  const username = activeUsername;

  const handleFetch = async (e) => {
    e.preventDefault();
    setStatus("fetching");
    setErrorMsg("");

    try {
      const fetchUsername = platform === "lichess" ? lichessUsername : chessUsername;
      const games = await fetchGames(platform, fetchUsername, limit);
      localStorage.setItem(`recentGames_${username}`, JSON.stringify(games));
      setStatus("success");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMsg(error.message || "Failed to fetch games.");
    }
  };

  if (status === "fetching") {
    return (
      <div className="flex-center" style={{ minHeight: "100vh" }}>
        <Loader message="Fetching your latest games from the server..." />
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        className="flex-center"
        style={{ minHeight: "100vh", flexDirection: "column" }}
      >
        <div
          className="glass"
          style={{
            padding: "40px",
            textAlign: "center",
            borderColor: "var(--success)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              color: "var(--success)",
              marginBottom: "16px",
            }}
          >
            ✓
          </div>
          <h2 style={{ marginBottom: "8px" }}>Games Fetched Successfully!</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-container flex-center">
      <div className="glass onboarding-box animate-fade-in">
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #10b981, #34d399)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            marginBottom: "20px",
            boxShadow: "0 6px 20px rgba(16, 185, 129, 0.3)",
          }}
        >
          ♟
        </div>
        <h1
          style={{ fontSize: "28px", marginBottom: "12px", color: "var(--text-primary)" }}
        >
          Let&apos;s Get Started
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "32px" }}>
          Welcome, <strong>{username}</strong>. We need to fetch your recent
          games to begin the analysis.
        </p>

        <form
          onSubmit={handleFetch}
          style={{ display: "flex", flexDirection: "column", gap: "20px" }}
        >
          <div>
            <label className="input-label">Platform</label>
            {platformTabs.length > 1 ? (
              <PillTabs tabs={platformTabs} activeTab={platform as "chess.com" | "lichess"} onChange={setPlatform} />
            ) : (
              <span style={{ fontSize: "15px", color: "var(--text-primary)", padding: "8px 0", display: "block" }}>
                {platformTabs[0]?.label ?? "Chess.com"}
              </span>
            )}
          </div>

          <div>
            <label className="input-label" htmlFor="limit">
              Number of Games (Max 50)
            </label>
            <input
              id="limit"
              type="number"
              className="input-field"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min="1"
              max="50"
            />
          </div>

          {status === "error" && (
            <div
              style={{
                color: "var(--danger)",
                fontSize: "14px",
                background: "rgba(239, 68, 68, 0.1)",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "12px", marginTop: "8px" }}
          >
            Fetch Games
          </button>
        </form>
      </div>

      <style jsx>{`
        .onboarding-container {
          min-height: 100vh;
          padding: 24px;
        }
        .onboarding-box {
          width: 100%;
          max-width: 500px;
          padding: 40px;
        }
      `}</style>
    </div>
  );
}
