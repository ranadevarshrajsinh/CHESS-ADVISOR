"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CoachHeader from "@/components/CoachHeader";
import Loader from "@/components/Loader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { CheckCircle, XCircle, ChevronDown, ChevronRight, Users, BookOpen, Clock } from "lucide-react";

type Coach = {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  status: string;
  players?: Player[];
  expanded?: boolean;
};

type Player = {
  id: string;
  full_name: string;
  chess_username: string;
  status: string;
  created_at: string;
};

type Academy = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
};

const TABS = [
  { key: "pending", label: "Pending Coaches" },
  { key: "coaches", label: "My Coaches" },
  { key: "overview", label: "Academy Overview" },
];

export default function AcademyDashboard() {
  const router = useRouter();
  const { coachProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingCoaches, setPendingCoaches] = useState<Coach[]>([]);
  const [approvedCoaches, setApprovedCoaches] = useState<Coach[]>([]);
  const [academy, setAcademy] = useState<Academy | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [removePlayerLoading, setRemovePlayerLoading] = useState<string | null>(null);

  const academyId = coachProfile?.academy_id;

  useEffect(() => {
    if (!academyId) return;
    loadData();
  }, [academyId]);

  async function loadData() {
    setLoading(true);

    const [{ data: acData }, { data: allCoaches }] = await Promise.all([
      supabase.from("academies").select("*").eq("id", academyId).single(),
      supabase.from("profiles").select("id, full_name, email, created_at, status").eq("academy_id", academyId).eq("role", "coach").order("created_at"),
    ]);

    setAcademy(acData ?? null);
    const pending = (allCoaches ?? []).filter((c) => c.status === "pending");
    const approved = (allCoaches ?? []).filter((c) => c.status === "approved");
    setPendingCoaches(pending);
    setApprovedCoaches(approved.map((c) => ({ ...c, players: [], expanded: false })));

    setLoading(false);
  }

  async function handleApprove(coachId: string) {
    setActionLoading(coachId);
    await supabase.from("profiles").update({ status: "approved" }).eq("id", coachId);
    setActionLoading(null);
    loadData();
  }

  async function handleReject(coachId: string) {
    setActionLoading(coachId);
    await supabase.from("profiles").update({ status: "rejected" }).eq("id", coachId);
    setActionLoading(null);
    loadData();
  }

  async function handleRemoveCoach(coachId: string) {
    if (!confirm("Are you sure you want to remove this coach?")) return;
    setActionLoading(coachId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/auth/academy/coaches/${coachId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
    } catch (e) {
      console.error(e);
      alert("Failed to remove coach.");
    }
    setActionLoading(null);
    loadData();
  }

  async function handleRemovePlayer(playerId: string, coachId: string) {
    if (!confirm("Are you sure you want to remove this student?")) return;
    setRemovePlayerLoading(playerId);
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) {
      alert("Failed to remove student.");
    } else {
      setApprovedCoaches((prev) =>
        prev.map((c) =>
          c.id === coachId
            ? { ...c, players: (c.players ?? []).filter((p) => p.id !== playerId) }
            : c
        )
      );
    }
    setRemovePlayerLoading(null);
  }

  async function toggleCoachExpand(coachId: string) {
    setApprovedCoaches((prev) =>
      prev.map((c) => {
        if (c.id !== coachId) return c;
        if (c.expanded) return { ...c, expanded: false };
        return { ...c, expanded: true };
      })
    );

    const coach = approvedCoaches.find((c) => c.id === coachId);
    if (!coach?.expanded && (!coach?.players || coach.players.length === 0)) {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, chess_username, status, created_at")
        .eq("coach_id", coachId)
        .order("created_at");
      setApprovedCoaches((prev) =>
        prev.map((c) => c.id === coachId ? { ...c, players: data ?? [], expanded: true } : c)
      );
    }
  }

  const totalPlayers = approvedCoaches.reduce((sum, c) => sum + (c.players?.filter(p => p.status === "approved").length ?? 0), 0);

  return (
    <>
      <CoachHeader />
      {/* Amber identity strip */}
      <div style={{ height: "4px", background: "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)" }} />
      <main className="container animate-fade-in" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "32px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #f59e0b, #fbbf24)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", flexShrink: 0, boxShadow: "0 4px 14px rgba(245,158,11,0.3)" }}>
            🏫
          </div>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "2px" }}>Academy Dashboard</h1>
            {academy && (
              <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0 }}>
                {academy.name}{academy.city ? ` · ${academy.city}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[
            { label: "Approved Coaches", value: approvedCoaches.length, icon: <Users size={18} />, color: "var(--accent-color)" },
            { label: "Pending Approval", value: pendingCoaches.length, icon: <Clock size={18} />, color: "var(--warning)" },
            { label: "Total Players", value: totalPlayers, icon: <BookOpen size={18} />, color: "var(--success)" },
          ].map((s) => (
            <div key={s.label} className="glass-card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: s.color, marginBottom: "8px" }}>
                {s.icon}
                <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div
          className="glass-card"
          style={{ display: "inline-flex", gap: "4px", padding: "4px", borderRadius: "12px", marginBottom: "24px", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "8px 20px",
                borderRadius: "9px",
                fontSize: "14px",
                fontWeight: "600",
                background: activeTab === t.key ? "#f59e0b" : "transparent",
                color: activeTab === t.key ? "#fff" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {t.label}
              {t.key === "pending" && pendingCoaches.length > 0 && (
                <span
                  style={{
                    marginLeft: "6px",
                    background: "var(--warning)",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "1px 6px",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                >
                  {pendingCoaches.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <Loader message="Loading academy data..." />
        ) : (
          <>
            {/* ── Pending Coaches ── */}
            {activeTab === "pending" && (
              <div>
                {pendingCoaches.length === 0 ? (
                  <div className="glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                    No pending coach requests.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {pendingCoaches.map((coach) => (
                      <div key={coach.id} className="glass-card" style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "16px", marginBottom: "4px" }}>{coach.full_name}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{coach.email}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>
                            Requested {new Date(coach.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            onClick={() => handleApprove(coach.id)}
                            disabled={actionLoading === coach.id}
                            style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              padding: "9px 18px", borderRadius: "8px", border: "none",
                              background: "rgba(16,185,129,0.12)", color: "var(--success)",
                              fontWeight: "700", fontSize: "13px", cursor: "pointer",
                            }}
                          >
                            <CheckCircle size={15} /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(coach.id)}
                            disabled={actionLoading === coach.id}
                            style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              padding: "9px 18px", borderRadius: "8px", border: "none",
                              background: "rgba(239,68,68,0.1)", color: "var(--danger)",
                              fontWeight: "700", fontSize: "13px", cursor: "pointer",
                            }}
                          >
                            <XCircle size={15} /> Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── My Coaches ── */}
            {activeTab === "coaches" && (
              <div>
                {approvedCoaches.length === 0 ? (
                  <div className="glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                    No approved coaches yet. Approve coaches from the Pending tab.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {approvedCoaches.map((coach) => (
                      <div key={coach.id} className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
                        <button
                          onClick={() => toggleCoachExpand(coach.id)}
                          style={{
                            width: "100%", padding: "20px 24px", display: "flex", justifyContent: "space-between",
                            alignItems: "center", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                width: "38px", height: "38px", borderRadius: "8px",
                                background: "linear-gradient(135deg,#6366f1,#818cf8)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#fff", fontWeight: "700", fontSize: "16px",
                              }}
                            >
                              {coach.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: "700", fontSize: "15px" }}>{coach.full_name}</div>
                              <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{coach.email}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                              {coach.players?.filter(p => p.status === "approved").length ?? "—"} players
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCoach(coach.id);
                              }}
                              disabled={actionLoading === coach.id}
                              style={{
                                background: "rgba(239,68,68,0.1)",
                                color: "var(--danger)",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: "bold",
                              }}
                            >
                              {actionLoading === coach.id ? "Removing..." : "Remove"}
                            </button>
                            {coach.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </button>

                        {coach.expanded && (
                          <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "16px 24px", background: "var(--surface-1)" }}>
                            {!coach.players || coach.players.length === 0 ? (
                              <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>No players under this coach.</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {coach.players.map((p) => (
                                  <div
                                    key={p.id}
                                    style={{
                                      display: "flex", justifyContent: "space-between", alignItems: "center",
                                      padding: "10px 14px", borderRadius: "8px", background: "var(--surface-2)",
                                    }}
                                  >
                                    <div>
                                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{p.full_name}</span>
                                      <span style={{ color: "var(--text-secondary)", fontSize: "12px", marginLeft: "8px" }}>@{p.chess_username}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                      <span
                                        style={{
                                          fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px",
                                          background: p.status === "approved" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                                          color: p.status === "approved" ? "var(--success)" : "var(--warning)",
                                        }}
                                      >
                                        {p.status}
                                      </span>
                                      <button
                                        onClick={() => handleRemovePlayer(p.id, coach.id)}
                                        disabled={removePlayerLoading === p.id}
                                        style={{
                                          background: "rgba(239,68,68,0.1)",
                                          color: "var(--danger)",
                                          border: "none",
                                          padding: "5px 10px",
                                          borderRadius: "6px",
                                          cursor: removePlayerLoading === p.id ? "not-allowed" : "pointer",
                                          fontSize: "12px",
                                          fontWeight: "700",
                                          opacity: removePlayerLoading === p.id ? 0.6 : 1,
                                        }}
                                      >
                                        {removePlayerLoading === p.id ? "Removing…" : "Remove"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Academy Overview ── */}
            {activeTab === "overview" && academy && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className="glass-card" style={{ padding: "24px" }}>
                  <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>{academy.name}</h2>
                  {academy.city && (
                    <p style={{ color: "var(--text-secondary)", marginBottom: "8px" }}>📍 {academy.city}</p>
                  )}
                  {academy.description && (
                    <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>{academy.description}</p>
                  )}
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}
                >
                  <div className="glass-card" style={{ padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--accent-color)" }}>{approvedCoaches.length}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "4px" }}>Active Coaches</div>
                  </div>
                  <div className="glass-card" style={{ padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--warning)" }}>{pendingCoaches.length}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "4px" }}>Pending Coaches</div>
                  </div>
                  <div className="glass-card" style={{ padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--success)" }}>{totalPlayers}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "4px" }}>Total Players</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
