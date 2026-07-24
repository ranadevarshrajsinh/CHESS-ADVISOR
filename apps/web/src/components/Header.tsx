"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
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

const SCROLL_THRESHOLD = 100;
const COLLAPSED_WIDTH = 460;
const PLAYER_ROUTE_PREFIXES = [
  "/dashboard",
  "/analysis",
  "/batch",
  "/games",
  "/openings",
  "/puzzles",
  "/report",
  "/training-plan",
];
const getExpandedWidth = () => Math.min(1180, window.innerWidth - 20);
const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Header() {
  const pathname = usePathname();
  const { activeUsername, logout } = usePlayer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachNotes, setCoachNotes] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Animation refs
  const pillRef = useRef<HTMLElement>(null);
  const brandTextRef = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activeIndicatorRef = useRef<HTMLDivElement>(null);
  const bottomInnerRef = useRef<HTMLDivElement>(null);
  const bottomTabRefs = useRef<(HTMLElement | null)[]>([]);
  const bottomIndicatorRef = useRef<HTMLDivElement>(null);

  const collapseTlRef = useRef<gsap.core.Timeline | null>(null);
  const isCollapsedRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const expandedBoundsRef = useRef<Array<{ x: number; w: number; h: number }>>([]);

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.matchPrefixes.some((p) => pathname.startsWith(p))
  );
  const activeBottomIndex = settingsOpen
    ? BOTTOM_NAV_ITEMS.findIndex((item) => item.path === null)
    : BOTTOM_NAV_ITEMS.findIndex((item) =>
        item.path ? item.matchPrefixes.some((p) => pathname.startsWith(p)) : false
      );

  activeIndexRef.current = activeIndex;

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

  // Cache expanded link geometry (stable across viewport resizes since nav is content-sized)
  const cacheExpandedBounds = () => {
    expandedBoundsRef.current = linkRefs.current.map((link) =>
      link ? { x: link.offsetLeft, w: link.offsetWidth, h: link.offsetHeight } : { x: 0, w: 0, h: 0 }
    );
  };

  // Compute indicator target for a given index and state
  const indicatorTargetFor = (idx: number, collapsed: boolean) => {
    if (idx < 0) return null;
    if (collapsed) {
      // Each collapsed link = padding(13*2) + icon(14) = 40; nav gap = 2
      const COLLAPSED_LINK_W = 40;
      const NAV_GAP = 2;
      const cached = expandedBoundsRef.current[idx];
      return {
        x: idx * (COLLAPSED_LINK_W + NAV_GAP),
        width: COLLAPSED_LINK_W,
        height: cached?.h ?? 24,
      };
    }
    const cached = expandedBoundsRef.current[idx];
    if (cached && cached.w > 0) return { x: cached.x, width: cached.w, height: cached.h };
    // Fallback: measure now (first paint)
    const link = linkRefs.current[idx];
    if (!link) return null;
    return { x: link.offsetLeft, width: link.offsetWidth, height: link.offsetHeight };
  };

  // Position indicator instantly (no animation)
  const snapDesktopIndicator = () => {
    if (!activeIndicatorRef.current) return;
    const target = indicatorTargetFor(activeIndexRef.current, isCollapsedRef.current);
    if (!target) {
      gsap.set(activeIndicatorRef.current, { opacity: 0 });
      return;
    }
    gsap.set(activeIndicatorRef.current, {
      opacity: 1,
      x: target.x,
      width: target.width,
      height: target.height,
      force3D: true,
    });
  };

  // Build a fresh collapse/expand animation
  const applyCollapseState = (collapse: boolean, animated = true) => {
    if (!pillRef.current || !brandTextRef.current) return;
    const reduced = prefersReduced();
    const duration = animated && !reduced ? 0.45 : 0;
    const ease = "power3.out";

    collapseTlRef.current?.kill();

    // Cache expanded bounds before leaving expanded state
    if (collapse && expandedBoundsRef.current.every((b) => b.w === 0)) {
      cacheExpandedBounds();
    }

    const labels = labelRefs.current.filter(Boolean) as HTMLSpanElement[];
    const targetWidth = collapse ? COLLAPSED_WIDTH : getExpandedWidth();

    const tl = gsap.timeline({ defaults: { duration, ease } });

    tl.to(pillRef.current, { width: targetWidth }, 0)
      .to(
        brandTextRef.current,
        {
          maxWidth: collapse ? 0 : 200,
          opacity: collapse ? 0 : 1,
          marginLeft: collapse ? -10 : 0,
        },
        0
      )
      .to(
        labels,
        {
          maxWidth: collapse ? 0 : 200,
          opacity: collapse ? 0 : 1,
          marginLeft: collapse ? -6 : 0,
        },
        0
      );

    // Indicator tweens inside the same timeline — no per-frame DOM reads
    const target = indicatorTargetFor(activeIndexRef.current, collapse);
    if (target && activeIndicatorRef.current) {
      tl.to(
        activeIndicatorRef.current,
        {
          x: target.x,
          width: target.width,
          height: target.height,
          force3D: true,
        },
        0
      );
    }

    collapseTlRef.current = tl;
  };

  // Init: cache bounds while expanded, set initial collapse state, snap indicator
  useLayoutEffect(() => {
    if (!chessUsername || !pillRef.current) return;
    // Cache bounds before any state change (DOM is currently in expanded CSS default)
    cacheExpandedBounds();
    const initialCollapsed = window.scrollY > SCROLL_THRESHOLD;
    isCollapsedRef.current = initialCollapsed;
    applyCollapseState(initialCollapsed, false);
    snapDesktopIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chessUsername]);

  // Slide the active pill on route change
  useLayoutEffect(() => {
    if (!chessUsername || !activeIndicatorRef.current) return;
    if (activeIndex < 0) {
      gsap.to(activeIndicatorRef.current, { opacity: 0, duration: 0.2 });
      return;
    }
    const target = indicatorTargetFor(activeIndex, isCollapsedRef.current);
    if (!target) return;
    const reduced = prefersReduced();
    gsap.to(activeIndicatorRef.current, {
      opacity: 1,
      x: target.x,
      width: target.width,
      height: target.height,
      duration: reduced ? 0 : 0.42,
      ease: "power3.out",
      force3D: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, chessUsername]);

  // Scroll-driven collapse
  useEffect(() => {
    if (!chessUsername) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const shouldCollapse = window.scrollY > SCROLL_THRESHOLD;
        if (shouldCollapse !== isCollapsedRef.current) {
          isCollapsedRef.current = shouldCollapse;
          applyCollapseState(shouldCollapse, true);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chessUsername]);

  // Reflow on viewport resize
  useEffect(() => {
    if (!chessUsername) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!isCollapsedRef.current && pillRef.current) {
          gsap.set(pillRef.current, { width: getExpandedWidth() });
        }
        snapDesktopIndicator();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chessUsername]);

  // Bottom-nav active pill
  useLayoutEffect(() => {
    if (!chessUsername || !bottomIndicatorRef.current || !bottomInnerRef.current) return;
    if (activeBottomIndex < 0) {
      gsap.to(bottomIndicatorRef.current, { opacity: 0, duration: 0.2 });
      return;
    }
    const target = bottomTabRefs.current[activeBottomIndex];
    if (!target) return;
    const reduced = prefersReduced();
    gsap.to(bottomIndicatorRef.current, {
      opacity: 1,
      x: target.offsetLeft + 8,
      width: target.offsetWidth - 16,
      duration: reduced ? 0 : 0.42,
      ease: "power3.out",
    });
  }, [activeBottomIndex, chessUsername]);

  // Entrance animation — fromTo with explicit end state so Strict-Mode double-invoke can't strand it mid-fade
  useLayoutEffect(() => {
    if (!chessUsername || !pillRef.current) return;
    if (prefersReduced()) return;
    const tween = gsap.fromTo(
      pillRef.current,
      { y: -8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }
    );
    return () => {
      tween.kill();
      if (pillRef.current) gsap.set(pillRef.current, { clearProps: "y,opacity" });
    };
  }, [chessUsername]);

  const undismissed = coachNotes.filter((n) => !dismissedIds.has(n.id));

  const handleNoteClick = (note: any) => {
    const next = new Set(dismissedIds);
    next.add(note.id);
    setDismissedIds(next);
    localStorage.setItem(`coachNotesDismissed_${activeUsername}`, JSON.stringify([...next]));
    setShowNotif(false);
    window.location.href = `/analysis/${encodeURIComponent(note.filename)}?annotation=${note.move_index}`;
  };

  const isPlayerRoute = PLAYER_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!chessUsername || !isPlayerRoute) return null;

  return (
    <>
      <header className="header-bar" ref={pillRef}>
        <div className="header-inner">

          {/* Brand */}
          <Link href="/dashboard" className="header-brand" aria-label="Chess Advisor home">
            <div className="brand-mark" aria-hidden="true">
              <span className="brand-knight">♞</span>
            </div>
            <span className="brand-text" ref={brandTextRef}>Chess Advisor</span>
          </Link>

          {/* Desktop center nav */}
          <nav className="header-nav" aria-label="Main navigation" ref={navRef}>
            <div
              className="nav-pill"
              ref={activeIndicatorRef}
              aria-hidden="true"
              style={{ opacity: 0 }}
            />
            {NAV_ITEMS.map((item, i) => {
              const isActive = i === activeIndex;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`nav-link${isActive ? " active" : ""}`}
                  ref={(el) => { linkRefs.current[i] = el; }}
                >
                  {item.icon}
                  <span
                    className="nav-link-label"
                    ref={(el) => { labelRefs.current[i] = el; }}
                  >
                    {item.name}
                  </span>
                </Link>
              );
            })}
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
      </header>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userType="player"
        username={chessUsername}
        onLogout={logout}
      />

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-inner" ref={bottomInnerRef}>
          <div
            className="bottom-pill"
            ref={bottomIndicatorRef}
            aria-hidden="true"
            style={{ opacity: 0 }}
          />
          {BOTTOM_NAV_ITEMS.map((item, i) => {
            const isActive = i === activeBottomIndex;
            const hasBadge = item.name === "Dashboard" && undismissed.length > 0;

            return item.path ? (
              <Link
                key={item.name}
                href={item.path}
                className={`bottom-nav-tab${isActive ? " active" : ""}`}
                ref={(el) => { bottomTabRefs.current[i] = el; }}
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
                ref={(el) => { bottomTabRefs.current[i] = el; }}
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
