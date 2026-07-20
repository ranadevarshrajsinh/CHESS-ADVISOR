"use client";
import { motion, useReducedMotion } from "framer-motion";

interface Tab<T extends string> {
  id: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (id: T) => void;
}

export function PillTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: PillTabsProps<T>) {
  const reduced = useReducedMotion();

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "2px",
        padding: "3px",
        background: "#111",
        borderRadius: "99px",
        border: "1px solid #2a2a2a",
        overflowX: "auto",
        scrollbarWidth: "none",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            style={{
              position: "relative",
              padding: "5px 13px",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "#031a10" : "#a1a1aa",
              background: "none",
              border: "none",
              borderRadius: "99px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "Inter, system-ui, sans-serif",
              transition: reduced ? "none" : "color 0.18s ease",
              zIndex: 1,
            }}
          >
            {isActive && (
              <motion.div
                layoutId="pill-active"
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#1dc189",
                  borderRadius: "99px",
                  zIndex: -1,
                }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 34 }
                }
              />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
