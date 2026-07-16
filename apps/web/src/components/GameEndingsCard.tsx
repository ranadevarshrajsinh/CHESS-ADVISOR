"use client";

type EndingStats = {
  total: number;
  timeout: number;
  resignation: number;
  checkmate: number;
  aborted: number;
  other: number;
};

interface Props {
  wins: EndingStats;
  losses: EndingStats;
}

const WINS_COLORS = {
  checkmate:   "#10b981",
  resignation: "#34d399",
  timeout:     "#22d3ee",
  aborted:     "#a3a3a3",
  other:       "#52525b",
};

const LOSSES_COLORS = {
  checkmate:   "#ef4444",
  resignation: "#f97316",
  timeout:     "#f59e0b",
  aborted:     "#a3a3a3",
  other:       "#52525b",
};

const ENDING_LABELS = {
  timeout:    "On time",
  resignation: "Resignation",
  checkmate:  "Checkmate",
  aborted:    "Aborted",
  other:      "Other",
};

function EndingBar({ stats, variant }: { stats: EndingStats; variant: "wins" | "losses" }) {
  const ENDING_COLORS = variant === "wins" ? WINS_COLORS : LOSSES_COLORS;
  if (stats.total === 0) {
    return <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>No data</p>;
  }

  const allSegments: Array<{ key: keyof typeof ENDING_COLORS; count: number }> = [
    { key: "checkmate",   count: stats.checkmate },
    { key: "resignation", count: stats.resignation },
    { key: "timeout",     count: stats.timeout },
    { key: "aborted",     count: stats.aborted },
    { key: "other",       count: stats.other },
  ];
  const segments = allSegments.filter((s) => s.count > 0);

  return (
    <div>
      <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", gap: "2px" }}>
        {segments.map(({ key, count }) => (
          <div
            key={key}
            style={{
              width: `${(count / stats.total) * 100}%`,
              background: ENDING_COLORS[key],
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", marginTop: "10px" }}>
        {segments.map(({ key, count }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                background: ENDING_COLORS[key],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {ENDING_LABELS[key]}{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GameEndingsCard({ wins, losses }: Props) {
  return (
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
        How your games end
      </h3>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>
        Checkmate, the clock, or a resignation — split by outcome.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#10b981",
              }}
            >
              {wins.total}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>Wins</span>
          </div>
          <EndingBar stats={wins} variant="wins" />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#ef4444",
              }}
            >
              {losses.total}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>Losses</span>
          </div>
          <EndingBar stats={losses} variant="losses" />
        </div>
      </div>
    </div>
  );
}
