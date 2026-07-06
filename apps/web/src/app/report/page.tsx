"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Loader from "@/components/Loader";
import ChartRadar from "@/components/ChartRadar";
import ChartLine from "@/components/ChartLine";
import ChartPie from "@/components/ChartPie";
import ChartBar from "@/components/ChartBar";
import OpeningTable, { OpeningRow } from "@/components/OpeningTable";
import PatternGrid from "@/components/PatternGrid";
import TimeAnalysisCard from "@/components/TimeAnalysisCard";
import { usePlayer } from "@/contexts/PlayerContext";
import { getReport } from "@/services/api";
import { Download, RefreshCw } from "lucide-react";

const MOVE_QUALITY_COLORS: Record<string, string> = {
  Brilliant: "#6366f1",
  Best: "#10b981",
  Excellent: "#22d3ee",
  Good: "#3b82f6",
  Inaccuracy: "#f59e0b",
  Mistake: "#f97316",
  Blunder: "#ef4444",
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
  { value: "all",    label: "All Games" },
  { value: "rapid",  label: "Rapid" },
  { value: "blitz",  label: "Blitz" },
  { value: "bullet", label: "Bullet" },
  { value: "daily",  label: "Daily" },
] as const;

function ReportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { chessUsername, isApproved, loading: playerLoading } = usePlayer();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [tc, setTc] = useState<string>(() => searchParams.get("tc") || "all");

  function handleTcChange(newTc: string) {
    setTc(newTc);
    const params = new URLSearchParams();
    if (newTc !== "all") params.set("tc", newTc);
    router.replace(params.size > 0 ? `/report?${params}` : "/report", { scroll: false });
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
      const res = await fetch(
        `/api/backend/api/report/${chessUsername}/pdf`,
      );
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
      alert(
        "PDF download failed. The backend may not support this endpoint yet.",
      );
    } finally {
      setPdfLoading(false);
    }
  };

  if (!chessUsername) return null;

  return (
    <>
      <Header />
      <main
        className="container animate-fade-in page-content-mobile"
        style={{ paddingTop: "40px", paddingBottom: "60px" }}
      >
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
            <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>
              Progress Report
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>
              Comprehensive analysis of your recent games.
            </p>
            {/* Time control filter chips */}
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
                      fontWeight: active ? "700" : "500",
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--accent-color)" : "var(--glass-border)"}`,
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
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "10px", marginBottom: 0 }}>
                Showing {TC_FILTERS.find(f => f.value === tc)?.label} games only.
                Re-run batch analysis if filter has no effect (time control data requires a fresh run).
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/batch"
              style={{
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                color: "var(--text-secondary)",
                border: "1px solid var(--glass-border)",
                borderRadius: "8px",
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
              {pdfLoading ? "Generating…" : "Download PDF Report"}
            </button>
          </div>
        </div>

        {loading ? (
          <Loader message="Loading your comprehensive report..." />
        ) : reportData?.tc_no_data ? (
          /* ── TIME CONTROL FILTER: NO DATA ── */
          <div className="glass-card" style={{ textAlign: "center", padding: "48px 32px", maxWidth: "520px", margin: "0 auto" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>
              {tc === "bullet" ? "⚡" : tc === "blitz" ? "⏱" : tc === "rapid" ? "🕐" : "📅"}
            </div>
            <h2 style={{ marginBottom: "12px", fontSize: "22px" }}>
              {reportData.tc_reason === "no_games"
                ? `No ${TC_FILTERS.find(f => f.value === tc)?.label} games found`
                : `Time control data not available`}
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "24px", lineHeight: "1.6" }}>
              {reportData.tc_reason === "no_games"
                ? `Your batch analysis didn't find any ${TC_FILTERS.find(f => f.value === tc)?.label} games in the analyzed set. Try "All Games" or run a fresh batch analysis to update the data.`
                : `Your current batch analysis data was generated before time control filtering was supported. Re-run batch analysis to enable this feature.`}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => handleTcChange("all")}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid var(--glass-border)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                View All Games
              </button>
              <Link
                href={tc && tc !== "all" ? `/batch?tc=${tc}` : "/batch"}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  background: "var(--accent-color)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                {tc && tc !== "all"
                  ? `Analyze ${TC_FILTERS.find(f => f.value === tc)?.label} Games`
                  : "Re-run Batch Analysis"}
              </Link>
            </div>
          </div>
        ) : reportData ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "32px" }}
          >
            {/* ── CHARTS ROW ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))",
                gap: "24px",
              }}
            >
              <div className="glass-card">
                <h3 style={{ marginBottom: "24px", fontSize: "18px" }}>
                  Phase Performance
                </h3>
                {(() => {
                  const phaseData = reportData.visuals?.phase_radar?.labels
                    ? reportData.visuals.phase_radar.labels.map(
                        (label: string, idx: number) => ({
                          subject: label,
                          score: reportData.visuals.phase_radar.data[idx] ?? 0,
                        }),
                      )
                    : [];
                  const hasPhaseData = phaseData.some((d: any) => d.score > 0);
                  return hasPhaseData ? (
                    <ChartRadar data={phaseData} dataKey="score" />
                  ) : (
                    <div style={{
                      height: 200,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      color: "var(--text-secondary)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "32px", opacity: 0.4 }}>◎</div>
                      <div style={{ fontSize: "14px" }}>
                        Phase accuracy requires engine analysis.
                      </div>
                      <div style={{ fontSize: "13px", opacity: 0.7 }}>
                        Analyze individual games to populate this chart.
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="glass-card">
                <h3 style={{ marginBottom: "24px", fontSize: "18px" }}>
                  Accuracy Over Time
                </h3>
                <ChartLine
                  data={
                    reportData.visuals?.accuracy_over_time?.labels
                      ? reportData.visuals.accuracy_over_time.labels.map(
                          (label: string, idx: number) => ({
                            game: label,
                            accuracy: reportData.visuals.accuracy_over_time.data[idx],
                            opening: reportData.visuals.accuracy_over_time.openings?.[idx],
                            date: reportData.visuals.accuracy_over_time.dates?.[idx],
                          }),
                        )
                      : []
                  }
                  dataKey="accuracy"
                  xAxisKey="game"
                />
              </div>
            </div>

            {/* ── SUMMARY CARD ── */}
            <div className="glass-card" style={{ padding: "32px" }}>
              <h3
                style={{
                  marginBottom: "24px",
                  fontSize: "22px",
                  color: "var(--accent-color)",
                }}
              >
                {reportData.report.title || "Coach's Summary"}
              </h3>

              {reportData.report.period_summary && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
                    gap: "16px",
                    marginBottom: "32px",
                    padding: "16px",
                    background: "var(--surface-1)",
                    borderRadius: "12px",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Games Analyzed
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "bold" }}>
                      {reportData.report.period_summary.games_analyzed}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Average Accuracy
                    </div>
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: "bold",
                        color: "var(--accent-color)",
                      }}
                    >
                      {(() => {
                        const v = parseFloat(reportData.report.period_summary.overall_avg_accuracy);
                        return isNaN(v) || v === 0 ? "—" : `${v.toFixed(1)}%`;
                      })()}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Momentum
                    </div>
                    <div
                      style={{
                        fontSize: "20px",
                        fontWeight: "bold",
                        color: reportData.report.period_summary.current_momentum
                          ?.toLowerCase()
                          .includes("improv")
                          ? "var(--success)"
                          : "var(--text-primary)",
                      }}
                    >
                      {reportData.report.period_summary.current_momentum}
                    </div>
                  </div>
                </div>
              )}

              {reportData.report.strengths_weaknesses && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
                    gap: "24px",
                    marginBottom: "32px",
                  }}
                >
                  <div>
                    <h4
                      style={{
                        color: "var(--success)",
                        marginBottom: "12px",
                        fontSize: "16px",
                      }}
                    >
                      Strengths
                    </h4>
                    <ul
                      style={{
                        paddingLeft: "20px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.6",
                      }}
                    >
                      {reportData.report.strengths_weaknesses.strengths
                        ?.length > 0 ? (
                        reportData.report.strengths_weaknesses.strengths.map(
                          (s: string, i: number) => (
                            <li key={i} style={{ marginBottom: "6px" }}>
                              {s}
                            </li>
                          ),
                        )
                      ) : (
                        <li>Identifying strengths…</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4
                      style={{
                        color: "var(--danger)",
                        marginBottom: "12px",
                        fontSize: "16px",
                      }}
                    >
                      Weaknesses
                    </h4>
                    <ul
                      style={{
                        paddingLeft: "20px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.6",
                      }}
                    >
                      {reportData.report.strengths_weaknesses.weaknesses
                        ?.length > 0 ? (
                        reportData.report.strengths_weaknesses.weaknesses.map(
                          (w: string, i: number) => (
                            <li key={i} style={{ marginBottom: "6px" }}>
                              {w}
                            </li>
                          ),
                        )
                      ) : (
                        <li>No major weaknesses detected. Keep it up!</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {reportData.report.repertoire_snapshot && (
                <div style={{ marginBottom: "32px" }}>
                  <h4 style={{ marginBottom: "16px", fontSize: "16px" }}>
                    Opening Repertoire Snapshot
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        padding: "16px",
                        background: "var(--surface-1)",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}
                      >
                        As White
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {reportData.report.repertoire_snapshot.user_as_white?.join(
                          ", ",
                        ) || "N/A"}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "16px",
                        background: "var(--surface-1)",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}
                      >
                        As Black
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {reportData.report.repertoire_snapshot.user_as_black?.join(
                          ", ",
                        ) || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reportData.report.top_action_items?.length > 0 && (
                <div>
                  <h4
                    style={{
                      color: "var(--warning)",
                      marginBottom: "12px",
                      fontSize: "16px",
                    }}
                  >
                    Top Action Items
                  </h4>
                  <ul
                    style={{
                      paddingLeft: "20px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.6",
                    }}
                  >
                    {reportData.report.top_action_items.map(
                      (item: string, i: number) => (
                        <li key={i} style={{ marginBottom: "6px" }}>
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* ── SECTION A: MOVE QUALITY DISTRIBUTION ── */}
            {(reportData.visuals?.mistake_distribution ||
              reportData.move_breakdown) && (
              <div className="glass-card" style={{ padding: "32px" }}>
                <h3 style={{ marginBottom: "24px", fontSize: "20px" }}>
                  Move Quality Distribution
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
                    gap: "24px",
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
                      gap: "8px",
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
                              padding: "6px 0",
                              borderBottom: "1px solid var(--glass-border)",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "14px",
                              }}
                            >
                              <span
                                style={{
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  background: color,
                                  display: "inline-block",
                                }}
                              />
                              {quality}
                            </span>
                            <span
                              style={{
                                fontWeight: "700",
                                color,
                                fontSize: "15px",
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

            {/* ── SECTION B: OPENING PERFORMANCE ── */}
            {reportData.openings && (
              <div className="glass-card" style={{ padding: "32px" }}>
                <h3 style={{ marginBottom: "24px", fontSize: "20px" }}>
                  Opening Performance
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "28px",
                  }}
                >
                  {(() => {
                    const perf = reportData.openings?.performance;
                    const mistakes = reportData.openings?.mistakes;
                    const combined = perf?.combined || perf;
                    const rows = buildOpeningTableRowsFlat(combined);
                    if (rows.length > 0) {
                      return (
                        <div>
                          <OpeningTable
                            openings={rows}
                            caption="All Openings"
                          />
                        </div>
                      );
                    }
                    const whiteRows = buildOpeningTableRows(perf, "white");
                    const blackRows = buildOpeningTableRows(perf, "black");
                    return (
                      <>
                        {whiteRows.length > 0 && (
                          <OpeningTable
                            openings={whiteRows}
                            caption="As White"
                          />
                        )}
                        {blackRows.length > 0 && (
                          <OpeningTable
                            openings={blackRows}
                            caption="As Black"
                          />
                        )}
                      </>
                    );
                  })()}

                  {/* Opening recommendations */}
                  {reportData.openings?.recommendations?.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "700",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "12px",
                        }}
                      >
                        Opening Recommendations
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        {reportData.openings.recommendations.map(
                          (rec: any, i: number) => {
                            const typeColor =
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
                                  borderLeft: `4px solid ${typeColor}`,
                                  background: `${typeColor}0d`,
                                  borderRadius: "0 8px 8px 0",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    color: typeColor,
                                    marginBottom: "4px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {rec.type}
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
              </div>
            )}

            {/* ── SECTION C: PATTERNS BREAKDOWN ── */}
            {reportData.patterns && (
              <div className="glass-card" style={{ padding: "32px" }}>
                <h3 style={{ marginBottom: "24px", fontSize: "20px" }}>
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
                  <div style={{ marginTop: "20px" }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
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

            {/* ── SECTION D: TIME & MISTAKE FREQUENCY ── */}
            {(reportData.time_analysis || reportData.mistake_frequency) && (
              <div className="glass-card" style={{ padding: "32px" }}>
                <h3 style={{ marginBottom: "24px", fontSize: "20px" }}>
                  Time & Mistake Frequency
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
                    gap: "28px",
                  }}
                >
                  {reportData.time_analysis && (
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "12px",
                        }}
                      >
                        Time Analysis
                      </div>
                      <TimeAnalysisCard
                        avg_time_per_move={
                          reportData.time_analysis.average_time_per_move
                        }
                        phase_breakdown={
                          reportData.time_analysis.phase_time_breakdown
                        }
                        time_pressure_risk={
                          reportData.time_analysis.time_pressure_risk
                        }
                        think_move_count={
                          reportData.time_analysis.think_moves?.length ??
                          reportData.time_analysis.think_move_count
                        }
                      />
                    </div>
                  )}

                  {reportData.mistake_frequency && (
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "12px",
                        }}
                      >
                        Error Rates (avg per game)
                      </div>
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
                                background: "var(--surface-1)",
                                borderRadius: "8px",
                                border: "1px solid var(--glass-border)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-secondary)",
                                  textTransform: "uppercase",
                                  marginBottom: "4px",
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: "22px",
                                  fontWeight: "700",
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
              </div>
            )}

            {/* ── SECTION E: COHORT BENCHMARKS ── */}
            {reportData.benchmarks && (
              <div className="glass-card" style={{ padding: "32px" }}>
                <h3 style={{ marginBottom: "24px", fontSize: "20px" }}>
                  Cohort Benchmarks
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
                    gap: "24px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Your Cohort
                      </div>
                      <div
                        style={{
                          fontSize: "22px",
                          fontWeight: "bold",
                          textTransform: "capitalize",
                          color: "var(--accent-color)",
                        }}
                      >
                        {reportData.benchmarks.cohort}{" "}
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "normal",
                            color: "var(--text-secondary)",
                          }}
                        >
                          ({reportData.benchmarks.user_rating} rating)
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px",
                          background: "var(--surface-1)",
                          borderRadius: "10px",
                          border: "1px solid var(--glass-border)",
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
                        <div style={{ fontSize: "20px", fontWeight: "bold" }}>
                          {reportData.benchmarks.comparison?.accuracy != null
                            ? parseFloat(
                                reportData.benchmarks.comparison.accuracy,
                              ).toFixed(1)
                            : "N/A"}
                          %
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "16px",
                          background: "var(--surface-1)",
                          borderRadius: "10px",
                          border: "1px solid var(--glass-border)",
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
                            fontWeight: "bold",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {reportData.benchmarks.comparison?.cohort_avg != null
                            ? parseFloat(
                                reportData.benchmarks.comparison.cohort_avg,
                              ).toFixed(1)
                            : "N/A"}
                          %
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "14px 16px",
                        background: "var(--surface-1)",
                        borderRadius: "10px",
                        border: "1px solid var(--glass-border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Accuracy Gap
                      </span>
                      <span
                        style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          color:
                            (reportData.benchmarks.comparison?.gap ?? 0) >= 0
                              ? "var(--success)"
                              : "var(--danger)",
                        }}
                      >
                        {(reportData.benchmarks.comparison?.gap ?? 0) >= 0
                          ? "+"
                          : ""}
                        {reportData.benchmarks.comparison?.gap != null
                          ? parseFloat(
                              reportData.benchmarks.comparison.gap,
                            ).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </div>

                    {/* Phase comparison bar chart */}
                    {reportData.benchmarks.phase_comparison && (
                      <ChartBar
                        data={Object.entries(
                          reportData.benchmarks.phase_comparison,
                        ).map(([phase, vals]: [string, any]) => ({
                          phase: phase.charAt(0).toUpperCase() + phase.slice(1),
                          You: parseFloat(vals.user ?? vals.you ?? 0),
                          Cohort: parseFloat(
                            vals.cohort_avg ?? vals.cohort ?? 0,
                          ),
                        }))}
                        xKey="phase"
                        bars={[
                          {
                            key: "You",
                            color: "var(--accent-color)",
                            label: "You",
                          },
                          {
                            key: "Cohort",
                            color: "rgba(148,163,184,0.6)",
                            label: "Cohort Avg",
                          },
                        ]}
                        height={200}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px",
                        background: "rgba(59,130,246,0.05)",
                        borderRadius: "12px",
                        border: "1px solid rgba(59,130,246,0.1)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: "8px",
                        }}
                      >
                        Coach&apos;s Cohort Insight
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          lineHeight: "1.6",
                          color: "var(--text-primary)",
                          fontWeight: "500",
                        }}
                      >
                        {reportData.benchmarks.insight}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <div
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "50%",
                          background:
                            "linear-gradient(135deg, var(--accent-color), #2563eb)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: "bold",
                          fontSize: "20px",
                          boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
                          flexShrink: 0,
                        }}
                      >
                        {reportData.benchmarks.percentile_estimate}%
                      </div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                          Estimated Percentile
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Outperforming{" "}
                          {reportData.benchmarks.percentile_estimate}% of
                          players in your rating range.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="glass-card"
            style={{
              padding: "48px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div style={{ fontSize: "40px", opacity: 0.3 }}>📊</div>
            <div style={{ fontSize: "18px", fontWeight: "700" }}>No report yet</div>
            <p style={{ color: "var(--text-secondary)", margin: 0, maxWidth: "380px", lineHeight: "1.6" }}>
              Run a batch analysis on your games first. Stockfish will analyze each game and the full report will appear here.
            </p>
            <Link
              href="/batch"
              style={{
                marginTop: "8px",
                padding: "12px 28px",
                background: "var(--accent-color)",
                color: "#fff",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: "600",
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
