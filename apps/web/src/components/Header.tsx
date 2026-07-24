"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Target, Activity, Puzzle,
  Layers, Bell, Settings,
} from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import SettingsPanel from "./SettingsPanel";
import "./Header.css";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/dashboard", matchPrefixes: ["/dashboard", "/games", "/analysis"], icon: <LayoutDashboard size={14} /> },
  { name: "Report",    path: "/report",    matchPrefixes: ["/report"],         icon: <Activity size={14} /> },
  { name: "Training",  path: "/training-plan", matchPrefixes: ["/training-plan"], icon: <Target size={14} /> },
  { name: "Puzzles",   path: "/puzzles",   matchPrefixes: ["/puzzles"],        icon: <Puzzle size={14} /> },
  { name: "Batch",     path: "/batch",     matchPrefixes: ["/batch"],          icon: <Layers size={14} /> },
];

const BOTTOM_NAV_ITEMS = [
  { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} />, matchPrefixes: ["/dashboard", "/games", "/analysis"] },
  { name: "Puzzles",   path: "/puzzles",   icon: <Puzzle size={20} />,          matchPrefixes: ["/puzzles"] },
  { name: "Report",    path: "/report",    icon: <Activity size={20} />,        matchPrefixes: ["/report"] },
  { name: "Training",  path: "/training-plan", icon: <Target size={20} />,      matchPrefixes: ["/training-plan"] },
  { name: "Settings",  path: null,         icon: <Settings size={20} />,        matchPrefixes: [] },
];

export default function Header() {
  const pathname = usePathname();
  const { activeUsername, logout } = usePlayer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachNotes, setCoachNotes] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeUsername) return;
    const stored = localStorage.getItem(`coachNotesDismissed_${activeUsername}`);
    if (stored) {
      try { setDismissedIds(new Set(JSON.parse(stored))); } catch {}
    }
    fetch("/api/player/coach-notes")
      .then((r) => r.json())
      .then(({ notes }) => { if (Array.isArray(notes)) setCoachNotes(notes); })
      .catch(() => {});
  }, [activeUsername]);

  useEffect(() => {
    if (!showNotif) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotif]);

  const undismissed = coachNotes.filter((n) => !dismissedIds.has(n.id));

  const handleNoteClick = (note: any) => {
    const next = new Set(dismissedIds);
    next.add(note.id);
    setDismissedIds(next);
    localStorage.setItem(`coachNotesDismissed_${activeUsername}`, JSON.stringify([...next]));
    setShowNotif(false);
    window.location.href = `/analysis/${encodeURIComponent(note.filename)}?annotation=${note.move_index}`;
  };

  if (!activeUsername) return null;

  return (
    <>
      <header className="header-bar">
        <div className="header-inner">

          {/* Brand */}
          <Link href="/dashboard" className="header-brand" aria-label="Chess Advisor home">
            <div className="brand-mark" aria-hidden="true">
              <span className="brand-knight">♞</span>
            </div>
            <span className="brand-text">Chess Advisor</span>
          </Link>

          {/* Desktop center nav */}
          <nav className="header-nav" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-link ${item.matchPrefixes.some((p) => pathname.startsWith(p)) ? "active" : ""}`}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="header-actions">
            <div ref={notifRef} className="notif-anchor">
              <button
                className={`header-action-btn${showNotif ? " active" : ""}`}
                onClick={() => setShowNotif((v) => !v)}
                aria-label={undismissed.length > 0 ? `${undismissed.length} unread coach note${undismissed.length !== 1 ? "s" : ""}` : "Coach notes"}
                aria-expanded={showNotif}
                aria-haspopup="true"
              >
                <Bell size={15} />
                {undismissed.length > 0 && (
                  <span className="header-action-badge" aria-hidden="true">{undismissed.length}</span>
                )}
              </button>

              {showNotif && (
                <div className="notif-dropdown" role="menu" aria-label="Coach notes">
                  <div className="notif-dropdown-header">Notifications</div>
                  {undismissed.length === 0 ? (
                    <div className="notif-empty">
                      <span className="notif-empty-text">All caught up</span>
                    </div>
                  ) : (
                    <div className="notif-dropdown-list">
                      {undismissed.map((note) => (
                        <button
                          key={note.id}
                          className="notif-item"
                          onClick={() => handleNoteClick(note)}
                          role="menuitem"
                        >
                          <span className="notif-item-meta">Move {note.move_index + 1}</span>
                          <span className="notif-item-text">
                            {note.note.length > 90 ? note.note.slice(0, 90) + "…" : note.note}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>

            <button
              className={`header-action-btn${settingsOpen ? " active" : ""}`}
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          userType="player"
          username={activeUsername}
          onLogout={logout}
        />
      </header>

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-inner">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const isActive = settingsOpen
              ? item.path === null
              : item.path
                ? item.matchPrefixes.some((p) => pathname.startsWith(p))
                : false;
            const hasBadge = item.name === "Dashboard" && undismissed.length > 0;

            return item.path ? (
              <Link
                key={item.name}
                href={item.path}
                className={`bottom-nav-tab${isActive ? " active" : ""}`}
              >
                <span className="bottom-tab-icon-wrap">
                  {item.icon}
                  {hasBadge && <span className="bottom-tab-badge" aria-hidden="true" />}
                </span>
                <span>{item.name}</span>
              </Link>
            ) : (
              <button
                key={item.name}
                className={`bottom-nav-tab${isActive ? " active" : ""}`}
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                {item.icon}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
