"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Crown, User, Lock, Mail, Eye, EyeOff, Loader2, School, UserCheck, Award, Building, CheckCircle, XCircle } from "lucide-react";

type Tab = "player" | "coach" | "academy";

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}`;
}

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
  activeShadow: string;
}

function CustomDropdown({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  icon,
  activeColor,
  activeShadow,
}: DropdownProps) {
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
        <div
          style={{
            position: "absolute",
            left: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            color: activeColor,
            opacity: 0.7,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            zIndex: 2,
          }}
        >
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
            position: "relative",
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
              borderTop: `5px solid ${isOpen ? "rgba(255, 255, 255, 0.7)" : "var(--text-secondary)"}`,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease, border-top-color 0.2s ease",
              marginLeft: "8px",
            }}
          />
        </button>

        {isOpen && (
          <div
            className="glass animate-fade-in"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              width: "100%",
              maxHeight: "220px",
              overflowY: "auto",
              marginTop: "6px",
              zIndex: 100,
              padding: "6px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
              borderRadius: "12px",
              backdropFilter: "blur(20px)",
              background: "rgba(10, 10, 10, 0.8)",
            }}
          >
            {options.length === 0 ? (
              <div style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: "14px" }}>
                No options available
              </div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setIsFocused(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: isSelected ? "rgba(255, 255, 255, 0.08)" : "transparent",
                      color: isSelected ? "#fff" : "var(--text-primary)",
                      border: isSelected ? "1px solid rgba(255, 255, 255, 0.6)" : "1px solid transparent",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: isSelected ? "600" : "400",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      marginBottom: "2px",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
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


function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "player";
  const [tab, setTab] = useState<Tab>(initialTab);

  // ── UI States ──
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [linkHovered, setLinkHovered] = useState(false);

  // ── Player state ──
  const [pFullName, setPFullName] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pInviteCode, setPInviteCode] = useState("");
  const [pCoachId, setPCoachId] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [resolvedCoachName, setResolvedCoachName] = useState("");
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pErrorLoginLink, setPErrorLoginLink] = useState(false);

  // ── Coach state ──
  const [cFullName, setCFullName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cConfirm, setCConfirm] = useState("");
  const [cAcademyId, setCAcademyId] = useState("");
  const [academies, setAcademies] = useState<{ id: string; name: string }[]>([]);
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

  useEffect(() => {
    supabase.from("academies").select("id, name").eq("status", "approved").order("name")
      .then(({ data }) => { if (data) setAcademies(data); });
  }, []);

  useEffect(() => {
    if (pInviteCode.replace("-", "").length < 8) {
      setCodeStatus("idle"); setResolvedCoachName(""); setPCoachId(""); return;
    }
    const timer = setTimeout(async () => {
      setCodeStatus("checking");
      const { data } = await supabase
        .from("profiles").select("id, full_name")
        .eq("invite_code", pInviteCode.toUpperCase().trim())
        .eq("role", "coach").eq("status", "approved").single();
      if (data) { setPCoachId(data.id); setResolvedCoachName(data.full_name); setCodeStatus("valid"); }
      else { setPCoachId(""); setResolvedCoachName(""); setCodeStatus("invalid"); }
    }, 500);
    return () => clearTimeout(timer);
  }, [pInviteCode]);

  // ── Player submit ──
  const handlePlayerSubmit = async (e) => {
    e.preventDefault();
    setPError("");
    setPErrorLoginLink(false);
    if (!pFullName.trim() || !pUsername.trim() || !pCoachId) { setPError("Please fill in all fields and enter a valid invite code."); return; }
    setPLoading(true);

    const { data: existing } = await supabase.from("players").select("id, status").eq("chess_username", pUsername.trim().toLowerCase()).single();
    if (existing) {
      if (existing.status === "approved") {
        setPError("This username is already registered and approved.");
        setPErrorLoginLink(true);
      } else {
        setPError("This username is already registered and pending approval.");
      }
      setPLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("players").insert({
      chess_username: pUsername.trim().toLowerCase(),
      full_name: pFullName.trim(),
      coach_id: pCoachId,
      status: "pending",
    });

    if (insertError) { setPError(insertError.message); setPLoading(false); return; }

    localStorage.setItem("playerSession", JSON.stringify({
      chess_username: pUsername.trim().toLowerCase(),
      full_name: pFullName.trim(),
      coach_id: pCoachId,
      status: "pending",
    }));
    router.push("/pending");
  };

  // ── Coach submit ──
  const handleCoachSubmit = async (e) => {
    e.preventDefault();
    setCError("");
    if (cPassword !== cConfirm) { setCError("Passwords do not match."); return; }
    if (cPassword.length < 8) { setCError("Password must be at least 8 characters."); return; }
    setCLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cEmail,
      password: cPassword,
      options: { data: { full_name: cFullName.trim() } },
    });

    if (signUpError || !data.user) { setCError(signUpError?.message ?? "Sign up failed."); setCLoading(false); return; }
    if (data.user?.identities?.length === 0) {
      setCError("This email is already registered. Please log in instead.");
      setCLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: cEmail.trim(),
      full_name: cFullName.trim(),
      role: "coach",
      academy_id: cAcademyId || null,
      status: cAcademyId ? "pending" : "approved",
      invite_code: generateInviteCode(),
    });

    if (profileError) {
      setCError(profileError.message || "Failed to create profile.");
      setCLoading(false);
      return;
    }

    setCLoading(false);
    router.push(cAcademyId ? "/coach/pending" : "/login");
  };

  // ── Academy submit ──
  const handleAcademySubmit = async (e) => {
    e.preventDefault();
    setAError("");
    if (aPassword !== aConfirm) { setAError("Passwords do not match."); return; }
    if (aPassword.length < 8) { setAError("Password must be at least 8 characters."); return; }
    if (!aName.trim()) { setAError("Academy name is required."); return; }
    setALoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: aEmail,
      password: aPassword,
      options: { data: { full_name: aFullName.trim() } },
    });

    if (signUpError || !data.user) { setAError(signUpError?.message ?? "Sign up failed."); setALoading(false); return; }
    if (data.user?.identities?.length === 0) {
      setAError("This email is already registered. Please log in instead.");
      setALoading(false);
      return;
    }

    const { data: academy, error: academyError } = await supabase.from("academies").insert({
      name: aName.trim(),
      city: aCity.trim() || null,
      description: aDesc.trim() || null,
      owner_id: data.user.id,
      status: "pending",
    }).select().single();

    if (academyError || !academy) { setAError(academyError?.message ?? "Failed to create academy."); setALoading(false); return; }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: aEmail.trim(),
      full_name: aFullName.trim(),
      role: "academy_owner",
      academy_id: academy.id,
      status: "pending",
    });

    if (profileError) {
      setAError(profileError.message || "Failed to create profile.");
      setALoading(false);
      return;
    }

    setALoading(false);
    router.push("/academy/pending");
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
        background: tab === "player"
          ? "radial-gradient(circle at 50% 40%, rgba(29,193,137,0.1) 0%, transparent 65%)"
          : tab === "academy"
          ? "radial-gradient(circle at 50% 40%, rgba(245,158,11,0.1) 0%, transparent 65%)"
          : "radial-gradient(circle at 50% 40%, rgba(99,102,241,0.1) 0%, transparent 65%)",
        transition: "background 0.4s ease",
      }}
    >
      <div
        className="glass animate-fade-in"
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "40px 32px",
          borderRadius: "24px",
          border: "1px solid " + (tab === "player" ? "rgba(29, 193, 137, 0.2)" : tab === "coach" ? "rgba(99, 102, 241, 0.2)" : "rgba(245, 158, 11, 0.2)"),
          boxShadow: tab === "player"
            ? "0 20px 40px rgba(29, 193, 137, 0.05), var(--glass-shadow)"
            : tab === "coach"
            ? "0 20px 40px rgba(99, 102, 241, 0.05), var(--glass-shadow)"
            : "0 20px 40px rgba(245, 158, 11, 0.05), var(--glass-shadow)",
          transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        }}
      >
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              border: "1px solid " + (tab === "player" ? "rgba(29, 193, 137, 0.3)" : tab === "coach" ? "rgba(99, 102, 241, 0.3)" : "rgba(245, 158, 11, 0.3)"),
              padding: "5px",
              background: "rgba(255, 255, 255, 0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: tab === "player"
                ? "0 8px 24px rgba(29, 193, 137, 0.15)"
                : tab === "coach"
                ? "0 8px 24px rgba(99, 102, 241, 0.15)"
                : "0 8px 24px rgba(245, 158, 11, 0.15)",
              transition: "all 0.4s ease",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "14px",
                background: meta.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.2)",
              }}
            >
              {tab === "player" ? (
                <User size={28} style={{ color: "#fff" }} />
              ) : tab === "coach" ? (
                <Crown size={28} style={{ color: "#fff" }} />
              ) : (
                <School size={28} style={{ color: "#fff" }} />
              )}
            </div>
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "800",
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            Create Account
          </h1>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "6px",
            borderRadius: "14px",
            marginBottom: "28px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.2)",
          }}
        >
          {(Object.keys(TAB_META) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "10px 6px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: "600",
                background: tab === t ? meta.bg : "transparent",
                color: tab === t ? "#fff" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                boxShadow: tab === t ? `0 4px 12px ${TAB_META[t].shadow}` : "none",
                transform: tab === t ? "scale(1)" : "scale(0.97)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              {t === "player" ? "♟ Player" : t === "coach" ? "♛ Coach" : "🏫 Academy"}
            </button>
          ))}
        </div>

        {/* ── Player Form ── */}
        {tab === "player" && (
          <form onSubmit={handlePlayerSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label className="input-label">Full Name</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <User
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type="text"
                  placeholder="Your full name"
                  value={pFullName}
                  onChange={(e) => setPFullName(e.target.value)}
                  disabled={pLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    border:
                      focusedField === "pFullName" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "pFullName" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("pFullName")}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
            <div>
              <label className="input-label">Chess.com Username</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <UserCheck
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type="text"
                  placeholder="Your Chess.com username"
                  value={pUsername}
                  onChange={(e) => setPUsername(e.target.value)}
                  disabled={pLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    border:
                      focusedField === "pUsername" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "pUsername" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("pUsername")}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label className="input-label">Coach Invite Code</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Award
                  size={18}
                  style={{ position: "absolute", left: "16px", color: meta.color, opacity: 0.7, pointerEvents: "none" }}
                />
                <input
                  className="input-field"
                  type="text"
                  placeholder="e.g. ABCD-1234"
                  value={pInviteCode}
                  onChange={(e) => setPInviteCode(e.target.value.toUpperCase())}
                  disabled={pLoading}
                  maxLength={9}
                  style={{
                    paddingLeft: "46px",
                    paddingRight: "46px",
                    border:
                      codeStatus === "valid"
                        ? "1px solid var(--accent-color)"
                        : codeStatus === "invalid"
                        ? "1px solid var(--danger)"
                        : focusedField === "pInviteCode"
                        ? `1px solid ${meta.color}`
                        : "1px solid var(--input-border)",
                    boxShadow:
                      codeStatus === "valid"
                        ? "0 0 0 3px rgba(29,193,137,0.15)"
                        : codeStatus === "invalid"
                        ? "0 0 0 3px rgba(239,68,68,0.15)"
                        : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("pInviteCode")}
                  onBlur={() => setFocusedField(null)}
                />
                <div style={{ position: "absolute", right: "14px", display: "flex", alignItems: "center" }}>
                  {codeStatus === "checking" && <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-secondary)" }} />}
                  {codeStatus === "valid" && <CheckCircle size={16} style={{ color: "var(--accent-color)" }} />}
                  {codeStatus === "invalid" && <XCircle size={16} style={{ color: "var(--danger)" }} />}
                </div>
              </div>
              {codeStatus === "valid" && (
                <p style={{ fontSize: "12px", color: "var(--accent-color)", marginTop: "2px" }}>
                  Coach: {resolvedCoachName}
                </p>
              )}
              {codeStatus === "invalid" && (
                <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>
                  Invalid or unrecognised invite code.
                </p>
              )}
            </div>
            {pError && (
              <div style={{ color: "var(--danger)", fontSize: "13px", background: "rgba(239,68,68,0.08)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
                {pError}{" "}
                {pErrorLoginLink && (
                  <Link href="/login" style={{ color: "var(--danger)", fontWeight: "700", textDecoration: "underline" }}>
                    Go to login →
                  </Link>
                )}
              </div>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "15px",
                fontWeight: "600",
                background: meta.bg,
                color: "#fff",
                borderRadius: "12px",
                border: "none",
                boxShadow: `0 4px 14px ${meta.shadow}`,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: pLoading ? "not-allowed" : "pointer",
                opacity: pLoading ? 0.8 : 1,
              }}
              disabled={pLoading}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = `0 6px 20px ${meta.shadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 4px 14px ${meta.shadow}`;
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(1px) scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              {pLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Register & Request Approval
                  <span style={{ fontSize: "16px" }}>→</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* ── Coach Form ── */}
        {tab === "coach" && (
          <form onSubmit={handleCoachSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label className="input-label">Full Name</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <User
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type="text"
                  placeholder="Your full name"
                  value={cFullName}
                  onChange={(e) => setCFullName(e.target.value)}
                  disabled={cLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    border:
                      focusedField === "cFullName" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "cFullName" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("cFullName")}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
            <div>
              <label className="input-label">Email Address</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Mail
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type="email"
                  placeholder="you@example.com"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  disabled={cLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    border:
                      focusedField === "cEmail" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "cEmail" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("cEmail")}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
            <div>
              <label className="input-label">Password</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Lock
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                  disabled={cLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    paddingRight: "46px",
                    border:
                      focusedField === "cPassword" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "cPassword" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("cPassword")}
                  onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    borderRadius: "6px",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">Confirm Password</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Lock
                  size={18}
                  style={{
                    position: "absolute",
                    left: "16px",
                    color: meta.color,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                />
                <input
                  className="input-field"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={cConfirm}
                  onChange={(e) => setCConfirm(e.target.value)}
                  disabled={cLoading}
                  required
                  style={{
                    paddingLeft: "46px",
                    paddingRight: "46px",
                    border:
                      focusedField === "cConfirm" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                    boxShadow: focusedField === "cConfirm" ? `0 0 0 3px ${meta.shadow}` : "none",
                    transition: "all 0.3s ease",
                  }}
                  onFocus={() => setFocusedField("cConfirm")}
                  onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    borderRadius: "6px",
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
            <CustomDropdown
              label="Join an Academy (optional)"
              value={cAcademyId}
              onChange={setCAcademyId}
              options={[
                { value: "", label: "— Independent Coach (no academy) —" },
                ...academies.map((a) => ({ value: a.id, label: a.name })),
              ]}
              placeholder="— Independent Coach (no academy) —"
              disabled={cLoading}
              icon={<Building size={18} />}
              activeColor={meta.color}
              activeShadow={meta.shadow}
            />
              {cAcademyId && (
                <p style={{ fontSize: "12px", color: "var(--warning)", marginTop: "6px" }}>
                  Your account will be pending until the academy approves you.
                </p>
              )}
            </div>
            {cError && <ErrorBox message={cError} />}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "15px",
                fontWeight: "600",
                background: meta.bg,
                color: "#fff",
                borderRadius: "12px",
                border: "none",
                boxShadow: `0 4px 14px ${meta.shadow}`,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: cLoading ? "not-allowed" : "pointer",
                opacity: cLoading ? 0.8 : 1,
              }}
              disabled={cLoading}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = `0 6px 20px ${meta.shadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 4px 14px ${meta.shadow}`;
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(1px) scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              {cLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Create Coach Account
                  <span style={{ fontSize: "16px" }}>→</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* ── Academy Form ── */}
        {tab === "academy" && (
          <form onSubmit={handleAcademySubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Academy details section */}
            <div
              style={{
                padding: "16px",
                borderRadius: "16px",
                background: "rgba(0, 0, 0, 0.2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: "14px",
                }}
              >
                Academy Details
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label className="input-label">Academy Name *</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <School
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type="text"
                      placeholder="e.g. Grand Chess Academy"
                      value={aName}
                      onChange={(e) => setAName(e.target.value)}
                      disabled={aLoading}
                      required
                      style={{
                        paddingLeft: "46px",
                        border:
                          focusedField === "aName" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aName" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aName")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">City (optional)</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Building
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type="text"
                      placeholder="e.g. Mumbai"
                      value={aCity}
                      onChange={(e) => setACity(e.target.value)}
                      disabled={aLoading}
                      style={{
                        paddingLeft: "46px",
                        border:
                          focusedField === "aCity" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aCity" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aCity")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">Description (optional)</label>
                  <div style={{ position: "relative", display: "flex" }}>
                    <Award
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        top: "14px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <textarea
                      className="input-field"
                      placeholder="Brief description..."
                      value={aDesc}
                      onChange={(e) => setADesc(e.target.value)}
                      disabled={aLoading}
                      rows={2}
                      style={{
                        resize: "vertical",
                        paddingLeft: "46px",
                        border:
                          focusedField === "aDesc" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aDesc" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aDesc")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Owner account section */}
            <div
              style={{
                padding: "16px",
                borderRadius: "16px",
                background: "rgba(0, 0, 0, 0.2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: "14px",
                }}
              >
                Owner Account
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label className="input-label">Your Full Name *</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <User
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Your full name"
                      value={aFullName}
                      onChange={(e) => setAFullName(e.target.value)}
                      disabled={aLoading}
                      required
                      style={{
                        paddingLeft: "46px",
                        border:
                          focusedField === "aFullName" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aFullName" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aFullName")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">Email Address *</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Mail
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type="email"
                      placeholder="you@example.com"
                      value={aEmail}
                      onChange={(e) => setAEmail(e.target.value)}
                      disabled={aLoading}
                      required
                      style={{
                        paddingLeft: "46px",
                        border:
                          focusedField === "aEmail" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aEmail" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aEmail")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">Password *</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Lock
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={aPassword}
                      onChange={(e) => setAPassword(e.target.value)}
                      disabled={aLoading}
                      required
                      style={{
                        paddingLeft: "46px",
                        paddingRight: "46px",
                        border:
                          focusedField === "aPassword" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aPassword" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aPassword")}
                      onBlur={() => setFocusedField(null)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        background: "none",
                        border: "none",
                        padding: "4px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        borderRadius: "6px",
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="input-label">Confirm Password *</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Lock
                      size={18}
                      style={{
                        position: "absolute",
                        left: "16px",
                        color: meta.color,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      className="input-field"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={aConfirm}
                      onChange={(e) => setAConfirm(e.target.value)}
                      disabled={aLoading}
                      required
                      style={{
                        paddingLeft: "46px",
                        paddingRight: "46px",
                        border:
                          focusedField === "aConfirm" ? `1px solid ${meta.color}` : "1px solid var(--input-border)",
                        boxShadow: focusedField === "aConfirm" ? `0 0 0 3px ${meta.shadow}` : "none",
                        transition: "all 0.3s ease",
                      }}
                      onFocus={() => setFocusedField("aConfirm")}
                      onBlur={() => setFocusedField(null)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        background: "none",
                        border: "none",
                        padding: "4px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        borderRadius: "6px",
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {aError && <ErrorBox message={aError} />}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "15px",
                fontWeight: "600",
                background: meta.bg,
                color: "#fff",
                borderRadius: "12px",
                border: "none",
                boxShadow: `0 4px 14px ${meta.shadow}`,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: aLoading ? "not-allowed" : "pointer",
                opacity: aLoading ? 0.8 : 1,
              }}
              disabled={aLoading}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = `0 6px 20px ${meta.shadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 4px 14px ${meta.shadow}`;
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(1px) scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              {aLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Register Academy
                  <span style={{ fontSize: "16px" }}>→</span>
                </>
              )}
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "var(--text-secondary)" }}>
          Already registered?{" "}
          <Link
            href="/login"
            style={{
              color: meta.color,
              fontWeight: "600",
              position: "relative",
              transition: "color 0.3s ease",
            }}
            onMouseEnter={() => setLinkHovered(true)}
            onMouseLeave={() => setLinkHovered(false)}
          >
            Log in
            <span
              style={{
                position: "absolute",
                bottom: "-2px",
                left: "0",
                width: "100%",
                height: "1px",
                backgroundColor: meta.color,
                transform: linkHovered ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left",
                transition: "transform 0.3s ease",
              }}
            />
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
