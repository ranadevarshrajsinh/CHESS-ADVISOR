"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Crown, User, Lock, Mail, Eye, EyeOff, Loader2, Building, CheckCircle, XCircle } from "lucide-react";

type Tab = "player" | "coach" | "academy";

const TAB_META = {
  player:  { label: "♟ Player",   color: "var(--accent-color)", shadow: "rgba(29,193,137,0.3)",  bg: "linear-gradient(135deg,#10b981,#34d399)" },
  coach:   { label: "♛ Coach",    color: "#6366f1",             shadow: "rgba(99,102,241,0.3)",  bg: "linear-gradient(135deg,#6366f1,#818cf8)" },
  academy: { label: "🏫 Academy",  color: "#f59e0b",             shadow: "rgba(245,158,11,0.3)",  bg: "linear-gradient(135deg,#f59e0b,#fbbf24)" },
} as const;

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ color: "var(--danger)", fontSize: "13px", background: "rgba(239,68,68,0.08)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
      {message}
    </div>
  );
}

interface DropdownProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  icon: React.ReactNode;
  activeColor: string;
}

function CustomDropdown({ label, value, onChange, options, placeholder, disabled, icon, activeColor }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label className="input-label">{label}</label>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: activeColor, opacity: 0.7, pointerEvents: "none", display: "flex", alignItems: "center", zIndex: 2 }}>
          {icon}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "12px 42px 12px 46px",
            background: "var(--input-bg)",
            border: isOpen || isFocused ? "1px solid rgba(255, 255, 255, 0.52)" : "1px solid var(--input-border)",
            borderRadius: "var(--radius-sm)",
            color: selectedOption ? "var(--text-primary)" : "var(--text-secondary)",
            fontSize: "15px",
            boxShadow: isOpen || isFocused ? "0 0 0 3px rgba(255, 255, 255, 0.1)" : "none",
            transition: "all 0.3s ease",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `5px solid ${isOpen ? "rgba(255,255,255,0.7)" : "var(--text-secondary)"}`,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease, border-top-color 0.2s ease",
              marginLeft: "8px",
            }}
          />
        </button>
        {isOpen && (
          <div
            className="animate-fade-in"
            style={{
              position: "absolute", top: "100%", left: 0, width: "100%", maxHeight: "220px",
              overflowY: "auto", marginTop: "6px", zIndex: 100, padding: "6px",
              border: "1px solid var(--border-subtle)", boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
              borderRadius: "12px", background: "var(--surface-2)",
            }}
          >
            {options.length === 0 ? (
              <div style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: "14px" }}>No options available</div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setIsOpen(false); setIsFocused(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      background: isSelected ? "var(--surface-1)" : "transparent",
                      color: isSelected ? "var(--text-primary)" : "var(--text-primary)",
                      border: isSelected ? "1px solid var(--border-medium)" : "1px solid transparent",
                      borderRadius: "8px", fontSize: "14px", fontWeight: isSelected ? "600" : "400",
                      cursor: "pointer", transition: "all 0.2s ease", marginBottom: "2px",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label, type = "text", placeholder, value, onChange, onFocus, onBlur, icon, focused, activeColor,
  disabled, required, autoComplete, rightSlot,
}: {
  label: string; type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; onFocus: () => void; onBlur: () => void;
  icon: React.ReactNode; focused: boolean; activeColor: string;
  disabled?: boolean; required?: boolean; autoComplete?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div>
      <label className="input-label">{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: "16px", color: activeColor, opacity: 0.7, pointerEvents: "none", display: "flex" }}>
          {icon}
        </div>
        <input
          className="input-field"
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          style={{
            paddingLeft: "46px",
            paddingRight: rightSlot ? "46px" : undefined,
            border: focused ? `1px solid ${activeColor}` : "1px solid var(--input-border)",
            boxShadow: focused ? `0 0 0 3px ${activeColor}26` : "none",
            transition: "all 0.3s ease",
          }}
        />
        {rightSlot && <div style={{ position: "absolute", right: "12px" }}>{rightSlot}</div>}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, onFocus, onBlur, focused, activeColor, disabled, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  onFocus: () => void; onBlur: () => void; focused: boolean;
  activeColor: string; disabled?: boolean; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <InputField
      label={label} type={show ? "text" : "password"} placeholder="Min. 8 characters"
      value={value} onChange={onChange} onFocus={onFocus} onBlur={onBlur}
      icon={<Lock size={18} />} focused={focused} activeColor={activeColor}
      disabled={disabled} required autoComplete={autoComplete}
      rightSlot={
        <button type="button" onClick={() => setShow(!show)} style={{ background: "none", border: "none", padding: "4px", color: "var(--text-secondary)", display: "flex", cursor: "pointer", borderRadius: "6px" }}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "player";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // ── Player state ──
  const [pFullName, setPFullName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pLichessUsername, setPLichessUsername] = useState("");
  const [pActivePlatform, setPActivePlatform] = useState<"chess.com" | "lichess">("chess.com");
  const [pInviteCode, setPInviteCode] = useState("");
  const [pCoachId, setPCoachId] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [resolvedCoachName, setResolvedCoachName] = useState("");
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pSuccess, setPSuccess] = useState(false);

  // ── Coach state ──
  const [cFullName, setCFullName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cConfirm, setCConfirm] = useState("");
  const [cAffiliation, setCAffiliation] = useState<"independent" | "academy">("independent");
  const [cAcademyCode, setCAcademyCode] = useState("");
  const [cAcademyId, setCAcademyId] = useState("");
  const [cAcademyCodeStatus, setCAcademyCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [cAcademyName, setCAcademyName] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");

  // ── Academy state ──
  const [aName, setAName] = useState("");
  const [aCity, setACity] = useState("");
  const [aDesc, setADesc] = useState("");
  const [aFullName, setAFullName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPassword, setAPassword] = useState("");
  const [aConfirm, setAConfirm] = useState("");
  const [aLoading, setALoading] = useState(false);
  const [aError, setAError] = useState("");

  const focus = (f: string) => () => setFocusedField(f);
  const blur = () => setFocusedField(null);
  const isFocused = (f: string) => focusedField === f;

  useEffect(() => {
    const code = cAcademyCode.replace("-", "");
    if (code.length < 8) {
      setCAcademyCodeStatus("idle");
      setCAcademyName("");
      setCAcademyId("");
      return;
    }
    const timer = setTimeout(async () => {
      setCAcademyCodeStatus("checking");
      const res = await fetch(`/api/academies/by-invite-code?code=${encodeURIComponent(cAcademyCode.toUpperCase().trim())}`);
      if (res.ok) {
        const data = await res.json();
        setCAcademyId(data.academyId);
        setCAcademyName(data.academyName);
        setCAcademyCodeStatus("valid");
      } else {
        setCAcademyId("");
        setCAcademyName("");
        setCAcademyCodeStatus("invalid");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cAcademyCode]);

  useEffect(() => {
    const code = pInviteCode.replace("-", "");
    if (code.length < 8) { setCodeStatus("idle"); setResolvedCoachName(""); setPCoachId(""); return; }
    const timer = setTimeout(async () => {
      setCodeStatus("checking");
      const res = await fetch(`/api/coaches/by-invite-code?code=${encodeURIComponent(pInviteCode.toUpperCase().trim())}`);
      if (res.ok) {
        const data = await res.json();
        setPCoachId(data.coachId);
        setResolvedCoachName(data.coachName);
        setCodeStatus("valid");
      } else {
        setPCoachId(""); setResolvedCoachName(""); setCodeStatus("invalid");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [pInviteCode]);

  const redirectToCheckEmail = (email: string) =>
    router.push(`/verify-email-sent?email=${encodeURIComponent(email)}`);

  // ── Player submit ──
  const handlePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPError("");
    if (!pCoachId) { setPError("Please enter a valid invite code."); return; }
    const chessUsername = pUsername.trim().toLowerCase();
    const lichessUsername = pLichessUsername.trim().toLowerCase();
    if (!chessUsername && !lichessUsername) {
      setPError("Enter your Chess.com or Lichess username (at least one).");
      return;
    }
    setPLoading(true);

    const activePlatform = chessUsername && lichessUsername ? pActivePlatform : (chessUsername ? "chess.com" : "lichess");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "player",
        email: pEmail,
        fullName: pFullName.trim(),
        chessUsername: chessUsername || undefined,
        lichessUsername: lichessUsername || undefined,
        activePlatform,
        coachId: pCoachId,
      }),
    });
    const data = await res.json();
    setPLoading(false);
    if (!res.ok) { setPError(data.error ?? "Registration failed."); return; }
    if (data.preApproved) {
      router.push("/login?ready=1");
      return;
    }
    setPSuccess(true);
  };

  // ── Coach submit ──
  const handleCoachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCError("");
    if (cPassword !== cConfirm) { setCError("Passwords do not match."); return; }
    if (cPassword.length < 8) { setCError("Password must be at least 8 characters."); return; }
    if (cAffiliation === "academy" && !cAcademyId) {
      setCError("Please enter a valid academy invite code.");
      return;
    }
    setCLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "coach", email: cEmail, password: cPassword, fullName: cFullName.trim(), academyId: cAffiliation === "academy" ? cAcademyId : undefined }),
    });
    const data = await res.json();
    setCLoading(false);
    if (!res.ok) { setCError(data.error ?? "Registration failed."); return; }
    redirectToCheckEmail(cEmail);
  };

  // ── Academy submit ──
  const handleAcademySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAError("");
    if (aPassword !== aConfirm) { setAError("Passwords do not match."); return; }
    if (aPassword.length < 8) { setAError("Password must be at least 8 characters."); return; }
    if (!aName.trim()) { setAError("Academy name is required."); return; }
    setALoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "academy_owner", email: aEmail, password: aPassword, fullName: aFullName.trim(), academyName: aName.trim(), academyCity: aCity.trim() || undefined, academyDescription: aDesc.trim() || undefined }),
    });
    const data = await res.json();
    setALoading(false);
    if (!res.ok) { setAError(data.error ?? "Registration failed."); return; }
    redirectToCheckEmail(aEmail);
  };

  const meta = TAB_META[tab];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        className="glass animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "40px 32px",
          borderRadius: "24px",
          border: `1px solid ${meta.color}33`,
          boxShadow: `0 20px 40px ${meta.shadow}1a, var(--glass-shadow)`,
          transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "18px", border: `1px solid ${meta.color}4d`, padding: "4px", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: `0 8px 24px ${meta.shadow}` }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "13px", background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)" }}>
              <Crown size={26} style={{ color: "#fff" }} />
            </div>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", color: "var(--text-primary)", marginBottom: "4px" }}>
            Create Account
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Join Chess Advisor</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "24px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "4px" }}>
          {(["player", "coach", "academy"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: "12px",
                fontWeight: tab === t ? "700" : "500",
                background: tab === t ? TAB_META[t].bg : "transparent",
                color: tab === t ? "#fff" : "var(--text-secondary)",
                border: "none",
                borderRadius: "9px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: tab === t ? `0 2px 8px ${TAB_META[t].shadow}` : "none",
              }}
            >
              {TAB_META[t].label}
            </button>
          ))}
        </div>

        {/* Player Form */}
        {tab === "player" && pSuccess && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: "linear-gradient(135deg,#10b981,#34d399)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(16,185,129,0.3)" }}>
              <CheckCircle size={30} style={{ color: "#fff" }} />
            </div>
            <h2 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-primary)" }}>Registration Submitted!</h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
              Your request has been sent to{" "}
              <strong style={{ color: "var(--accent-color)" }}>{resolvedCoachName || "your coach"}</strong>.
              Once approved, you will receive an email to access your account.
            </p>
          </div>
        )}
        {tab === "player" && !pSuccess && (
          <form onSubmit={handlePlayerSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <InputField label="Full Name" placeholder="Your full name" value={pFullName} onChange={setPFullName} onFocus={focus("p-name")} onBlur={blur} icon={<User size={18} />} focused={isFocused("p-name")} activeColor={meta.color} disabled={pLoading} required />

            {/* Chess platforms */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "12px" }}>
              <InputField label="Chess.com Username" placeholder="your_username (optional)" value={pUsername} onChange={setPUsername} onFocus={focus("p-uname")} onBlur={blur} icon={<User size={18} />} focused={isFocused("p-uname")} activeColor={meta.color} disabled={pLoading} autoComplete="username" />
              <InputField label="Lichess Username" placeholder="your_username (optional)" value={pLichessUsername} onChange={setPLichessUsername} onFocus={focus("p-luname")} onBlur={blur} icon={<User size={18} />} focused={isFocused("p-luname")} activeColor={meta.color} disabled={pLoading} autoComplete="username" />
              <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>Add at least one — link both if you play on both.</p>

              {pUsername.trim() && pLichessUsername.trim() && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label className="input-label">Default platform</label>
                  <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px" }}>
                    <button
                      type="button"
                      disabled={pLoading}
                      onClick={() => setPActivePlatform("chess.com")}
                      style={{
                        flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: pActivePlatform === "chess.com" ? "700" : "500",
                        background: pActivePlatform === "chess.com" ? "rgba(16,185,129,0.18)" : "transparent",
                        color: pActivePlatform === "chess.com" ? "#34d399" : "var(--text-secondary)",
                        border: pActivePlatform === "chess.com" ? "1px solid rgba(16,185,129,0.35)" : "1px solid transparent",
                        borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                      }}
                    >
                      Chess.com
                    </button>
                    <button
                      type="button"
                      disabled={pLoading}
                      onClick={() => setPActivePlatform("lichess")}
                      style={{
                        flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: pActivePlatform === "lichess" ? "700" : "500",
                        background: pActivePlatform === "lichess" ? "rgba(16,185,129,0.18)" : "transparent",
                        color: pActivePlatform === "lichess" ? "#34d399" : "var(--text-secondary)",
                        border: pActivePlatform === "lichess" ? "1px solid rgba(16,185,129,0.35)" : "1px solid transparent",
                        borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                      }}
                    >
                      Lichess
                    </button>
                  </div>
                </div>
              )}
            </div>

            <InputField label="Email" type="email" placeholder="you@example.com" value={pEmail} onChange={setPEmail} onFocus={focus("p-email")} onBlur={blur} icon={<Mail size={18} />} focused={isFocused("p-email")} activeColor={meta.color} disabled={pLoading} required autoComplete="email" />

            {/* Invite code */}
            <div>
              <label className="input-label">Coach Invite Code</label>
              <div style={{ position: "relative" }}>
                <input
                  className="input-field"
                  placeholder="XXXX-XXXX"
                  value={pInviteCode}
                  onChange={(e) => setPInviteCode(e.target.value)}
                  disabled={pLoading}
                  required
                  style={{
                    paddingRight: "36px",
                    border: codeStatus === "valid" ? "1px solid #10b981" : codeStatus === "invalid" ? "1px solid var(--danger)" : "1px solid var(--input-border)",
                    boxShadow: codeStatus === "valid" ? "0 0 0 3px rgba(16,185,129,0.15)" : codeStatus === "invalid" ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
                    transition: "all 0.3s ease",
                  }}
                />
                <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                  {codeStatus === "checking" && <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-secondary)" }} />}
                  {codeStatus === "valid" && <CheckCircle size={16} style={{ color: "#10b981" }} />}
                  {codeStatus === "invalid" && <XCircle size={16} style={{ color: "var(--danger)" }} />}
                </div>
              </div>
              {codeStatus === "valid" && <p style={{ fontSize: "12px", color: "#10b981", marginTop: "4px" }}>Coach: {resolvedCoachName}</p>}
              {codeStatus === "invalid" && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "4px" }}>Invalid or inactive invite code</p>}
            </div>

            {pError && <ErrorBox message={pError} />}
            <SubmitButton loading={pLoading} color={meta.bg} shadow={meta.shadow} label="Create Player Account" />
          </form>
        )}

        {/* Coach Form */}
        {tab === "coach" && (
          <form onSubmit={handleCoachSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <InputField label="Full Name" placeholder="Your full name" value={cFullName} onChange={setCFullName} onFocus={focus("c-name")} onBlur={blur} icon={<User size={18} />} focused={isFocused("c-name")} activeColor={meta.color} disabled={cLoading} required />
            <InputField label="Email" type="email" placeholder="you@example.com" value={cEmail} onChange={setCEmail} onFocus={focus("c-email")} onBlur={blur} icon={<Mail size={18} />} focused={isFocused("c-email")} activeColor={meta.color} disabled={cLoading} required autoComplete="email" />
            <PasswordField label="Password" value={cPassword} onChange={setCPassword} onFocus={focus("c-pass")} onBlur={blur} focused={isFocused("c-pass")} activeColor={meta.color} disabled={cLoading} autoComplete="new-password" />
            <PasswordField label="Confirm Password" value={cConfirm} onChange={setCConfirm} onFocus={focus("c-conf")} onBlur={blur} focused={isFocused("c-conf")} activeColor={meta.color} disabled={cLoading} autoComplete="new-password" />

            {/* Affiliation toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label className="input-label">Affiliation</label>
              <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px" }}>
                <button
                  type="button"
                  disabled={cLoading}
                  onClick={() => { setCAffiliation("independent"); setCAcademyCode(""); setCAcademyId(""); setCAcademyCodeStatus("idle"); setCAcademyName(""); }}
                  style={{
                    flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: cAffiliation === "independent" ? "700" : "500",
                    background: cAffiliation === "independent" ? "rgba(99,102,241,0.18)" : "transparent",
                    color: cAffiliation === "independent" ? "#818cf8" : "var(--text-secondary)",
                    border: cAffiliation === "independent" ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
                    borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  Independent
                </button>
                <button
                  type="button"
                  disabled={cLoading}
                  onClick={() => setCAffiliation("academy")}
                  style={{
                    flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: cAffiliation === "academy" ? "700" : "500",
                    background: cAffiliation === "academy" ? "rgba(99,102,241,0.18)" : "transparent",
                    color: cAffiliation === "academy" ? "#818cf8" : "var(--text-secondary)",
                    border: cAffiliation === "academy" ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
                    borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  Join Academy
                </button>
              </div>
            </div>

            {/* Academy invite code — shown only when joining an academy */}
            {cAffiliation === "academy" && (
              <div>
                <label className="input-label">Academy Invite Code</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input-field"
                    placeholder="XXXX-XXXX"
                    value={cAcademyCode}
                    onChange={(e) => setCAcademyCode(e.target.value)}
                    disabled={cLoading}
                    required
                    style={{
                      paddingRight: "36px",
                      border: cAcademyCodeStatus === "valid" ? "1px solid #10b981" : cAcademyCodeStatus === "invalid" ? "1px solid var(--danger)" : "1px solid var(--input-border)",
                      boxShadow: cAcademyCodeStatus === "valid" ? "0 0 0 3px rgba(16,185,129,0.15)" : cAcademyCodeStatus === "invalid" ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
                      transition: "all 0.3s ease",
                    }}
                  />
                  <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                    {cAcademyCodeStatus === "checking" && <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-secondary)" }} />}
                    {cAcademyCodeStatus === "valid" && <CheckCircle size={16} style={{ color: "#10b981" }} />}
                    {cAcademyCodeStatus === "invalid" && <XCircle size={16} style={{ color: "var(--danger)" }} />}
                  </div>
                </div>
                {cAcademyCodeStatus === "valid" && <p style={{ fontSize: "12px", color: "#10b981", marginTop: "4px" }}>Academy: {cAcademyName}</p>}
                {cAcademyCodeStatus === "invalid" && <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "4px" }}>Invalid or inactive academy code</p>}
              </div>
            )}

            {cError && <ErrorBox message={cError} />}
            <SubmitButton loading={cLoading} color={meta.bg} shadow={meta.shadow} label="Create Coach Account" />
          </form>
        )}

        {/* Academy Form */}
        {tab === "academy" && (
          <form onSubmit={handleAcademySubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <InputField label="Your Full Name" placeholder="Owner's full name" value={aFullName} onChange={setAFullName} onFocus={focus("a-name")} onBlur={blur} icon={<User size={18} />} focused={isFocused("a-name")} activeColor={meta.color} disabled={aLoading} required />
            <InputField label="Email" type="email" placeholder="you@example.com" value={aEmail} onChange={setAEmail} onFocus={focus("a-email")} onBlur={blur} icon={<Mail size={18} />} focused={isFocused("a-email")} activeColor={meta.color} disabled={aLoading} required autoComplete="email" />
            <PasswordField label="Password" value={aPassword} onChange={setAPassword} onFocus={focus("a-pass")} onBlur={blur} focused={isFocused("a-pass")} activeColor={meta.color} disabled={aLoading} autoComplete="new-password" />
            <PasswordField label="Confirm Password" value={aConfirm} onChange={setAConfirm} onFocus={focus("a-conf")} onBlur={blur} focused={isFocused("a-conf")} activeColor={meta.color} disabled={aLoading} autoComplete="new-password" />
            <InputField label="Academy Name" placeholder="e.g. King's Chess Academy" value={aName} onChange={setAName} onFocus={focus("a-aname")} onBlur={blur} icon={<Building size={18} />} focused={isFocused("a-aname")} activeColor={meta.color} disabled={aLoading} required />
            <InputField label="City (optional)" placeholder="e.g. Mumbai" value={aCity} onChange={setACity} onFocus={focus("a-city")} onBlur={blur} icon={<Building size={18} />} focused={isFocused("a-city")} activeColor={meta.color} disabled={aLoading} />
            {aError && <ErrorBox message={aError} />}
            <SubmitButton loading={aLoading} color={meta.bg} shadow={meta.shadow} label="Create Academy Account" />
          </form>
        )}

        <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)", marginTop: "20px" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: meta.color, fontWeight: "600" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function SubmitButton({ loading, color, shadow, label }: { loading: boolean; color: string; shadow: string; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%", padding: "13px", fontSize: "15px", fontWeight: "600",
        background: color, color: "#fff", borderRadius: "12px", border: "none",
        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.8 : 1,
        boxShadow: `0 4px 14px ${shadow}`, transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 6px 20px ${shadow}`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 14px ${shadow}`; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0) scale(1)"; }}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : <>{label} <span style={{ fontSize: "16px" }}>→</span></>}
    </button>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
