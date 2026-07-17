"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkHealth } from "@/services/api";
import { Chessboard } from "react-chessboard";
import { Globe, Cpu, BookOpen, BarChart3, Target, Camera, ArrowRight, GraduationCap, Crown } from "lucide-react";
import styles from "./landing.module.css";

// ─── Particle canvas ──────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const COUNT = 50,
      SPEED = 0.3,
      MAX_DIST = 110;
    let W = 0,
      H = 0;
    let pts: {
      x: number;
      y: number;
      r: number;
      dx: number;
      dy: number;
      a: number;
    }[] = [];
    let raf: number;
    let paused = false;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        dx: (Math.random() - 0.5) * SPEED,
        dy: (Math.random() - 0.5) * SPEED,
        a: Math.random() * 0.42 + 0.08,
      }));
    };
    const loop = () => {
      if (paused) return;
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,245,245,${p.a})`;
        ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x,
            dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(127,130,130,${0.12 * (1 - d / MAX_DIST)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      paused = document.hidden;
      if (!paused) { raf = requestAnimationFrame(loop); }
    };
    resize();
    loop();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.16,
        filter: "grayscale(1)",
      }}
    />
  );
}

// ─── Famous game data ─────────────────────────────────────────
const HERO_GAMES = [
  {
    fen: "r1b2r1k/2q2pp1/p2p3p/1p1PpN1Q/8/2N5/PPP3PP/2KR1B1R w - - 0 1",
    from: "f5",
    to: "h6",
    symbol: "‼",
    c1label: "Move 22 — Tal vs Portisch, 1965",
    c1val: "Nxh6!!",
    c1eval: "+6.8",
    c1sub: "Knight Sacrifice · Pure Chaos",
    c2label: "Game Accuracy",
    c2val: "94.7%",
    c2badge: "★ Tal's Brilliancy",
    c3label: "Opening Identified",
    c3val: "Sicilian Defense",
    c3sub: "ECO B63 · Candidates 1965",
  },
  {
    fen: "r4rk1/pp3ppp/2n1p3/3p4/3p4/2N1BN2/PPP1QPPP/R2R2K1 w - - 0 1",
    from: "d1",
    to: "d4",
    symbol: "‼",
    c1label: "Move 24 — Kasparov vs Topalov, 1999",
    c1val: "Rxd4!!",
    c1eval: "+7.1",
    c1sub: "Eval swing: +0.2 → +7.1",
    c2label: "Game Accuracy",
    c2val: "97.3%",
    c2badge: "★ Kasparov's Immortal",
    c3label: "Opening Identified",
    c3val: "Pirc Defense",
    c3sub: "ECO B07 · Linares 1999",
  },
  {
    fen: "2r3k1/1p3ppp/p3p3/3p4/8/2N1P3/PPB2PPP/R5K1 w - - 0 1",
    from: "c2",
    to: "e4",
    symbol: "‼",
    c1label: "Move 26 — Fischer vs Spassky, 1972",
    c1val: "Be4!!",
    c1eval: "+3.4",
    c1sub: "Positional Masterclass",
    c2label: "Game Accuracy",
    c2val: "96.1%",
    c2badge: "★ World Championship",
    c3label: "Opening Identified",
    c3val: "Queen's Gambit",
    c3sub: "ECO D59 · Reykjavik 1972",
  },
  {
    fen: "r1bk2nr/p2p1p1p/n2B4/1p1NP2P/6P1/3P1Q2/P1P1K3/q5b1 w - - 0 1",
    from: "f3",
    to: "f6",
    symbol: "‼",
    c1label: "Move 22 — Anderssen vs Kieseritzky, 1851",
    c1val: "Qf6+!!",
    c1eval: "Mate in 2",
    c1sub: "−15 Material · The Immortal Game",
    c2label: "Material Balance",
    c2val: "−15",
    c2badge: "★ Greatest Game Ever",
    c3label: "Opening Identified",
    c3val: "King's Gambit",
    c3sub: "ECO C33 · London, 1851",
  },
];

function movePiece(fen: string, from: string, to: string): string {
  const rows = fen.split(" ")[0].split("/");
  const sq: string[] = [];
  for (const row of rows)
    for (const ch of row)
      /\d/.test(ch) ? sq.push(...Array(+ch).fill("")) : sq.push(ch);
  const idx = (s: string) => (8 - parseInt(s[1])) * 8 + (s.charCodeAt(0) - 97);
  const piece = sq[idx(from)];
  sq[idx(from)] = "";
  sq[idx(to)] = piece;
  const newRows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = "",
      empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = sq[r * 8 + c];
      if (p) {
        if (empty) {
          row += empty;
        }
        row += p;
        empty = 0;
      } else {
        empty++;
      }
    }
    if (empty) row += empty;
    newRows.push(row);
  }
  const parts = fen.split(" ");
  return (
    newRows.join("/") + (parts.length > 1 ? " " + parts.slice(1).join(" ") : "")
  );
}

const MOVE_TIERS = [
  {
    name: "Brilliant",
    color: "#f59e0b",
    desc: "Best move + sacrifice",
    symbol: "‼",
  },
  {
    name: "Best",
    color: "#22c55e",
    desc: "Top engine recommendation",
    symbol: "!",
  },
  {
    name: "Excellent",
    color: "#4ade80",
    desc: "Within 10 CP of best",
    symbol: "",
  },
  {
    name: "Good",
    color: "#86efac",
    desc: "Within 50 CP, solid choice",
    symbol: "",
  },
  {
    name: "Book",
    color: "#a3a3a3",
    desc: "Recognized opening theory",
    symbol: "∼",
  },
  {
    name: "Forced",
    color: "#71717a",
    desc: "Only legal or reasonable move",
    symbol: "□",
  },
  {
    name: "Inaccuracy",
    color: "#f59e0b",
    desc: "50+ CP loss + 3% WP drop",
    symbol: "?!",
  },
  {
    name: "Mistake",
    color: "#f97316",
    desc: "100+ CP loss + 7% WP drop",
    symbol: "?",
  },
  {
    name: "Blunder",
    color: "#ef4444",
    desc: "200+ CP loss + 15% WP drop",
    symbol: "??",
  },
];

const FEATURES = [
  {
    Icon: Globe,
    title: "Chess.com & Lichess Integration",
    desc: "Fetch up to 50 recent games directly from Chess.com or Lichess. Games are saved, indexed, and ready for deep analysis instantly.",
    tags: ["Chess.com API", "Lichess NDJSON", "PGN Import"],
  },
  {
    Icon: Cpu,
    title: "Stockfish Deep Analysis",
    desc: "Every move evaluated by Stockfish with dual-gate classification — centipawn loss AND win-probability drop both measured per move.",
    tags: ["Stockfish 17", "Win Prob", "CP Loss"],
  },
  {
    Icon: BookOpen,
    title: "Opening Repertoire Analysis",
    desc: "3000+ ECO openings. Longest-prefix match on move sequences. Win rates split by color. Problem openings flagged with study suggestions.",
    tags: ["3000+ ECO", "Win Rates", "Recommendations"],
  },
  {
    Icon: BarChart3,
    title: "Pattern & Mistake Detection",
    desc: "Detects 7+ recurring patterns: hanging pieces, missed forks, missed pins, skewers, discovered attacks, back-rank mates, and more.",
    tags: ["7 Patterns", "Per-phase", "Trend Analysis"],
    wide: true,
  },
  {
    Icon: Target,
    title: "Aim Training Goals",
    desc: "Turn analysis into clear weekly aims: fewer blunders, stronger endgames, sharper opening recall, and measurable training focus.",
    tags: ["Aim Score", "Weekly Focus", "Progress"],
  },
  {
    Icon: Camera,
    title: "Board Vision (Image → FEN)",
    desc: "Take a photo of any chess board. Our YOLOv8 model (99.4% mAP50) detects all 12 piece types and generates the FEN string instantly.",
    tags: ["YOLOv8n", "12 Classes", "FEN Output"],
  },
];

const ANALYTICS_BARS = [
  { label: "Overall Accuracy", value: 81.3, color: "#f5f5f5" },
  { label: "Opening Phase", value: 87.1, color: "#d4d4d8" },
  { label: "Middlegame", value: 76.4, color: "#a3a3a3" },
  { label: "Endgame", value: 62.9, color: "#71717a" },
  { label: "Win Rate", value: 58.0, color: "#f5f5f5" },
];

const STEPS = [
  {
    num: "1",
    title: "Connect Your Profile",
    desc: "Enter your Chess.com or Lichess username. We fetch your recent games automatically — no manual upload needed.",
  },
  {
    num: "2",
    title: "Stockfish Analyzes Every Move",
    desc: "Each move is evaluated for centipawn loss, win-probability drop, tactical patterns, opening recognition, and phase-specific accuracy.",
  },
  {
    num: "3",
    title: "Get Your Personalized Report",
    desc: "View interactive dashboards, download PDF coaching reports, get a training plan tailored to your exact weaknesses.",
  },
];

export default function Home() {
  const router = useRouter();
  const [backendStatus, setBackendStatus] = useState("checking");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Hero board state
  const [heroFen, setHeroFen] = useState(HERO_GAMES[0].fen);
  const [gameIdx, setGameIdx] = useState(0);
  const [badgeSquare, setBadgeSquare] = useState<string | null>(null);
  const [badgeSymbol, setBadgeSymbol] = useState("‼");
  const [badgeKey, setBadgeKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuFirstLinkRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("playerSession");
    if (raw) {
      try {
        const session = JSON.parse(raw);
        if (session.status === "approved") {
          router.push("/dashboard");
          return;
        }
      } catch {
        /* ignore */
      }
    }
    checkHealth().then((ok) => setBackendStatus(ok ? "online" : "offline"));
  }, [router]);

  // Game rotation
  useEffect(() => {
    const game = HERO_GAMES[gameIdx];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeroFen(game.fen);
    setBadgeSquare(null);
    const t1 = setTimeout(() => {
      setHeroFen(movePiece(game.fen, game.from, game.to));
      setBadgeSquare(game.to);
      setBadgeSymbol(game.symbol);
      setBadgeKey((k) => k + 1);
      const t2 = setTimeout(() => {
        setGameIdx((i) => (i + 1) % HERO_GAMES.length);
      }, 4200);
      timerRef.current = t2;
    }, 2200);
    timerRef.current = t1;
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameIdx]);

  // Move focus into the mobile menu when it opens
  useEffect(() => {
    if (mobileMenuOpen) {
      menuFirstLinkRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const game = HERO_GAMES[gameIdx];

  return (
    <div>
      <ParticleCanvas />

      {/* ── Navbar ── */}
      <nav className={styles.navbar}>
        <div className={styles.navBrand}>
          <div className={styles.navBrandIcon}>♛</div>
          <span className={styles.navBrandText}>
            Chess<span>Advisor</span>
          </span>
        </div>

        <ul className={styles.navLinks}>
          <li>
            <button
              className={styles.navLink}
              onClick={() => scrollTo("features")}
            >
              Features
            </button>
          </li>
          <li>
            <button
              className={styles.navLink}
              onClick={() => scrollTo("analytics")}
            >
              Analytics
            </button>
          </li>
          <li>
            <button
              className={styles.navLink}
              onClick={() => scrollTo("how-it-works")}
            >
              How It Works
            </button>
          </li>
          <li>
            <button className={styles.navLink} onClick={() => scrollTo("roles")}>
              About
            </button>
          </li>
        </ul>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.navLogin}>
            Login
          </Link>
          {/* Hamburger — mobile only */}
          <button
            className={styles.hamburgerBtn}
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <span className={mobileMenuOpen ? styles.hamburgerOpen : ""} />
            <span className={mobileMenuOpen ? styles.hamburgerOpen : ""} />
            <span className={mobileMenuOpen ? styles.hamburgerOpen : ""} />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className={styles.mobileMenuOverlay}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile menu drawer */}
      <div
        id="mobile-menu"
        className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onKeyDown={(e) => { if (e.key === "Escape") setMobileMenuOpen(false); }}
      >
        <div className={styles.mobileMenuHeader}>
          <div className={styles.navBrand}>
            <div className={styles.navBrandIcon}>♛</div>
            <span className={styles.navBrandText}>Chess<span>Advisor</span></span>
          </div>
          <button
            className={styles.mobileMenuClose}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <div className={styles.mobileMenuLinks}>
          <button ref={menuFirstLinkRef} className={styles.mobileMenuLink} onClick={() => { scrollTo("features"); setMobileMenuOpen(false); }}>Features</button>
          <button className={styles.mobileMenuLink} onClick={() => { scrollTo("analytics"); setMobileMenuOpen(false); }}>Analytics</button>
          <button className={styles.mobileMenuLink} onClick={() => { scrollTo("how-it-works"); setMobileMenuOpen(false); }}>How It Works</button>
          <button className={styles.mobileMenuLink} onClick={() => { scrollTo("roles"); setMobileMenuOpen(false); }}>About</button>
        </div>
        <div className={styles.mobileMenuActions}>
          <Link href="/login" className={styles.navLogin} onClick={() => setMobileMenuOpen(false)}>
            Login
          </Link>
          <Link href="/register" className={styles.mobileMenuRegister} onClick={() => setMobileMenuOpen(false)}>
            Sign Up
          </Link>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroContainer}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              Now Live — Chess Academy Platform
            </div>

            <h1 className={styles.heroTitle}>
              Your Chess Coach,{" "}
              <span className={styles.heroTitleAccent}>Powered by AI.</span>
            </h1>

            <p className={styles.heroDescription}>
              Deep Stockfish analysis. Real-time pattern detection. Move-by-move
              feedback. Built for serious students and the coaches who train
              them.
            </p>

            <div className={styles.heroCtas}>
              <Link href="/login" className={styles.btnGetStarted}>
                <ArrowRight size={15} strokeWidth={2} /> Get Started Free
              </Link>
              <Link href="/coach/login" className={styles.btnDemo}>
                <GraduationCap size={16} strokeWidth={1.75} /> Coach Login
              </Link>
            </div>

            <div className={styles.statsBar}>
              <div className={styles.statsGrid}>
                {[
                  { val: "99.4%", lbl: "Detection Accuracy" },
                  { val: "3000+", lbl: "Openings in DB" },
                  { val: "9", lbl: "Quality Tiers" },
                  { val: "50ms", lbl: "Avg Analysis Speed" },
                ].map((s) => (
                  <div key={s.lbl} className={styles.statCard}>
                    <div className={styles.statValue}>{s.val}</div>
                    <div className={styles.statLabel}>{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.heroRight}>
            <div className={styles.chessboardContainer}>
              {/* ── Live board ── */}
              <div className={styles.heroBoardWrapper}>
                <Chessboard
                  options={{
                    position: heroFen,
                    allowDragging: false,
                    animationDurationInMs: 600,
                    lightSquareStyle: { background: "rgba(240,217,181,0.92)" },
                    darkSquareStyle: { background: "rgba(181,136,99,0.92)" },
                    boardStyle: {
                      borderRadius: "8px",
                      boxShadow:
                        "0 0 0 1px rgba(255,255,255,0.24), 0 28px 80px rgba(0,0,0,0.72)",
                    },
                  }}
                />
                {badgeSquare && (
                  <div
                    key={badgeKey}
                    className={styles.moveBadge}
                    style={{
                      position: "absolute",
                      left: `${(badgeSquare.charCodeAt(0) - 97) * 12.5 + 10}%`,
                      top: `${(8 - parseInt(badgeSquare[1])) * 12.5 + 0.5}%`,
                      zIndex: 20,
                    }}
                  >
                    {badgeSymbol}
                  </div>
                )}
              </div>

              {/* ── Floating cards ── */}
              <div
                className={`${styles.floatingCard} ${styles.floatingCardMove}`}
              >
                <div className={styles.floatingCardLabel}>{game.c1label}</div>
                <div className={styles.floatingCardMoveName}>
                  {game.c1val}{" "}
                  <span className={styles.floatingCardMoveEval}>
                    {game.c1eval}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "0.70rem",
                    color: "#22c55e",
                  }}
                >
                  {game.c1sub}
                </div>
              </div>

              <div
                className={`${styles.floatingCard} ${styles.floatingCardAccuracy}`}
              >
                <div className={styles.floatingCardLabel}>{game.c2label}</div>
                <div
                  className={styles.floatingCardValue}
                  style={{ fontSize: "1.4rem" }}
                >
                  {game.c2val}
                </div>
                <div style={{ marginTop: "4px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "99px",
                      fontSize: "0.68rem",
                      fontWeight: "700",
                      background: "rgba(34,197,94,0.12)",
                      color: "#22c55e",
                    }}
                  >
                    {game.c2badge}
                  </span>
                </div>
              </div>

              <div
                className={`${styles.floatingCard} ${styles.floatingCardOpening}`}
              >
                <div className={styles.floatingCardLabel}>{game.c3label}</div>
                <div className={styles.floatingCardValue}>{game.c3val}</div>
                <div className={styles.floatingCardSub}>{game.c3sub}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionContainer}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
            Everything your chess academy needs
          </h2>
          <p className={styles.sectionSubCenter}>
            From raw PGN to detailed insight in seconds. Powered by Stockfish
            and a custom-trained vision model.
          </p>

          <div className={styles.bentoGrid}>
            {FEATURES.map((feat) => (
              <div
                key={feat.title}
                className={`${styles.bentoCard} ${feat.wide ? styles.bentoCardWide : ""}`}
              >
                <div className={styles.bentoIcon}><feat.Icon size={22} strokeWidth={1.5} /></div>
                <h3 className={styles.bentoTitle}>{feat.title}</h3>
                <p className={styles.bentoDescription}>{feat.desc}</p>
                <div className={styles.bentoTags}>
                  {feat.tags.map((tag) => (
                    <span key={tag} className={styles.bentoTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.sectionDivider} />

      {/* ── Analytics ── */}
      <div className={styles.analyticsSection} id="analytics">
        <div className={styles.sectionContainer}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
            Data-driven improvement, visualized
          </h2>
          <p className={styles.sectionSubCenter}>
            Every metric your coach needs. Every insight your student deserves.
          </p>

          <div className={styles.analyticsGrid}>
            <div className={styles.analyticsCard}>
              <div className={styles.analyticsCardTitle}>
                <BarChart3 size={14} strokeWidth={2} /> Performance Breakdown
              </div>
              {ANALYTICS_BARS.map((bar) => (
                <div key={bar.label} className={styles.statRow}>
                  <div className={styles.statRowHeader}>
                    <span className={styles.statRowLabel}>{bar.label}</span>
                    <span className={styles.statRowValue}>{bar.value}%</span>
                  </div>
                  <div className={styles.statBarTrack}>
                    <div
                      className={styles.statBarFill}
                      style={{ transform: `scaleX(${bar.value / 100})`, background: bar.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.analyticsCard}>
              <div className={styles.analyticsCardTitle}>
                🏆 Move Quality Distribution
              </div>
              {[
                { name: "Best / Excellent", pct: 42, color: "#22c55e" },
                { name: "Good", pct: 28, color: "#86efac" },
                { name: "Inaccuracies", pct: 16, color: "#f59e0b" },
                { name: "Mistakes", pct: 8, color: "#f97316" },
                { name: "Blunders", pct: 6, color: "#ef4444" },
              ].map((q) => (
                <div key={q.name} className={styles.statRow}>
                  <div className={styles.statRowHeader}>
                    <span className={styles.statRowLabel}>{q.name}</span>
                    <span className={styles.statRowValue}>{q.pct}%</span>
                  </div>
                  <div className={styles.statBarTrack}>
                    <div
                      className={styles.statBarFill}
                      style={{ transform: `scaleX(${q.pct / 100})`, background: q.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} />

      {/* ── Move Classification ── */}
      <section id="classification" className={styles.section}>
        <div className={styles.sectionContainer}>
          <div className={styles.classificationGrid}>
            <div className={styles.classificationLeft}>
              <div className={styles.sectionTag}>Move Classification</div>
              <h2 className={styles.classificationTitle}>
                9 quality tiers.
                <br />
                Zero ambiguity.
              </h2>
              <p className={styles.classificationDescription}>
                Every move is evaluated by Stockfish then classified using a
                dual-gate system — both centipawn loss and win-probability drop
                must cross the threshold.
              </p>
              <Link href="/login" className={styles.btnAnalyze}>
                Analyze Your Games →
              </Link>
            </div>

            <div className={styles.classificationTable}>
              {MOVE_TIERS.map((tier) => (
                <div key={tier.name} className={styles.classificationRow}>
                  <div className={styles.classificationRowLeft}>
                    <div
                      className={styles.classificationDot}
                      style={{ background: tier.color }}
                    />
                    <span className={styles.classificationName}>
                      {tier.name}
                    </span>
                  </div>
                  <div className={styles.classificationRowRight}>
                    <span className={styles.classificationDesc}>
                      {tier.desc}
                    </span>
                    <span
                      className={styles.classificationSymbol}
                      style={{ color: tier.color }}
                    >
                      {tier.symbol}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.sectionDivider} />

      {/* ── How It Works ── */}
      <section id="how-it-works" className={styles.section}>
        <div className={styles.sectionContainer}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
            From game to insight in 3 steps
          </h2>

          <div className={styles.stepsGrid}>
            {STEPS.map((step) => (
              <div key={step.num} className={styles.stepCard}>
                <div className={styles.stepNum}>{step.num}</div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepDesc}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.sectionDivider} />

      {/* ── Roles ── */}
      <section id="roles" className={styles.section}>
        <div className={styles.sectionContainer}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleCenter}`}>
            One platform. Two powerful roles.
          </h2>

          <div className={styles.rolesGrid}>
            <div className={styles.roleCard}>
              <div className={styles.roleIcon}><Crown size={22} strokeWidth={1.5} /></div>
              <h3 className={styles.roleTitle}>For Coaches</h3>
              <p className={styles.roleDescription}>
                Monitor every student from a single dashboard. Identify who
                needs the most attention and what to focus on in the next
                session.
              </p>
              <ul className={styles.roleFeatures}>
                {[
                  "Multi-student overview with accuracy, blunder rate, and momentum",
                  "Cohort benchmarking — see where each student stands vs their rating group",
                  "One-click PDF coaching reports for parent meetings",
                  "Track opening weaknesses, time pressure patterns, and recurring mistakes",
                ].map((f) => (
                  <li key={f} className={styles.roleFeatureItem}>
                    <span className={styles.roleFeatureIcon}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.roleCard}>
              <div className={styles.roleIcon}>♛</div>
              <h3 className={styles.roleTitle}>For Students</h3>
              <p className={styles.roleDescription}>
                Get a personal chess coach that never sleeps. Every game
                analyzed. Every blunder explained. Every improvement tracked.
              </p>
              <ul className={styles.roleFeatures}>
                {[
                  "Move-by-move analysis with best move suggestions powered by Stockfish",
                  "Opening repertoire analysis — which openings win more and which need work",
                  "Personalized training plan: puzzle themes, study focus, estimated time",
                  "Accuracy trend, phase performance, and momentum tracked across every game",
                ].map((f) => (
                  <li key={f} className={styles.roleFeatureItem}>
                    <span className={styles.roleFeatureIcon}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection} id="cta">
        <h2 className={styles.ctaTitle}>Ready to play like a grandmaster?</h2>
        <p className={styles.ctaDescription}>
          Connect your Chess.com or Lichess profile. Get your first analysis in
          under 60 seconds.
        </p>
        <div className={styles.ctaButtons}>
          <Link href="/login" className={styles.btnGetStarted}>
            <ArrowRight size={15} strokeWidth={2} /> Start Analyzing Now
          </Link>
          <Link href="/coach/login" className={styles.btnDemo}>
            <GraduationCap size={16} strokeWidth={1.75} /> Coach Login
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <div className={styles.footerLogoRow}>
                <div className={styles.footerBrandIcon}>♛</div>
                <div className={styles.footerLogoText}>
                  Chess<span>Advisor</span>
                </div>
              </div>
              <div className={styles.footerTagline}>
                Chess analytics built for academies, coaches, and serious
                students.
              </div>
              <div className={styles.footerStatus}>
                <div
                  className={`${styles.statusDot} ${
                    backendStatus === "online"
                      ? styles.statusOnline
                      : backendStatus === "checking"
                        ? styles.statusChecking
                        : styles.statusOffline
                  }`}
                />
                Backend{" "}
                {backendStatus === "online"
                  ? "Online"
                  : backendStatus === "checking"
                    ? "Checking…"
                    : "Offline"}
              </div>
            </div>

            <div className={styles.footerCol}>
              <div className={styles.footerHeading}>Platform</div>
              <ul className={styles.footerLinks}>
                {["Features", "Analytics", "How It Works", "Login"].map((l) => (
                  <li key={l}>
                    <button
                      className={styles.footerLink}
                      onClick={() =>
                        scrollTo(l.toLowerCase().replace(" ", "-"))
                      }
                    >
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.footerCol}>
              <div className={styles.footerHeading}>Account</div>
              <ul className={styles.footerLinks}>
                <li>
                  <Link href="/login" className={styles.footerLink}>
                    Player Login
                  </Link>
                </li>
                <li>
                  <Link href="/coach/login" className={styles.footerLink}>
                    Coach Login
                  </Link>
                </li>
                <li>
                  <Link href="/register" className={styles.footerLink}>
                    Register
                  </Link>
                </li>
                <li>
                  <Link href="/coach/register" className={styles.footerLink}>
                    Coach Register
                  </Link>
                </li>
              </ul>
            </div>

            <div className={styles.footerCol}>
              <div className={styles.footerHeading}>Analysis</div>
              <ul className={styles.footerLinks}>
                {[
                  "Move Quality",
                  "Opening DB",
                  "Pattern Detection",
                  "Training Plans",
                ].map((l) => (
                  <li key={l}>
                    <span className={styles.footerLink}>{l}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.footerCol}>
              <div className={styles.footerHeading}>Tech</div>
              <ul className={styles.footerLinks}>
                {[
                  "Stockfish Engine",
                  "YOLOv8 Vision",
                  "FastAPI Backend",
                  "Next.js Frontend",
                ].map((l) => (
                  <li key={l}>
                    <span className={styles.footerLink}>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <div className={styles.footerCopyright}>
              © 2026 ChessAdvisor — All rights reserved.
            </div>
            <div className={styles.footerSocials}>
              {[
                { href: "#", label: "GH", title: "GitHub" },
                { href: "#", label: "𝕏", title: "Twitter" },
                { href: "#", label: "in", title: "LinkedIn" },
                { href: "#", label: "✉", title: "Email" },
              ].map((s) => (
                <a
                  key={s.title}
                  href={s.href}
                  className={styles.footerSocialLink}
                  title={s.title}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
