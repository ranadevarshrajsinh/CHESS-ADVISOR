"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import CoachHeader from "@/components/CoachHeader";
import Loader from "@/components/Loader";
import { getStats } from "@/services/api";
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Gamepad2,
  Swords,
  GraduationCap,
} from "lucide-react";
import { fetchGames } from "@/services/api";

type Player = {
  id: string;
  chess_username: string;
  full_name: string;
  status: string;
  created_at: string;
};

type PlayerStats = {
  accuracy?: number;
  momentum?: string;
  win_rate?: any;
  mistake_frequency?: any;
  time_analysis?: any;
};

type Tab = "players" | "roster" | "games" | "pending";
type SortKey =
  | "full_name"
  | "accuracy"
  | "momentum"
  | "win_rate"
  | "blunders"
  | "time_pressure";

function SortTH({
  label,
  k,
  sortKey,
  sortDesc,
  toggleSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDesc: boolean;
  toggleSort: (key: SortKey) => void;
}) {
  return (
    <th
      onClick={() => toggleSort(k)}
      style={{
        padding: "10px 14px",
        color: sortKey === k ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: "12px",
        textTransform: "uppercase",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
        fontWeight: sortKey === k ? "700" : "500",
        textAlign: "left",
      }}
    >
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        {label}
        {sortKey === k ? (
          sortDesc ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronUp size={12} />
          )
        ) : null}
      </span>
    </th>
  );
}

function accColor(v?: number) {
  if (v == null) return "var(--text-secondary)";
  if (v >= 70) return "var(--success)";
  if (v >= 50) return "var(--warning)";
  return "var(--danger)";
}

function accBg(v?: number) {
  if (v == null) return "var(--surface-1)";
  if (v >= 70) return "rgba(16,185,129,0.08)";
  if (v >= 50) return "rgba(245,158,11,0.08)";
  return "rgba(239,68,68,0.08)";
}

function momentumColor(m?: string) {
  const l = (m || "").toLowerCase();
  if (l.includes("improv")) return "var(--success)";
  if (l.includes("declin")) return "var(--danger)";
  return "var(--warning)";
}

function MomentumChip({ momentum }: { momentum?: string }) {
  if (!momentum)
    return (
      <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
        —
      </span>
    );
  const color = momentumColor(momentum);
  const Icon = momentum.toLowerCase().includes("improv")
    ? TrendingUp
    : momentum.toLowerCase().includes("declin")
      ? TrendingDown
      : Minus;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "700",
        color,
        background: `${color}18`,
        border: `1px solid ${color}33`,
      }}
    >
      <Icon size={11} /> {momentum}
    </span>
  );
}

function winRatePct(wr: any): number | undefined {
  if (!wr) return undefined;
  const pct = wr.overall_win_rate ?? wr.win_rate ?? wr.win_percentage;
  if (pct != null) return parseFloat(pct);
  const w = wr.wins ?? wr.win ?? 0;
  const l = wr.losses ?? wr.loss ?? 0;
  const d = wr.draws ?? wr.draw ?? 0;
  const t = w + l + d;
  return t > 0 ? Math.round((w / t) * 100) : undefined;
}

export default function CoachDashboardPage() {
  const router = useRouter();
  const { coachProfile } = useAuth();
  const [tab, setTab] = useState<Tab>("players");
  const [academyName, setAcademyName] = useState<string | null>(null);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [approvedPlayers, setApprovedPlayers] = useState<Player[]>([]);
  const [pendingPlayers, setPendingPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStats>>(
    {},
  );
  const [statsLoading, setStatsLoading] = useState(false);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Roster sort state
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDesc, setSortDesc] = useState(false);

  // Games tab state
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [gamesPlatform, setGamesPlatform] = useState<"chess.com" | "lichess">(
    "chess.com",
  );
  const [gamesLimit, setGamesLimit] = useState(10);
  const [gamesList, setGamesList] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  const fetchPlayers = async () => {
    if (!coachProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [approvedRes, pendingRes] = await Promise.all([
        supabase
          .from("players")
          .select("*")
          .eq("coach_id", coachProfile.id)
          .eq("status", "approved")
          .order("full_name"),
        supabase
          .from("players")
          .select("*")
          .eq("coach_id", coachProfile.id)
          .eq("status", "pending")
          .order("created_at"),
      ]);
      const approved = approvedRes.data ?? [];
      setApprovedPlayers(approved);
      setPendingPlayers(pendingRes.data ?? []);

      // Fetch stats for all approved players in parallel (non-blocking)
      if (approved.length > 0) {
        setStatsLoading(true);
        const results = await Promise.allSettled(
          approved.map((p) => getStats(p.chess_username)),
        );
        const statsMap: Record<string, PlayerStats> = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled")
            statsMap[approved[i].chess_username] = r.value;
        });
        setPlayerStats(statsMap);
        setStatsLoading(false);
      }
    } catch (err) {
      console.error("Error fetching players:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!coachProfile) {
      // If auth loading is done but no profile, stop dashboard loading
      setLoading(false);
      return;
    }
    fetchPlayers();
    supabase.from("profiles").select("invite_code").eq("id", coachProfile.id).single()
      .then(({ data }) => { if (data) setInviteCode(data.invite_code); });
    if (coachProfile.academy_id) {
      setAcademyLoading(true);
      const fetchAcademy = async () => {
        const { data } = await supabase
          .from("academies")
          .select("name")
          .eq("id", coachProfile.academy_id)
          .single();
        setAcademyName(data?.name ?? null);
        setAcademyLoading(false);
      };
      fetchAcademy();
    }
    const channel = supabase
      .channel("coach-players-realtime")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "players", filter: `coach_id=eq.${coachProfile.id}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setApprovedPlayers((prev) => prev.filter((p) => p.id !== deletedId));
          setPendingPlayers((prev) => prev.filter((p) => p.id !== deletedId));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachProfile]);

  const approvePlayer = async (player: Player) => {
    setActionLoading(player.id);
    const { error } = await supabase
      .from("players")
      .update({ status: "approved" })
      .eq("id", player.id);
    if (!error) {
      setPendingPlayers((prev) => prev.filter((p) => p.id !== player.id));
      setApprovedPlayers((prev) =>
        [...prev, { ...player, status: "approved" }].sort((a, b) =>
          a.full_name.localeCompare(b.full_name),
        ),
      );
      // Fetch stats for the newly approved player
      getStats(player.chess_username)
        .then((s) =>
          setPlayerStats((prev) => ({ ...prev, [player.chess_username]: s })),
        )
        .catch(() => {});
    }
    setActionLoading(null);
  };

  const rejectPlayer = async (player: Player) => {
    setActionLoading(player.id);
    const { error } = await supabase
      .from("players")
      .update({ status: "rejected" })
      .eq("id", player.id);
    if (!error)
      setPendingPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setActionLoading(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  const sortedRoster = [...approvedPlayers].sort((a, b) => {
    const sa = playerStats[a.chess_username];
    const sb = playerStats[b.chess_username];
    let av: any, bv: any;
    switch (sortKey) {
      case "full_name":
        av = a.full_name;
        bv = b.full_name;
        break;
      case "accuracy":
        av = sa?.accuracy ?? -1;
        bv = sb?.accuracy ?? -1;
        break;
      case "momentum":
        av = sa?.momentum ?? "";
        bv = sb?.momentum ?? "";
        break;
      case "win_rate":
        av = winRatePct(sa?.win_rate) ?? -1;
        bv = winRatePct(sb?.win_rate) ?? -1;
        break;
      case "blunders":
        av = sa?.mistake_frequency?.blunders_per_game ?? 99;
        bv = sb?.mistake_frequency?.blunders_per_game ?? 99;
        break;
      case "time_pressure":
        av = sa?.time_analysis?.time_pressure_risk ?? "";
        bv = sb?.time_analysis?.time_pressure_risk ?? "";
        break;
    }
    if (typeof av === "string")
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortDesc ? bv - av : av - bv;
  });

  const handleLoadGames = async () => {
    if (!selectedPlayer) return;
    setGamesLoading(true);
    setGamesLoaded(false);
    try {
      const data = await fetchGames(gamesPlatform, selectedPlayer, gamesLimit);
      setGamesList(Array.isArray(data) ? data : (data.games ?? []));
      setGamesLoaded(true);
    } catch {
      alert(
        "Failed to fetch games. Make sure the backend is running and the player has games on that platform.",
      );
    } finally {
      setGamesLoading(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "players", label: "My Players", icon: <Users size={15} /> },
    { key: "roster", label: "Roster Overview", icon: <BarChart2 size={15} /> },
    { key: "games", label: "Game Analysis", icon: <Gamepad2 size={15} /> },
    {
      key: "pending",
      label: `Pending Requests${pendingPlayers.length ? ` (${pendingPlayers.length})` : ""}`,
      icon: <Clock size={15} />,
    },
  ];

  return (
    <>
      <CoachHeader />
      {/* Indigo identity strip */}
      <div style={{ height: "4px", background: "linear-gradient(90deg, #6366f1, #818cf8, #6366f1)" }} />
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
      >
        {/* Page header */}
        <div className="flex-between" style={{ marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "32px", marginBottom: "4px" }}>
              Coach Dashboard
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "10px" }}>
              Welcome back, {coachProfile?.full_name || coachProfile?.email || ""}
            </p>

            {/* Academy row — always visible */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <GraduationCap size={15} color="#f59e0b" />
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "500" }}>
                Academy:
              </span>
              {academyLoading ? (
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Loading…</span>
              ) : academyName ? (
                <span style={{
                  fontSize: "13px", fontWeight: "700", color: "#f59e0b",
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: "6px", padding: "2px 10px",
                }}>
                  {academyName}
                </span>
              ) : (
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Independent</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: "10px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--success)",
              }}
            >
              <Users size={16} /> {approvedPlayers.length} Players
            </div>
            {pendingPlayers.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--warning)",
                }}
              >
                <Clock size={16} /> {pendingPlayers.length} Pending
              </div>
            )}
          </div>
        </div>

        {/* Invite code card */}
        <div
          className="glass"
          style={{
            padding: "16px 20px",
            borderRadius: "16px",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          <div>
            <p style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
              Your Invite Code
            </p>
            <p style={{ fontSize: "22px", fontWeight: "800", fontFamily: "'Space Grotesk', monospace", letterSpacing: "0.12em", color: "var(--text-primary)" }}>
              {inviteCode ?? "—"}
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Share this with students so they can join your roster
            </p>
          </div>
          <button
            onClick={() => {
              if (!inviteCode) return;
              navigator.clipboard.writeText(inviteCode);
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 2000);
            }}
            disabled={!inviteCode}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#818cf8",
              fontSize: "13px",
              fontWeight: "600",
              cursor: inviteCode ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
              opacity: inviteCode ? 1 : 0.5,
              transition: "all 0.2s ease",
            }}
          >
            {codeCopied ? "Copied!" : "Copy Code"}
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            background: "var(--surface-1)",
            padding: "4px",
            borderRadius: "12px",
            marginBottom: "28px",
            border: "1px solid var(--border-subtle)",
            width: "fit-content",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 20px",
                borderRadius: "9px",
                fontSize: "14px",
                fontWeight: "600",
                background: tab === t.key ? "#6366f1" : "transparent",
                color: tab === t.key ? "#fff" : "var(--text-secondary)",
                transition: "all 0.2s ease",
                border: "none",
                cursor: "pointer",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <Loader message="Loading players..." />
        ) : (
          <>
            {/* ── MY PLAYERS ── */}
            {tab === "players" &&
              (approvedPlayers.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    padding: "48px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    ♟
                  </div>
                  <h3 style={{ marginBottom: "8px" }}>No players yet</h3>
                  <p style={{ fontSize: "14px" }}>
                    Approve players from &quot;Pending Requests&quot; to see them here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
                    gap: "20px",
                  }}
                >
                  {approvedPlayers.map((player) => {
                    const s = playerStats[player.chess_username];
                    const acc =
                      s?.accuracy != null
                        ? parseFloat(String(s.accuracy))
                        : undefined;
                    const wr = winRatePct(s?.win_rate);
                    return (
                      <Link
                        key={player.id}
                        href={`/coach/players/${player.chess_username}`}
                        className="glass-card"
                        style={{ display: "block", textDecoration: "none" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: "700",
                                fontSize: "17px",
                                marginBottom: "4px",
                                color: "var(--text-primary)",
                              }}
                            >
                              {player.full_name}
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "var(--accent-color)",
                                fontWeight: "600",
                              }}
                            >
                              @{player.chess_username}
                            </div>
                          </div>
                          <ChevronRight
                            size={20}
                            color="var(--text-secondary)"
                          />
                        </div>

                        {/* Stats row */}
                        <div
                          style={{
                            marginTop: "14px",
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {statsLoading && !s ? (
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Loading stats…
                            </span>
                          ) : s ? (
                            <>
                              {acc != null && (
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    padding: "3px 10px",
                                    borderRadius: "8px",
                                    background: accBg(acc),
                                    color: accColor(acc),
                                    border: `1px solid ${accColor(acc)}33`,
                                  }}
                                >
                                  {acc.toFixed(1)}% accuracy
                                </span>
                              )}
                              {wr != null && (
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "600",
                                    padding: "3px 10px",
                                    borderRadius: "8px",
                                    background: "var(--surface-1)",
                                    color: "var(--text-secondary)",
                                    border: "1px solid var(--border-subtle)",
                                  }}
                                >
                                  {wr}% wins
                                </span>
                              )}
                              <MomentumChip momentum={s.momentum} />
                            </>
                          ) : (
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                padding: "3px 10px",
                                borderRadius: "8px",
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              No analysis yet
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: "12px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: "rgba(16,185,129,0.1)",
                            border: "1px solid rgba(16,185,129,0.2)",
                            borderRadius: "8px",
                            padding: "4px 10px",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "var(--success)",
                          }}
                        >
                          <CheckCircle size={12} /> Approved
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}

            {/* ── ROSTER OVERVIEW ── */}
            {tab === "roster" &&
              (approvedPlayers.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    padding: "48px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    📊
                  </div>
                  <h3 style={{ marginBottom: "8px" }}>No players to compare</h3>
                  <p style={{ fontSize: "14px" }}>
                    Approve players to see their metrics here.
                  </p>
                </div>
              ) : (
                <div
                  className="glass-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <div
                    style={{
                      padding: "20px 24px",
                      borderBottom: "1px solid var(--glass-border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <h3 style={{ fontSize: "18px", margin: 0 }}>
                      All Students — Side-by-Side Metrics
                    </h3>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Click a column header to sort · Click a row to view player
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "14px",
                      }}
                    >
                      <thead style={{ background: "var(--surface-1)" }}>
                        <tr>
                          <SortTH label="Player" k="full_name" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                          <SortTH label="Avg Accuracy" k="accuracy" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                          <SortTH label="Momentum" k="momentum" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                          <SortTH label="Win Rate" k="win_rate" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                          <SortTH label="Blunders / Game" k="blunders" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                          <SortTH label="Time Pressure" k="time_pressure" sortKey={sortKey} sortDesc={sortDesc} toggleSort={toggleSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRoster.map((player, i) => {
                          const s = playerStats[player.chess_username];
                          const acc =
                            s?.accuracy != null
                              ? parseFloat(String(s.accuracy))
                              : undefined;
                          const wr = winRatePct(s?.win_rate);
                          const blunders =
                            s?.mistake_frequency?.blunders_per_game;
                          const timePressure =
                            s?.time_analysis?.time_pressure_risk;
                          const tpColor =
                            timePressure === "High"
                              ? "var(--danger)"
                              : timePressure === "Moderate"
                                ? "var(--warning)"
                                : timePressure === "Low"
                                  ? "var(--success)"
                                  : "var(--text-secondary)";
                          return (
                            <tr
                              key={player.id}
                              onClick={() =>
                                router.push(
                                  `/coach/players/${player.chess_username}`,
                                )
                              }
                              style={{
                                borderBottom: "1px solid var(--glass-border)",
                                cursor: "pointer",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) =>
                                ((
                                  e.currentTarget as HTMLTableRowElement
                                ).style.background = "var(--surface-1)")
                              }
                              onMouseLeave={(e) =>
                                ((
                                  e.currentTarget as HTMLTableRowElement
                                ).style.background = "transparent")
                              }
                            >
                              <td style={{ padding: "14px 14px" }}>
                                <div style={{ fontWeight: "700" }}>
                                  {player.full_name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--accent-color)",
                                    fontWeight: "600",
                                  }}
                                >
                                  @{player.chess_username}
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "14px",
                                  fontWeight: "700",
                                  color: accColor(acc),
                                }}
                              >
                                {statsLoading && !s ? (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    …
                                  </span>
                                ) : acc != null ? (
                                  `${acc.toFixed(1)}%`
                                ) : (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "14px" }}>
                                {s ? (
                                  <MomentumChip momentum={s.momentum} />
                                ) : (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                              <td
                                style={{ padding: "14px", fontWeight: "600" }}
                              >
                                {wr != null ? (
                                  `${wr}%`
                                ) : (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "14px",
                                  fontWeight: "600",
                                  color:
                                    blunders != null && blunders > 1
                                      ? "var(--danger)"
                                      : "var(--text-primary)",
                                }}
                              >
                                {blunders != null ? (
                                  parseFloat(blunders).toFixed(2)
                                ) : (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "14px",
                                  fontWeight: "600",
                                  color: tpColor,
                                }}
                              >
                                {timePressure || (
                                  <span
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

            {/* ── GAME ANALYSIS ── */}
            {tab === "games" &&
              (approvedPlayers.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    padding: "48px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    ♟
                  </div>
                  <h3 style={{ marginBottom: "8px" }}>No players yet</h3>
                  <p style={{ fontSize: "14px" }}>
                    Approve players to load and analyze their games.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  }}
                >
                  {/* Controls card */}
                  <div
                    className="glass-card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                    }}
                  >
                    <h3 style={{ fontSize: "17px", margin: 0 }}>
                      Load Player Games
                    </h3>

                    {/* Player selector */}
                    <div>
                      <label
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          display: "block",
                          marginBottom: "8px",
                        }}
                      >
                        Student
                      </label>
                      <select
                        value={selectedPlayer}
                        onChange={(e) => {
                          setSelectedPlayer(e.target.value);
                          setGamesLoaded(false);
                          setGamesList([]);
                        }}
                        style={{
                          width: "100%",
                          maxWidth: "320px",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                          fontSize: "14px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">— Select a player —</option>
                        {approvedPlayers.map((p) => (
                          <option key={p.id} value={p.chess_username}>
                            {p.full_name} (@{p.chess_username})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "32px",
                        flexWrap: "wrap",
                        alignItems: "flex-end",
                      }}
                    >
                      {/* Platform */}
                      <div>
                        <label
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Platform
                        </label>
                        <div
                          style={{
                            display: "flex",
                            gap: "4px",
                            background: "var(--surface-2)",
                            padding: "4px",
                            borderRadius: "10px",
                          }}
                        >
                          {(["chess.com", "lichess"] as const).map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                setGamesPlatform(p);
                                setGamesLoaded(false);
                                setGamesList([]);
                              }}
                              style={{
                                padding: "7px 16px",
                                borderRadius: "7px",
                                fontSize: "13px",
                                fontWeight: "600",
                                border: "none",
                                cursor: "pointer",
                                background:
                                  gamesPlatform === p
                                    ? "#6366f1"
                                    : "transparent",
                                color:
                                  gamesPlatform === p
                                    ? "#fff"
                                    : "var(--text-secondary)",
                                transition: "all 0.15s",
                              }}
                            >
                              {p === "chess.com" ? "Chess.com" : "Lichess"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Limit */}
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <label
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Games to load:{" "}
                          <span style={{ color: "#6366f1" }}>{gamesLimit}</span>
                        </label>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <input
                            type="range"
                            min={1}
                            max={50}
                            value={gamesLimit}
                            onChange={(e) =>
                              setGamesLimit(Number(e.target.value))
                            }
                            style={{ flex: 1, accentColor: "#6366f1" }}
                          />
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={gamesLimit}
                            onChange={(e) =>
                              setGamesLimit(
                                Math.min(
                                  50,
                                  Math.max(1, Number(e.target.value)),
                                ),
                              )
                            }
                            style={{
                              width: "56px",
                              padding: "6px 8px",
                              borderRadius: "8px",
                              background: "var(--surface-1)",
                              border: "1px solid var(--border-subtle)",
                              color: "var(--text-primary)",
                              fontSize: "14px",
                              textAlign: "center",
                            }}
                          />
                        </div>
                      </div>

                      {/* Load button */}
                      <button
                        onClick={handleLoadGames}
                        disabled={!selectedPlayer || gamesLoading}
                        style={{
                          padding: "10px 24px",
                          borderRadius: "10px",
                          fontSize: "14px",
                          fontWeight: "700",
                          background:
                            !selectedPlayer || gamesLoading
                              ? "var(--surface-1)"
                              : "#6366f1",
                          color:
                            !selectedPlayer || gamesLoading
                              ? "var(--text-secondary)"
                              : "#fff",
                          border: "none",
                          cursor:
                            !selectedPlayer || gamesLoading
                              ? "not-allowed"
                              : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 0.2s",
                        }}
                      >
                        <Play size={16} fill="currentColor" />
                        {gamesLoading ? "Loading…" : "Load Games"}
                      </button>
                    </div>
                  </div>

                  {/* Games list */}
                  {gamesLoading && (
                    <div
                      className="glass"
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Fetching games from {gamesPlatform}…
                    </div>
                  )}

                  {gamesLoaded && gamesList.length === 0 && (
                    <div
                      className="glass"
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No games found for @{selectedPlayer} on {gamesPlatform}.
                    </div>
                  )}

                  {gamesLoaded && gamesList.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
                        gap: "16px",
                      }}
                    >
                      {gamesList.map((game: any, idx: number) => {
                        const result = game.result || "";
                        const playerWon =
                          (game.white === selectedPlayer && result === "1-0") ||
                          (game.black === selectedPlayer && result === "0-1");
                        const playerLost =
                          (game.white === selectedPlayer && result === "0-1") ||
                          (game.black === selectedPlayer && result === "1-0");
                        const resultColor = playerWon
                          ? "var(--success)"
                          : playerLost
                            ? "var(--danger)"
                            : "var(--warning)";
                        const resultLabel = playerWon
                          ? "Win"
                          : playerLost
                            ? "Loss"
                            : result === "½-½"
                              ? "Draw"
                              : result;
                        return (
                          <div
                            key={idx}
                            className="glass-card"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            {/* Header */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  background:
                                    gamesPlatform === "chess.com"
                                      ? "rgba(99,102,241,0.12)"
                                      : "rgba(29,193,137,0.12)",
                                  color:
                                    gamesPlatform === "chess.com"
                                      ? "#6366f1"
                                      : "var(--accent-color)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                }}
                              >
                                {gamesPlatform === "chess.com"
                                  ? "Chess.com"
                                  : "Lichess"}
                              </span>
                              {game.date && (
                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {game.date}
                                </span>
                              )}
                            </div>
                            {/* Players */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span style={{ fontSize: "18px" }}>♙</span>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    fontSize: "14px",
                                    color:
                                      game.white === selectedPlayer
                                        ? "#6366f1"
                                        : "var(--text-primary)",
                                  }}
                                >
                                  {game.white}
                                </span>
                              </div>
                              <Swords
                                size={14}
                                color="var(--text-secondary)"
                                style={{ flexShrink: 0 }}
                              />
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "600",
                                    fontSize: "14px",
                                    color:
                                      game.black === selectedPlayer
                                        ? "#6366f1"
                                        : "var(--text-primary)",
                                    textAlign: "right",
                                  }}
                                >
                                  {game.black}
                                </span>
                                <span style={{ fontSize: "18px" }}>♟</span>
                              </div>
                            </div>
                            {/* Footer */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                paddingTop: "8px",
                                borderTop: "1px solid var(--glass-border)",
                              }}
                            >
                              <span style={{ fontSize: "13px" }}>
                                Result:{" "}
                                <span
                                  style={{
                                    fontWeight: "700",
                                    color: resultColor,
                                  }}
                                >
                                  {resultLabel}
                                </span>
                              </span>
                              {game.filename && (
                                <a
                                  href={`/coach/players/${selectedPlayer}/analysis/${encodeURIComponent(game.filename)}`}
                                  style={{
                                    padding: "6px 14px",
                                    borderRadius: "8px",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    background: "#6366f1",
                                    color: "#fff",
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <Play size={11} fill="currentColor" /> Analyze
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

            {/* ── PENDING REQUESTS ── */}
            {tab === "pending" &&
              (pendingPlayers.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    padding: "48px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    ✓
                  </div>
                  <h3 style={{ marginBottom: "8px" }}>No pending requests</h3>
                  <p style={{ fontSize: "14px" }}>
                    All player requests have been reviewed.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {pendingPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="glass-card"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: "700",
                            fontSize: "16px",
                            marginBottom: "4px",
                          }}
                        >
                          {player.full_name}
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--accent-color)",
                            fontWeight: "600",
                          }}
                        >
                          @{player.chess_username}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            marginTop: "4px",
                          }}
                        >
                          Requested{" "}
                          {new Date(player.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          onClick={() => approvePlayer(player)}
                          disabled={actionLoading === player.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 18px",
                            borderRadius: "10px",
                            fontSize: "14px",
                            fontWeight: "600",
                            background: "rgba(16,185,129,0.1)",
                            border: "1px solid rgba(16,185,129,0.25)",
                            color: "var(--success)",
                            cursor:
                              actionLoading === player.id
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          <CheckCircle size={15} />{" "}
                          {actionLoading === player.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => rejectPlayer(player)}
                          disabled={actionLoading === player.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 18px",
                            borderRadius: "10px",
                            fontSize: "14px",
                            fontWeight: "600",
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.2)",
                            color: "var(--danger)",
                            cursor:
                              actionLoading === player.id
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          <XCircle size={15} />{" "}
                          {actionLoading === player.id ? "…" : "Reject"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </>
        )}
      </main>
    </>
  );
}
