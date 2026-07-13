"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Target, Activity, LogOut, Puzzle,
  MoreHorizontal, X, FileText, Layers,
} from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import ThemeToggle from "./ThemeToggle";
import SettingsPanel from "./SettingsPanel";
import "./Header.css";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} /> },
  { name: "Report",    path: "/report",    icon: <Activity size={18} /> },
  { name: "Training",  path: "/training-plan", icon: <Target size={18} /> },
  { name: "Puzzles",   path: "/puzzles",   icon: <Puzzle size={18} /> },
];

const BOTTOM_NAV_ITEMS = [
  { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} />, matchPrefixes: ["/dashboard", "/games", "/analysis"] },
  { name: "Puzzles",   path: "/puzzles",   icon: <Puzzle size={20} />, matchPrefixes: ["/puzzles"] },
  { name: "Report",    path: "/report",    icon: <Activity size={20} />, matchPrefixes: ["/report"] },
  { name: "Training",  path: "/training-plan", icon: <Target size={20} />, matchPrefixes: ["/training-plan"] },
  { name: "Batch",     path: "/batch",     icon: <Layers size={20} />, matchPrefixes: ["/batch"] },
];

export default function Header() {
  const pathname = usePathname();
  const { chessUsername, logout } = usePlayer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!chessUsername) return null;

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <header className="header-glass">
        <div className="container flex-between header-inner">
          <div className="header-brand">
            <span className="brand-logo">♞</span>
            <span className="brand-text">Chess Advisor</span>
          </div>

          {/* Desktop nav */}
          <nav className="header-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-link ${pathname === item.path ? "active" : ""}`}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop user area */}
          <div className="header-user">
            <ThemeToggle />
            <span
              className="user-name clickable"
              onClick={() => setSettingsOpen(true)}
            >
              {chessUsername}
            </span>
            <button className="btn-logout" title="Log Out" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className={`hamburger-btn ${drawerOpen ? "open" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          userType="player"
          username={chessUsername}
        />
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={`mobile-drawer-overlay ${drawerOpen ? "open" : ""}`}
        onClick={closeDrawer}
      />

      {/* Mobile drawer */}
      <div className={`mobile-drawer ${drawerOpen ? "open" : ""}`}>
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-brand">
            <span style={{ fontSize: "22px", color: "var(--accent-color)" }}>♞</span>
            Chess Advisor
          </div>
          <button className="mobile-drawer-close" onClick={closeDrawer}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "8px", background: "var(--surface-1)", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Signed in as</span>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>{chessUsername}</span>
        </div>

        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`nav-link ${pathname === item.path ? "active" : ""}`}
            onClick={closeDrawer}
          >
            {item.icon}
            {item.name}
          </Link>
        ))}

        <Link
          href="/batch"
          className={`nav-link ${pathname === "/batch" ? "active" : ""}`}
          onClick={closeDrawer}
        >
          <Layers size={18} />
          Batch Analysis
        </Link>

        <div className="mobile-drawer-divider" />

        <div className="mobile-drawer-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ThemeToggle />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Toggle theme</span>
          </div>
          <button
            className="mobile-drawer-logout"
            onClick={() => { logout(); closeDrawer(); }}
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </div>

      {/* Bottom nav bar (mobile only) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`bottom-nav-tab ${item.matchPrefixes.some(p => pathname.startsWith(p)) ? "active" : ""}`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
