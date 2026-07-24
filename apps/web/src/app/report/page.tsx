"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Loader from "@/components/Loader";
import ChartRadar from "@/components/ChartRadar";
import ChartLine from "@/components/ChartLine";
import ChartPie from "@/components/ChartPie";
import ChartBar from "@/components/ChartBar";
import OpeningTable, { OpeningRow } from "@/components/OpeningTable";
import PatternGrid from "@/components/PatternGrid";
import TimeAnalysisCard from "@/components/TimeAnalysisCard";
import ChartTimePerMove from "@/components/ChartTimePerMove";
import GameEndingsCard from "@/components/GameEndingsCard";
import { usePlayer } from "@/contexts/PlayerContext";
import { getReport } from "@/services/api";
import {
  Download,
  RefreshCw,
  BarChart2,
  Zap,
  Clock,
  Calendar,
} from "lucide-react";

const MOVE_QUALITY_COLORS: Record<string, string> = {
  Brilliant: "#6366f1",
  Best: "#10b981",
  Excellent: "#22d3ee",
  Good: "#3b82f6",
  Inaccuracy: "#f59e0b",
  Mistake: "#f97316",
  Blunder: "#ef4444",
  Book: "#6b7280",
  Forced: "#374151",
};

function buildMoveQualityData(dist: Record<string, number> | undefined) {
  if (!dist) return [];
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: MOVE_QUALITY_COLORS[name] || "#888",
    }));
}

function buildOpeningTableRows(
  perfData: any,
  color: "white" | "black",
): OpeningRow[] {
  if (!perfData) return [];
  const entries: OpeningRow[] = [];
  for (const [id, data] of Object.entries(perfData as Record<string, any>)) {
    const byColor = data?.by_color?.[color] || data;
    if (!byColor) continue;
    const name = id.includes(":")
      ? id.split(":").slice(1).join(":").trim()
      : id;
    const eco = id.includes(":") ? id.split(":")[0].trim() : undefined;
    entries.push({
      name,
      eco,
      wins: byColor.wins ?? byColor.win ?? 0,
      losses: byColor.losses ?? byColor.loss ?? 0,
      draws: byColor.draws ?? byColor.draw ?? 0,
      accuracy:
        byColor.avg_accuracy != null
          ? parseFloat(byColor.avg_accuracy)
          : undefined,
      mistake_rate:
        byColor.mistake_rate != null
          ? parseFloat(byColor.mistake_rate)
          : undefined,
    });
  }
  return entries;
}

function buildOpeningTableRowsFlat(perfData: any): OpeningRow[] {
  if (!perfData) return [];
  if (Array.isArray(perfData)) {
    return perfData.map((d: any) => ({
      name: d.opening_name || d.name || d.opening || "Unknown",
      eco: d.eco_code || d.eco,
      wins: d.wins ?? d.win ?? 0,
      losses: d.losses ?? d.loss ?? 0,
      draws: d.draws ?? d.draw ?? 0,
      accuracy: d.avg_accuracy != null ? parseFloat(d.avg_accuracy) : undefined,
      mistake_rate:
        d.mistake_rate != null ? parseFloat(d.mistake_rate) : undefined,
    }));
  }
  return buildOpeningTableRows(perfData, "white");
}

const TC_FILTERS = [
  { value: "all", label: "All Games" },
  { value: "rapid", label: "Rapid" },
  { value: "blitz", label: "Blitz" },
  { value: "bullet", label: "Bullet" },
  { value: "daily", label: "Daily" },
] as const;

type Tab = "overview" | "openings" | "patterns" | "benchmarks";
const TABS: Tab[] = ["overview", "openings", "patterns", "benchmarks"];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  openings: "Openings",
  patterns: "Patterns",
  benchmarks: "Benchmarks",
};

const TC_ICONS: Record<string, React.ReactNode> = {
  bullet: <Zap size={40} style={{ color: "var(--text-secondary)", opacity: 0.4 }} />,
  blitz: <Clock size={40} style={{ color: "var(--text-secondary)", opacity: 0.4 }} />,
  rapid: <Clock size={40} style={{ color: "var(--text-secondary)", opacity: 0.4 }} />,
  daily: <Calendar size={40} style={{ color: "var(--text-secondary)", opacity: 0.4 }} />,
};

const sectionCard: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  padding: "24px",
};

function ReportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [tc, setTc] = useState<string>(() => searchParams.get("tc") || "all");
  const [tab, setTab] = useState<Tab>("overview");

  function handleTcChange(newTc: string) {
    setTc(newTc);
    setTab("overview");
    const params = new URLSearchParams();
    if (newTc !== "all") params.set("tc", newTc);
    router.replace(params.size > 0 ? `/report?${params}` : "/report", {
      scroll: false,
    });
  }

  useEffect(() => {
    if (playerLoading) return;
    if (!chessUsername || !isApproved) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setReportData(null);
    getReport(chessUsername, 50, tc === "all" ? undefined : tc)
      .then(setReportData)
      .catch((e) => {
        console.error(e);
        alert("Failed to load report. Ensure you have run Batch Analysis first.");
      })
      .finally(() => setLoading(false));
  }, [chessUsername, isApproved, playerLoading, router, tc]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/backend/api/report/${chessUsername}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chessUsername}_chess_report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("PDF download failed. The backend may not support this endpoint yet.");
    } finally {
      setPdfLoading(false);
    }
  };

  if (!chessUsername) return null;

  // ─── Tab panel renderers ───────────────────────────────────────────────────

  function renderOverview() {
    const sw = reportData.report?.strengths_weaknesses;
    const actionItems = reportData.report?.top_action_items;
    const phaseData = reportData.visuals?.phase_radar?.labels
      ? reportData.visuals.phase_radar.labels.map(
          (label: string, idx: number) => ({
            subject: label,
            score: reportData.visuals.phase_radar.data[idx] ?? 0,
          }),
        )
      : [];
    const hasPhaseData = phaseData.some((d: any) => d.score > 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* Left: Coach summary + Action items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {sw && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
                  {reportData.report?.title || "Coach's Summary"}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--success)",
                        fontWeight: 600,
                        marginBottom: "10px",
                      }}
                    >
                      Strengths
                    </div>
                    <ul
                      style={{
                        paddingLeft: "16px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.6",
                        fontSize: "14px",
                        margin: 0,
                      }}
                    >
                      {sw.strengths?.length > 0 ? (
                        sw.strengths.map((s: string, i: number) => (
                          <li key={i} style={{ marginBottom: "6px" }}>
                            {s}
                          </li>
                        ))
                      ) : (
                        <li>Identifying strengths…</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--danger)",
                        fontWeight: 600,
                        marginBottom: "10px",
                      }}
                    >
                      Weaknesses
                    </div>
                    <ul
                      style={{
                        paddingLeft: "16px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.6",
                        fontSize: "14px",
                        margin: 0,
                      }}
                    >
                      {sw.weaknesses?.length > 0 ? (
                        sw.weaknesses.map((w: string, i: number) => (
                          <li key={i} style={{ marginBottom: "6px" }}>
                            {w}
                          </li>
                        ))
                      ) : (
                        <li>No major weaknesses detected.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {actionItems?.length > 0 && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
                  Top Action Items
                </h3>
                <ol
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {actionItems.map((item: string, i: number) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: "16px",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Space Grotesk, sans-serif",
                          fontSize: "24px",
                          fontWeight: 700,
                          color: "rgba(29, 193, 137, 0.45)",
                          lineHeight: "1",
                          flexShrink: 0,
                          paddingTop: "3px",
                          minWidth: "28px",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontSize: "14px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.6",
                        }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {reportData.report?.repertoire_snapshot && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>
                  Opening Repertoire
                </h3>
                <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      As White
                    </div>
                    <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {reportData.report.repertoire_snapshot.user_as_white?.length
                        ? reportData.report.repertoire_snapshot.user_as_white.map((o: string, i: number) => (
                            <li key={i} style={{ fontSize: "14px" }}>{o}</li>
                          ))
                        : <li style={{ fontSize: "14px", listStyle: "none" }}>N/A</li>
                      }
                    </ul>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      As Black
                    </div>
                    <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {reportData.report.repertoire_snapshot.user_as_black?.length
                        ? reportData.report.repertoire_snapshot.user_as_black.map((o: string, i: number) => (
                            <li key={i} style={{ fontSize: "14px" }}>{o}</li>
                          ))
                        : <li style={{ fontSize: "14px", listStyle: "none" }}>N/A</li>
                      }
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Phase Radar + Move Quality */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={sectionCard}>
              <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
                Phase Performance
              </h3>
              {hasPhaseData ? (
                <ChartRadar data={phaseData} dataKey="score" />
              ) : (
                <div
                  style={{
                    height: 200,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    color: "var(--text-secondary)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ opacity: 0.4 }}>◎</div>
                  <div style={{ fontSize: "14px" }}>
                    Phase accuracy requires engine analysis.
                  </div>
                  <div style={{ fontSize: "13px", opacity: 0.7 }}>
                    Analyze individual games to populate this chart.
                  </div>
                </div>
              )}
            </div>

            {(reportData.visuals?.mistake_distribution ||
              reportData.move_breakdown) && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
                  Move Quality
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                    alignItems: "center",
                  }}
                >
                  <ChartPie
                    data={buildMoveQualityData(
                      reportData.visuals?.mistake_distribution?.data
                        ? Object.fromEntries(
                            (
                              reportData.visuals.mistake_distribution.labels ||
                              []
                            ).map((l: string, i: number) => [
                              l,
                              reportData.visuals.mistake_distribution.data[i],
                            ]),
                          )
                        : reportData.move_breakdown,
                    )}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {Object.entries(MOVE_QUALITY_COLORS).map(
                      ([quality, color]) => {
                        const val =
                          reportData.move_breakdown?.[quality] ??
                          reportData.move_breakdown?.[quality.toLowerCase()] ??
                          0;
                        if (!val) return null;
                        return (
                          <div
                            key={quality}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "4px 0",
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "13px",
                              }}
                            >
                              <span
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: color,
                                  display: "inline-block",
                                  flexShrink: 0,
                                }}
                              />
                              {quality}
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color,
                                fontSize: "14px",
                              }}
                            >
                              {val}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {(reportData.game_endings || reportData.openings_by_color) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
            {reportData.game_endings && (
              <GameEndingsCard
                wins={reportData.game_endings.wins}
                losses={reportData.game_endings.losses}
              />
            )}

            {reportData.openings_by_color && (
              <div
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "24px",
                }}
              >
                <h3
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: "var(--text-primary)",
                    marginBottom: "4px",
                  }}
                >
                  Openings by color
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                  Win rate per opening, split by the side you played.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                  {(["as_white", "as_black"] as const).map((side) => {
                    const rows = reportData.openings_by_color[side];
                    const totalGames = rows.reduce((s: number, r: any) => s + r.games, 0);
                    return (
                      <div key={side}>
                        <p
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginBottom: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: side === "as_white" ? "rgba(245,245,245,0.7)" : "rgba(120,120,120,0.6)",
                              border: side === "as_white" ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(80,80,80,0.5)",
                              flexShrink: 0,
                            }}
                          />
                          {side === "as_white" ? "As White" : "As Black"}
                          <span style={{ fontWeight: 400 }}>· {totalGames} games</span>
                        </p>
                        {rows.length === 0 ? (
                          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>No data</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {rows.map((row: any) => (
                              <div key={row.opening}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--text-primary)",
                                      fontWeight: 500,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: "65%",
                                    }}
                                  >
                                    {row.opening}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: row.win_rate >= 50 ? "#10b981" : "#ef4444",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {row.win_rate}%
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: "4px",
                                    background: "var(--surface-2)",
                                    borderRadius: "2px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: "100%",
                                      background: row.win_rate >= 50 ? "#10b981" : "#ef4444",
                                      borderRadius: "2px",
                                      transformOrigin: "left",
                                      transform: `scaleX(${row.win_rate / 100})`,
                                      transition: "transform 0.4s ease",
                                    }}
                                  />
                                </div>
                                <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                  {row.games} game{row.games !== 1 ? "s" : ""} · {row.wins}W {row.losses}L {row.draws}D
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {reportData.mistakes_by_phase && (
          <div style={sectionCard}>
            <h3 style={{ fontSize: "16px", marginBottom: "4px" }}>
              Mistakes by Phase
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Where your blunders, mistakes, and inaccuracies actually happen.
            </p>
            <ChartBar
              data={["opening", "middlegame", "endgame"].map((phase) => ({
                phase: phase.charAt(0).toUpperCase() + phase.slice(1),
                blunders:     reportData.mistakes_by_phase[phase]?.blunders ?? 0,
                mistakes:     reportData.mistakes_by_phase[phase]?.mistakes ?? 0,
                inaccuracies: reportData.mistakes_by_phase[phase]?.inaccuracies ?? 0,
              }))}
              xKey="phase"
              bars={[
                { key: "blunders",     color: "var(--danger)",  label: "Blunders" },
                { key: "mistakes",     color: "var(--warning)", label: "Mistakes" },
                { key: "inaccuracies", color: "#eab308",        label: "Inaccuracies" },
              ]}
              height={240}
            />
          </div>
        )}

        {reportData.time_per_move && reportData.time_per_move.length > 0 && (
          <div style={sectionCard}>
            <h3 style={{ fontSize: "16px", marginBottom: "4px" }}>
              Time per move
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Average seconds spent per move number across analyzed games.
            </p>
            <ChartTimePerMove data={reportData.time_per_move} />
          </div>
        )}
      </div>
    );
  }

  function renderOpenings() {
    if (!reportData.openings) {
      return (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "15px" }}>
            No opening data available yet.
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>
            Analyze more games to populate this section.
          </div>
        </div>
      );
    }
    const perf = reportData.openings?.performance;
    const combined = perf?.combined || perf;
    const rows = buildOpeningTableRowsFlat(combined);
    const whiteRows = rows.length === 0 ? buildOpeningTableRows(perf, "white") : [];
    const blackRows = rows.length === 0 ? buildOpeningTableRows(perf, "black") : [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {rows.length > 0 ? (
          <div style={sectionCard}>
            <OpeningTable openings={rows} caption="All Openings" />
          </div>
        ) : (
          <>
            {whiteRows.length > 0 && (
              <div style={sectionCard}>
                <OpeningTable openings={whiteRows} caption="As White" />
              </div>
            )}
            {blackRows.length > 0 && (
              <div style={sectionCard}>
                <OpeningTable openings={blackRows} caption="As Black" />
              </div>
            )}
          </>
        )}

        {reportData.openings?.recommendations?.length > 0 && (
          <div style={sectionCard}>
            <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>
              Recommendations
            </h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {reportData.openings.recommendations.map(
                (rec: any, i: number) => {
                  const dotColor =
                    rec.type === "Strength"
                      ? "var(--success)"
                      : rec.type === "Study"
                        ? "var(--warning)"
                        : "var(--accent-color)";
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "14px 16px",
                        background: "var(--surface-2)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: dotColor,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: dotColor,
                          }}
                        >
                          {rec.type}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "14px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.5",
                        }}
                      >
                        {rec.message}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPatterns() {
    if (
      !reportData.patterns &&
      !reportData.time_analysis &&
      !reportData.mistake_frequency
    ) {
      return (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "15px" }}>
            No pattern data available yet.
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>
            Analyze more games to populate this section.
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {reportData.patterns && (
          <div style={sectionCard}>
            <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
              Pattern Analysis
            </h3>
            <PatternGrid
              tactical={
                reportData.patterns.tactical?.tactical_summary ||
                reportData.patterns.tactical
              }
              positional={
                reportData.patterns.positional?.positional_summary ||
                reportData.patterns.positional
              }
              endgame={
                reportData.patterns.endgame?.endgame_summary ||
                reportData.patterns.endgame
              }
              time_pressure={
                reportData.patterns.time_pressure?.time_pressure_summary ||
                reportData.patterns.time_pressure
              }
            />
            {reportData.patterns.critical_weaknesses?.length > 0 && (
              <div
                style={{
                  marginTop: "20px",
                  paddingTop: "20px",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "10px",
                  }}
                >
                  Critical Weaknesses
                </div>
                <ul
                  style={{
                    paddingLeft: "18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    margin: 0,
                  }}
                >
                  {reportData.patterns.critical_weaknesses.map(
                    (w: string, i: number) => (
                      <li
                        key={i}
                        style={{
                          fontSize: "14px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.5",
                        }}
                      >
                        {w}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {(reportData.time_analysis || reportData.mistake_frequency || reportData.mistakes_by_phase) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
              gap: "24px",
            }}
          >
            {reportData.time_analysis && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>
                  Time Analysis
                </h3>
                <TimeAnalysisCard
                  avg_time_per_move={
                    reportData.time_analysis.average_time_per_move
                  }
                  phase_breakdown={reportData.time_analysis.phase_time_breakdown}
                  time_pressure_risk={reportData.time_analysis.time_pressure_risk}
                  think_move_count={
                    reportData.time_analysis.think_moves?.length ??
                    reportData.time_analysis.think_move_count
                  }
                />
              </div>
            )}

            {reportData.mistake_frequency && (
              <div style={sectionCard}>
                <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>
                  Error Rates (avg per game)
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  {[
                    {
                      label: "Blunders / game",
                      key: "blunders_per_game",
                      color: "var(--danger)",
                    },
                    {
                      label: "Mistakes / game",
                      key: "mistakes_per_game",
                      color: "var(--warning)",
                    },
                    {
                      label: "Inaccuracies / game",
                      key: "inaccuracies_per_game",
                      color: "#f59e0b",
                    },
                    {
                      label: "Errors / 10 moves",
                      key: "errors_per_10_moves",
                      color: "var(--text-secondary)",
                    },
                  ].map(({ label, key, color }) => {
                    const val =
                      reportData.mistake_frequency[key] ??
                      reportData.mistake_frequency?.avg?.[key];
                    if (val == null) return null;
                    return (
                      <div
                        key={key}
                        style={{
                          padding: "14px",
                          background: "var(--surface-2)",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            marginBottom: "4px",
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: "22px",
                            fontWeight: 700,
                            color,
                          }}
                        >
                          {parseFloat(val).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderBenchmarks() {
    if (!reportData.benchmarks) {
      return (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "15px" }}>
            No benchmark data available yet.
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>
            Analyze more games to populate this section.
          </div>
        </div>
      );
    }
    const b = reportData.benchmarks;
    const accuracyVal =
      b.comparison?.accuracy != null
        ? parseFloat(b.comparison.accuracy).toFixed(1)
        : "N/A";
    const cohortAvg =
      b.comparison?.cohort_avg != null
        ? parseFloat(b.comparison.cohort_avg).toFixed(1)
        : "N/A";
    const gap =
      b.comparison?.gap != null ? parseFloat(b.comparison.gap) : null;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          gap: "24px",
        }}
      >
        {/* Stats + chart column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={sectionCard}>
            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Your Cohort
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  textTransform: "capitalize",
                  color: "var(--accent-color)",
                  letterSpacing: "-0.02em",
                  fontFamily: "Space Grotesk, sans-serif",
                }}
              >
                {b.cohort}{" "}
                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "var(--text-secondary)",
                  }}
                >
                  ({b.user_rating} rating)
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  padding: "14px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Your Accuracy
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-color)" }}>
                  {accuracyVal}%
                </div>
              </div>
              <div
                style={{
                  padding: "14px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Cohort Avg
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "rgba(59, 130, 246, 0.85)",
                  }}
                >
                  {cohortAvg}%
                </div>
              </div>
            </div>

            {gap !== null && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <span
                  style={{ fontSize: "14px", color: "var(--text-secondary)" }}
                >
                  Accuracy Gap
                </span>
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: gap >= 0 ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {gap >= 0 ? "+" : ""}
                  {gap.toFixed(1)}%
                </span>
              </div>
            )}

            {b.phase_comparison && (
              <ChartBar
                data={Object.entries(b.phase_comparison).map(
                  ([phase, vals]: [string, any]) => ({
                    phase:
                      phase.charAt(0).toUpperCase() + phase.slice(1),
                    You: parseFloat(vals.user ?? vals.you ?? 0),
                    Cohort: parseFloat(vals.cohort_avg ?? vals.cohort ?? 0),
                  }),
                )}
                xKey="phase"
                bars={[
                  { key: "You", color: "var(--accent-color)", label: "You" },
                  {
                    key: "Cohort",
                    color: "rgba(59,130,246,0.55)",
                    label: "Cohort Avg",
                  },
                ]}
                height={200}
              />
            )}
          </div>
        </div>

        {/* Insight + Percentile column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {b.insight && (
            <div
              style={{
                ...sectionCard,
                background: "var(--surface-2)",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "10px",
                }}
              >
                Coach's Cohort Insight
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "15px",
                  lineHeight: "1.6",
                  color: "var(--text-primary)",
                  fontWeight: 500,
                }}
              >
                {b.insight}
              </p>
            </div>
          )}

          {b.percentile_estimate != null && (
            <div style={sectionCard}>
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: 700,
                  fontFamily: "Space Grotesk, sans-serif",
                  letterSpacing: "-0.02em",
                  color: "var(--accent-color)",
                  marginBottom: "4px",
                }}
              >
                {b.percentile_estimate}%
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>
                Estimated Percentile
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Outperforming {b.percentile_estimate}% of players in your rating
                range.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Derived values ────────────────────────────────────────────────────────
  const period = reportData?.report?.period_summary;
  const momentumColor = period?.current_momentum?.toLowerCase().includes("improv")
    ? "var(--success)"
    : period?.current_momentum?.toLowerCase().match(/declin|drop|worsen|worse/)
    ? "var(--danger)"
    : "var(--text-primary)";

  return (
    <>
      <main
        className="container animate-fade-in"
        style={{ paddingTop: "40px", paddingBottom: "80px" }}
      >
        {/* ── PAGE HERO ─────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "32px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "28px",
                fontFamily: "Space Grotesk, sans-serif",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "6px",
              }}
            >
              Progress Report
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "14px",
                marginBottom: "20px",
              }}
            >
              Comprehensive analysis of your recent games.
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {TC_FILTERS.map(({ value, label }) => {
                const active = tc === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleTcChange(value)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--accent-color)" : "var(--border-subtle)"}`,
                      background: active ? "var(--accent-color)" : "transparent",
                      color: active ? "#fff" : "var(--text-secondary)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {tc !== "all" && (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  marginTop: "10px",
                  marginBottom: 0,
                }}
              >
                Showing {TC_FILTERS.find((f) => f.value === tc)?.label} games
                only. Re-run batch analysis if filter has no effect.
              </p>
            )}
          </div>
          <div className="report-action-btns">
            <Link
              href="/batch"
              style={{
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                background: "var(--surface-1)",
              }}
            >
              <RefreshCw size={14} />
              Re-analyze
            </Link>
            <button
              className="btn btn-primary"
              onClick={handleDownloadPdf}
              disabled={pdfLoading || loading}
              style={{
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Download size={16} />
              {pdfLoading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* ── LOADING ───────────────────────────────────────────────────────── */}
        {loading ? (
          <Loader message="Loading your comprehensive report..." />
        ) : reportData?.tc_no_data ? (
          /* ── TC NO DATA ───────────────────────────────────────────────────── */
          <div
            style={{
              ...sectionCard,
              textAlign: "center",
              padding: "48px 32px",
              maxWidth: "520px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div>
              {TC_ICONS[tc] ?? (
                <Calendar
                  size={40}
                  style={{ color: "var(--text-secondary)", opacity: 0.4 }}
                />
              )}
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
              {reportData.tc_reason === "no_games"
                ? `No ${TC_FILTERS.find((f) => f.value === tc)?.label} games found`
                : `Time control data not available`}
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                lineHeight: "1.6",
                margin: 0,
                maxWidth: "400px",
                fontSize: "14px",
              }}
            >
              {reportData.tc_reason === "no_games"
                ? `Your batch analysis didn't find any ${TC_FILTERS.find((f) => f.value === tc)?.label} games in the analyzed set. Try "All Games" or run a fresh batch analysis.`
                : `Your current batch analysis data was generated before time control filtering was supported. Re-run batch analysis to enable this feature.`}
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                onClick={() => handleTcChange("all")}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                View All Games
              </button>
              <Link
                href={tc && tc !== "all" ? `/batch?tc=${tc}` : "/batch"}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--accent-color)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {tc && tc !== "all"
                  ? `Analyze ${TC_FILTERS.find((f) => f.value === tc)?.label} Games`
                  : "Re-run Batch Analysis"}
              </Link>
            </div>
          </div>
        ) : reportData ? (
          /* ── DATA ─────────────────────────────────────────────────────────── */
          <div style={{ display: "flex", flexDirection: "column" }}>

            {/* STATS STRIP */}
            {period && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  borderTop: "1px solid var(--border-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                  marginBottom: "28px",
                }}
              >
                <div
                  style={{
                    padding: "16px 24px 16px 0",
                    borderRight: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Games Analyzed
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      fontFamily: "Space Grotesk, sans-serif",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {period.games_analyzed}
                  </div>
                </div>
                <div
                  style={{
                    padding: "16px 24px",
                    borderRight: "1px solid var(--border-subtle)",
                    background: "rgba(29, 193, 137, 0.05)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Average Accuracy
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      fontFamily: "Space Grotesk, sans-serif",
                      letterSpacing: "-0.02em",
                      color: "var(--accent-color)",
                    }}
                  >
                    {(() => {
                      const v = parseFloat(period.overall_avg_accuracy);
                      return isNaN(v) || v === 0 ? "—" : `${v.toFixed(1)}%`;
                    })()}
                  </div>
                </div>
                <div style={{ padding: "16px 0 16px 24px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    Momentum
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      fontFamily: "Space Grotesk, sans-serif",
                      letterSpacing: "-0.02em",
                      color: momentumColor,
                    }}
                  >
                    {period.current_momentum || "—"}
                  </div>
                </div>
              </div>
            )}

            {/* ACCURACY OVER TIME */}
            {reportData.visuals?.accuracy_over_time?.labels && (
              <div style={{ ...sectionCard, marginBottom: "28px" }}>
                <h3 style={{ fontSize: "16px", marginBottom: "20px" }}>
                  Accuracy Over Time
                </h3>
                <ChartLine
                  data={reportData.visuals.accuracy_over_time.labels.map(
                    (label: string, idx: number) => ({
                      game: label,
                      accuracy:
                        reportData.visuals.accuracy_over_time.data[idx],
                      opening:
                        reportData.visuals.accuracy_over_time.openings?.[idx],
                      date: reportData.visuals.accuracy_over_time.dates?.[idx],
                    }),
                  )}
                  dataKey="accuracy"
                  xAxisKey="game"
                />
              </div>
            )}

            {/* TAB BAR */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border-subtle)",
                marginBottom: "28px",
                overflowX: "auto",
                scrollbarWidth: "none",
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "11px 20px",
                    background: tab === t ? "rgba(29, 193, 137, 0.08)" : "none",
                    border: "none",
                    borderBottom: `2px solid ${tab === t ? "var(--accent-color)" : "transparent"}`,
                    borderRadius: "6px 6px 0 0",
                    color: tab === t ? "var(--accent-color)" : "var(--text-secondary)",
                    fontFamily: "Inter, sans-serif",
                    fontSize: "14px",
                    fontWeight: tab === t ? 600 : 500,
                    cursor: "pointer",
                    marginBottom: "-1px",
                    transition: "color 0.15s ease, border-color 0.15s ease, background 0.15s ease",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            <div key={tab} className="tab-panel">
              {tab === "overview" && renderOverview()}
              {tab === "openings" && renderOpenings()}
              {tab === "patterns" && renderPatterns()}
              {tab === "benchmarks" && renderBenchmarks()}
            </div>
          </div>
        ) : (
          /* ── NO DATA ──────────────────────────────────────────────────────── */
          <div
            style={{
              ...sectionCard,
              padding: "48px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <BarChart2
              size={40}
              style={{ color: "var(--text-secondary)", opacity: 0.3 }}
            />
            <div style={{ fontSize: "18px", fontWeight: 700 }}>
              No report yet
            </div>
            <p
              style={{
                color: "var(--text-secondary)",
                margin: 0,
                maxWidth: "380px",
                lineHeight: "1.6",
                fontSize: "14px",
              }}
            >
              Run a batch analysis on your games first. Stockfish will analyze
              each game and the full report will appear here.
            </p>
            <Link
              href="/batch"
              style={{
                marginTop: "8px",
                padding: "12px 28px",
                background: "var(--accent-color)",
                color: "#fff",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "15px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Run Batch Analysis
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportPageInner />
    </Suspense>
  );
}
