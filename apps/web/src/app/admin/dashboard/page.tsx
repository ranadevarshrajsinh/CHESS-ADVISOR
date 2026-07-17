"use client";
import { useEffect, useState } from "react";
import CoachHeader from "@/components/CoachHeader";
import Loader from "@/components/Loader";
import { CheckCircle, XCircle, Shield, Search } from "lucide-react";

type Academy = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  created_at: string;
  owner_id: string;
  invite_code?: string | null;
  ownerName?: string;
  ownerEmail?: string;
};

type Coach = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  academy_id: string | null;
  invite_code?: string | null;
  academyName?: string;
  playerCount?: number;
};

type Player = {
  id: string;
  full_name: string;
  email?: string | null;
  chess_username: string;
  status: string;
  created_at: string;
  coach_id: string;
  coachName?: string;
  academyName?: string;
};

const TABS = [
  { key: "pending_academies", label: "Pending Academies" },
  { key: "academies",         label: "All Academies" },
  { key: "coaches",           label: "All Coaches" },
  { key: "players",           label: "All Players" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    approved: { bg: "rgba(16,185,129,0.12)", color: "var(--success)" },
    pending:  { bg: "rgba(245,158,11,0.12)", color: "var(--warning)" },
    rejected: { bg: "rgba(239,68,68,0.1)",  color: "var(--danger)" },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px", background: c.bg, color: c.color, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}


function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.toLowerCase();
  return fields.some((f) => f && f.toLowerCase().includes(q));
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("pending_academies");
  const [pendingAcademies, setPendingAcademies] = useState<Academy[]>([]);
  const [allAcademies, setAllAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setSearchQuery(""); }, [activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data");
      if (!res.ok) throw new Error("Failed to load data");
      const { academies, coaches: coachesData, players: playersData, ownerProfiles } = await res.json();

      const profileMap: Record<string, { full_name: string; email: string }> = {};
      (ownerProfiles ?? []).forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, email: p.email }; });

      const academyNameMap: Record<string, string> = {};
      (academies ?? []).forEach((a: any) => { academyNameMap[a.id] = a.name; });

      const enrichedAcademies: Academy[] = (academies ?? []).map((a: any) => ({
        ...a,
        ownerName:  profileMap[a.owner_id]?.full_name ?? "—",
        ownerEmail: profileMap[a.owner_id]?.email ?? "—",
      }));

      const coachIdMap: Record<string, string> = {};
      (coachesData ?? []).forEach((c: any) => { coachIdMap[c.id] = c.full_name; });

      const enrichedCoaches: Coach[] = (coachesData ?? []).map((c: any) => ({
        ...c,
        academyName: c.academy_id ? (academyNameMap[c.academy_id] ?? "—") : "Independent",
        playerCount: (playersData ?? []).filter((p: any) => p.coach_id === c.id && p.status === "approved").length,
      }));

      const enrichedPlayers: Player[] = (playersData ?? []).map((p: any) => {
        const coach = (coachesData ?? []).find((c: any) => c.id === p.coach_id);
        return {
          ...p,
          coachName:   coach?.full_name ?? "—",
          academyName: coach?.academy_id ? (academyNameMap[coach.academy_id] ?? "—") : "Independent",
        };
      });

      setPendingAcademies(enrichedAcademies.filter((a) => a.status === "pending"));
      setAllAcademies(enrichedAcademies.filter((a) => a.status !== "pending"));
      setCoaches(enrichedCoaches);
      setPlayers(enrichedPlayers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcademyAction(academy: Academy, action: "approved" | "rejected") {
    setActionLoading(academy.id);
    await fetch("/api/admin/data", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ academyId: academy.id, ownerId: academy.owner_id, status: action }),
    });
    setActionLoading(null);
    loadData();
  }

  async function handleRemoveAcademy(academyId: string) {
    if (!confirm("Are you sure you want to remove this academy and all its coaches? This cannot be undone.")) return;
    setActionLoading(academyId);
    try {
      await fetch(`/api/auth/admin/academies/${academyId}`, { method: "DELETE" });
    } catch (e) {
      console.error(e);
      alert("Failed to remove academy.");
    }
    setActionLoading(null);
    loadData();
  }

  async function handleRemoveCoach(coachId: string) {
    if (!confirm("Are you sure you want to remove this coach?")) return;
    setActionLoading(coachId);
    try {
      await fetch(`/api/auth/admin/users/${coachId}`, { method: "DELETE" });
    } catch (e) {
      console.error(e);
      alert("Failed to remove coach.");
    }
    setActionLoading(null);
    loadData();
  }

  async function handleRemovePlayer(playerId: string) {
    if (!confirm("Are you sure you want to remove this player? This cannot be undone.")) return;
    setActionLoading(playerId);
    try {
      await fetch(`/api/auth/admin/players/${playerId}`, { method: "DELETE" });
    } catch (e) {
      console.error(e);
      alert("Failed to remove player.");
    }
    setActionLoading(null);
    loadData();
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 16px", fontSize: "11px", fontWeight: "700",
    textTransform: "uppercase", letterSpacing: "0.5px",
    color: "var(--text-secondary)", textAlign: "left", whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", borderTop: "1px solid var(--border-subtle)" };

  const filteredPending = searchQuery
    ? pendingAcademies.filter((a) => matches(searchQuery, a.name, a.city, a.ownerName, a.ownerEmail))
    : pendingAcademies;

  const filteredAcademies = searchQuery
    ? allAcademies.filter((a) => matches(searchQuery, a.name, a.city, a.ownerName, a.ownerEmail))
    : allAcademies;

  const filteredCoaches = searchQuery
    ? coaches.filter((c) => matches(searchQuery, c.full_name, c.email, c.academyName))
    : coaches;

  const filteredPlayers = searchQuery
    ? players.filter((p) => matches(searchQuery, p.full_name, p.email, p.chess_username, p.coachName, p.academyName))
    : players;

  return (
    <>
      <CoachHeader />
      <div style={{ height: "4px", background: "linear-gradient(90deg, #6366f1, #a78bfa, #6366f1)" }} />
      <main className="container animate-fade-in page-content-mobile" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: "700", margin: 0 }}>Admin Panel</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>Platform-wide oversight</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          {[
            { label: "Pending Academies", value: pendingAcademies.length, color: "var(--warning)" },
            { label: "Total Academies",   value: allAcademies.length,     color: "var(--accent-color)" },
            { label: "Total Coaches",     value: coaches.length,           color: "#818cf8" },
            { label: "Total Players",     value: players.length,           color: "var(--success)" },
          ].map((s) => (
            <div key={s.label} className="glass-card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "28px", fontWeight: "800", color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: "4px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          <div className="glass-card" style={{ display: "inline-flex", gap: "4px", padding: "4px", borderRadius: "12px", flexWrap: "wrap", flexShrink: 0 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "8px 18px", borderRadius: "9px", fontSize: "14px", fontWeight: "600",
                  background: activeTab === t.key ? "rgba(255,255,255,0.9)" : "transparent",
                  color: activeTab === t.key ? "#111" : "var(--text-secondary)",
                  border: "none", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                {t.label}
                {t.key === "pending_academies" && pendingAcademies.length > 0 && (
                  <span style={{ marginLeft: "6px", background: "var(--warning)", color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "11px", fontWeight: "700" }}>
                    {pendingAcademies.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "pending_academies" ? "Search pending academies…" :
                activeTab === "academies"         ? "Search academies…" :
                activeTab === "coaches"           ? "Search coaches…" :
                                                    "Search players…"
              }
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "9px 12px 9px 34px", borderRadius: "9px", fontSize: "13px",
                background: "var(--glass-bg, rgba(255,255,255,0.06))",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                color: "var(--text-primary)", outline: "none",
              }}
            />
          </div>
        </div>

        {loading ? (
          <Loader message="Loading platform data..." />
        ) : (
          <>
            {activeTab === "pending_academies" && (
              <div>
                {filteredPending.length === 0 ? (
                  <div className="glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                    {searchQuery ? `No results for "${searchQuery}"` : "No pending academy requests."}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {filteredPending.map((a) => (
                      <div key={a.id} className="glass-card" style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "16px", marginBottom: "4px" }}>{a.name}{a.city ? ` — ${a.city}` : ""}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Owner: {a.ownerName} ({a.ownerEmail})</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>Requested {new Date(a.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            onClick={() => handleAcademyAction(a, "approved")}
                            disabled={actionLoading === a.id}
                            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 18px", borderRadius: "8px", border: "none", background: "rgba(16,185,129,0.12)", color: "var(--success)", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
                          >
                            <CheckCircle size={15} /> Approve
                          </button>
                          <button
                            onClick={() => handleAcademyAction(a, "rejected")}
                            disabled={actionLoading === a.id}
                            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 18px", borderRadius: "8px", border: "none", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
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

            {activeTab === "academies" && (
              <div>
                {filteredAcademies.length === 0 ? (
                  <div className="glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                    {searchQuery ? `No results for "${searchQuery}"` : "No approved academies yet."}
                  </div>
                ) : (
                  <div className="glass-card" style={{ overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>{["Academy", "City", "Owner", "Owner Email", "Status", "Invite Code", "Joined", "Actions"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {filteredAcademies.map((a) => (
                          <tr key={a.id}>
                            <td style={tdStyle}><strong>{a.name}</strong></td>
                            <td style={tdStyle}>{a.city ?? "—"}</td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{a.ownerName}</td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "12px" }}>{a.ownerEmail ?? "—"}</td>
                            <td style={tdStyle}><StatusBadge status={a.status} /></td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "12px" }}>{a.invite_code ?? "—"}</td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{new Date(a.created_at).toLocaleDateString()}</td>
                            <td style={tdStyle}>
                              <button
                                onClick={() => handleRemoveAcademy(a.id)}
                                disabled={actionLoading === a.id}
                                style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                              >
                                {actionLoading === a.id ? "Removing..." : "Remove"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "coaches" && (
              <div>
                <div className="glass-card" style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Coach", "Email", "Academy", "Players", "Status", "Invite Code", "Joined", "Actions"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredCoaches.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                          {searchQuery ? `No results for "${searchQuery}"` : "No coaches yet."}
                        </td></tr>
                      ) : filteredCoaches.map((c) => (
                        <tr key={c.id}>
                          <td style={tdStyle}><strong>{c.full_name}</strong></td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{c.email}</td>
                          <td style={tdStyle}>{c.academyName}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>{c.playerCount}</td>
                          <td style={tdStyle}><StatusBadge status={c.status} /></td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "12px" }}>{c.invite_code ?? "—"}</td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => handleRemoveCoach(c.id)}
                              disabled={actionLoading === c.id}
                              style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                            >
                              {actionLoading === c.id ? "Removing..." : "Remove"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "players" && (
              <div>
                <div className="glass-card" style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Player", "Email", "Chess Username", "Coach", "Academy", "Status", "Joined", ""].map((h, i) => <th key={i} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                          {searchQuery ? `No results for "${searchQuery}"` : "No players yet."}
                        </td></tr>
                      ) : filteredPlayers.map((p) => (
                        <tr key={p.id}>
                          <td style={tdStyle}><strong>{p.full_name}</strong></td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.email ?? "—"}</td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "monospace" }}>{p.chess_username}</td>
                          <td style={tdStyle}>{p.coachName}</td>
                          <td style={tdStyle}>{p.academyName}</td>
                          <td style={tdStyle}><StatusBadge status={p.status} /></td>
                          <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{new Date(p.created_at).toLocaleDateString()}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <button
                              onClick={() => handleRemovePlayer(p.id)}
                              disabled={actionLoading === p.id}
                              style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                            >
                              {actionLoading === p.id ? "Removing..." : "Remove"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
