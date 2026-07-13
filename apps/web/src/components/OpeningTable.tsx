"use client";
import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface OpeningRow {
  name: string;
  eco?: string;
  wins?: number;
  losses?: number;
  draws?: number;
  accuracy?: number;
  mistake_rate?: number;
  games?: number;
}

interface Props {
  openings: OpeningRow[];
  caption?: string;
}

type SortKey =
  | "name"
  | "wins"
  | "losses"
  | "accuracy"
  | "mistake_rate"
  | "games";

function accuracyColor(acc?: number) {
  if (acc == null) return "var(--text-secondary)";
  if (acc >= 70) return "var(--success)";
  if (acc >= 50) return "var(--warning)";
  return "var(--danger)";
}

function wld(row: OpeningRow) {
  const w = row.wins ?? 0;
  const l = row.losses ?? 0;
  const d = row.draws ?? 0;
  return `${w}/${l}/${d}`;
}

interface THProps {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDesc: boolean;
  toggle: (key: SortKey) => void;
}

function TH({ label, k, sortKey, sortDesc, toggle }: THProps) {
  return (
    <th
      onClick={() => toggle(k)}
      style={{
        padding: "14px 12px",
        color: "var(--text-secondary)",
        fontSize: "12px",
        textTransform: "uppercase",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
        fontWeight: sortKey === k ? "700" : "400",
        textAlign: k === "name" ? "left" : "right",
        minHeight: "44px",
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

export default function OpeningTable({ openings, caption }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("accuracy");
  const [sortDesc, setSortDesc] = useState(true);

  if (!openings || openings.length === 0)
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
        No opening data available.
      </p>
    );

  const sorted = [...openings].sort((a, b) => {
    const av = (a as any)[sortKey] ?? 0;
    const bv = (b as any)[sortKey] ?? 0;
    if (typeof av === "string")
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortDesc ? bv - av : av - bv;
  });

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div style={{ overflowX: "auto" }}>
      {caption && (
        <div
          style={{
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "8px",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
          }}
        >
          {caption}
        </div>
      )}
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}
      >
        <thead style={{ background: "var(--surface-1)" }}>
          <tr>
            <TH label="Opening" k="name" sortKey={sortKey} sortDesc={sortDesc} toggle={toggle} />
            <TH label="W / L / D" k="wins" sortKey={sortKey} sortDesc={sortDesc} toggle={toggle} />
            <TH label="Accuracy" k="accuracy" sortKey={sortKey} sortDesc={sortDesc} toggle={toggle} />
            <TH label="Err/Game" k="mistake_rate" sortKey={sortKey} sortDesc={sortDesc} toggle={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--glass-border)" }}
            >
              <td style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: "600" }}>{row.name}</div>
                {row.eco && (
                  <div
                    style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                  >
                    {row.eco}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  textAlign: "right",
                }}
              >
                {wld(row)}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  fontWeight: "700",
                  textAlign: "right",
                  color: accuracyColor(row.accuracy),
                }}
              >
                {row.accuracy != null ? `${row.accuracy.toFixed(1)}%` : "—"}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  color:
                    row.mistake_rate != null && row.mistake_rate > 1
                      ? "var(--danger)"
                      : "var(--text-secondary)",
                }}
              >
                {row.mistake_rate != null ? row.mistake_rate.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
