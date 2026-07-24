"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { Loader2 } from "lucide-react";

export default function PendingPage() {
  const router = useRouter();
  const { chessUsername, lichessUsername, activeUsername, fullName, coachId, status, loading, refreshSession, logout } = usePlayer();
  const [coachName, setCoachName] = useState("");
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!activeUsername) { router.push("/login"); return; }
    if (status === "approved") { router.push("/dashboard"); return; }

    if (coachId) {
      fetch(`/api/coaches/by-id?id=${coachId}`)
        .then((r) => r.json())
        .then((d) => { if (d.coachName) setCoachName(d.coachName); })
        .catch(() => {});
    }
  }, [loading, activeUsername, status, coachId, router]);

  const checkStatus = async () => {
    setChecking(true);
    setStatusMsg("");
    await refreshSession();
    setChecking(false);

    if (status === "approved") {
      router.push("/dashboard");
    } else if (status === "rejected") {
      setStatusMsg("Your registration was rejected by your coach.");
    } else {
      setStatusMsg("Still pending — your coach hasn't approved you yet.");
    }
  };

  if (loading || !activeUsername) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "radial-gradient(circle at 50% 40%, rgba(245, 158, 11, 0.08) 0%, transparent 65%)",
      }}
    >
      <div
        className="glass animate-fade-in"
        style={{ width: "100%", maxWidth: "460px", padding: "48px 36px", textAlign: "center" }}
      >
        <div style={{ fontSize: "56px", marginBottom: "20px" }}>⏳</div>

        <h1 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "12px", color: "var(--text-primary)" }}>
          Waiting for Approval
        </h1>

        <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", marginBottom: "8px" }}>
          Hi <strong style={{ color: "var(--text-primary)" }}>{fullName}</strong>, your account is pending approval.
        </p>

        {coachName && (
          <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", marginBottom: "28px" }}>
            Waiting on <strong style={{ color: "var(--accent-color)" }}>{coachName}</strong> to review your request.
          </p>
        )}

        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "28px" }}>
          {chessUsername && (
            <p style={{ fontSize: "13px", color: "var(--warning)", fontWeight: "600" }}>
              Chess.com username: <code style={{ fontFamily: "monospace" }}>{chessUsername}</code>
            </p>
          )}
          {lichessUsername && (
            <p style={{ fontSize: "13px", color: "var(--warning)", fontWeight: "600", marginTop: chessUsername ? "6px" : 0 }}>
              Lichess username: <code style={{ fontFamily: "monospace" }}>{lichessUsername}</code>
            </p>
          )}
        </div>

        {statusMsg && (
          <div style={{ color: statusMsg.includes("rejected") ? "var(--danger)" : "var(--text-secondary)", fontSize: "13px", background: "var(--surface-1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border-subtle)", marginBottom: "20px" }}>
            {statusMsg}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            className="btn btn-primary"
            style={{ padding: "12px", fontSize: "15px" }}
            onClick={checkStatus}
            disabled={checking}
          >
            {checking ? "Checking..." : "🔄 Check Approval Status"}
          </button>
          <button className="btn btn-secondary" style={{ padding: "12px", fontSize: "14px" }} onClick={logout}>
            Cancel & Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
