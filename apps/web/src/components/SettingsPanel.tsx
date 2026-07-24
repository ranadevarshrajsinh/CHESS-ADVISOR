"use client";
import { useEffect, useCallback, useState } from "react";
import { X, Palette, Settings2, Sparkles, User, Volume2, TriangleAlert, LogOut, Link2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import "./SettingsPanel.css";

const BOARD_THEMES: Record<string, { dark: string; light: string; label: string }> = {
  classic: { dark: "#b58863", light: "#f0d9b5", label: "Classic" },
  green:   { dark: "#769656", light: "#eeeed2", label: "Green"   },
  mono:    { dark: "#4a4a4a", light: "#e8e8e8", label: "Mono"    },
  ocean:   { dark: "#4870ac", light: "#dae3f5", label: "Ocean"   },
  walnut:  { dark: "#7c3f00", light: "#f5d6a4", label: "Walnut"  },
};

const ENGINE_SLIDERS = [
  { key: "engineDepth",  label: "Depth",      min: 5,  max: 30, step: 1 },
  { key: "multiPv",      label: "MultiPV",    min: 1,  max: 6,  step: 1 },
  { key: "maxWorkers",   label: "Workers",    min: 1,  max: 8,  step: 1 },
  { key: "hashSize",     label: "Hash (MB)",  min: 8,  max: 512, step: 8 },
] as const;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userType: "player" | "coach";
  username: string;
  email?: string;
  role?: string;
  onLogout?: () => void;
};

export default function SettingsPanel({ isOpen, onClose, userType, username, email, role, onLogout }: Props) {
  const {
    boardTheme, setBoardTheme,
    soundEnabled, setSoundEnabled,
    engineDepth, setEngineDepth,
    multiPv, setMultiPv,
    maxWorkers, setMaxWorkers,
    hashSize, setHashSize,
    liteMode, setLiteMode,
    useRecommended, setUseRecommended,
  } = useSettings();
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const { chessUsername, lichessUsername, activePlatform, refreshSession } = usePlayer();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [chessInput, setChessInput] = useState("");
  const [lichessInput, setLichessInput] = useState("");
  const [platformInput, setPlatformInput] = useState<"chess.com" | "lichess">("chess.com");
  const [savingAccounts, setSavingAccounts] = useState(false);
  const [accountsMsg, setAccountsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen && userType === "player") {
      setChessInput(chessUsername ?? "");
      setLichessInput(lichessUsername ?? "");
      setPlatformInput((activePlatform as "chess.com" | "lichess") ?? "chess.com");
      setAccountsMsg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function handleSaveAccounts() {
    setSavingAccounts(true);
    setAccountsMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chessUsername: chessInput.trim(),
          lichessUsername: lichessInput.trim(),
          activePlatform: platformInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccountsMsg({ type: "error", text: data.error ?? "Failed to save." });
        return;
      }
      await refreshSession();
      setAccountsMsg({ type: "success", text: "Saved." });
    } catch {
      setAccountsMsg({ type: "error", text: "Failed to save. Please try again." });
    } finally {
      setSavingAccounts(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    try {
      await fetch("/api/auth/account", { method: "DELETE" });
      await signOut();
    } catch {
      alert("Failed to delete account. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const engineValues = { engineDepth, multiPv, maxWorkers, hashSize };
  const engineSetters = { setEngineDepth, setMultiPv, setMaxWorkers, setHashSize };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-drawer">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* Account */}
          <div className="settings-section">
            <div className="settings-section-title">
              <User size={14} />
              Account
            </div>
            <div className="profile-card">
              <div className="profile-avatar">{username.charAt(0)}</div>
              <div className="profile-details">
                <span className="profile-name">{username}</span>
                {email && <span className="profile-meta">{email}</span>}
                {role && <span className="profile-role-badge">{role.replace("_", " ")}</span>}
              </div>
            </div>
            {onLogout && (
              <button
                onClick={() => { onClose(); onLogout(); }}
                style={{
                  marginTop: "12px",
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: "8px",
                  background: "transparent",
                  border: "1px solid var(--glass-border)",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <LogOut size={14} />
                Sign Out
              </button>
            )}
          </div>

          <div className="settings-divider" />

          {/* Chess Accounts */}
          {userType === "player" && (
            <>
              <div className="settings-section">
                <div className="settings-section-title">
                  <Link2 size={14} />
                  Chess Accounts
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label className="input-label" style={{ fontSize: "12px" }}>Chess.com Username</label>
                    <input
                      className="input-field"
                      value={chessInput}
                      onChange={(e) => setChessInput(e.target.value)}
                      placeholder="your_username"
                      style={{ padding: "8px 12px", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: "12px" }}>Lichess Username</label>
                    <input
                      className="input-field"
                      value={lichessInput}
                      onChange={(e) => setLichessInput(e.target.value)}
                      placeholder="your_username"
                      style={{ padding: "8px 12px", fontSize: "14px" }}
                    />
                  </div>

                  {chessInput.trim() && lichessInput.trim() && (
                    <div>
                      <label className="input-label" style={{ fontSize: "12px" }}>Active Platform</label>
                      <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "3px" }}>
                        <button
                          type="button"
                          onClick={() => setPlatformInput("chess.com")}
                          style={{
                            flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: platformInput === "chess.com" ? "700" : "500",
                            background: platformInput === "chess.com" ? "rgba(16,185,129,0.18)" : "transparent",
                            color: platformInput === "chess.com" ? "#34d399" : "var(--text-secondary)",
                            border: platformInput === "chess.com" ? "1px solid rgba(16,185,129,0.35)" : "1px solid transparent",
                            borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                          }}
                        >
                          Chess.com
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlatformInput("lichess")}
                          style={{
                            flex: 1, padding: "8px 4px", fontSize: "12px", fontWeight: platformInput === "lichess" ? "700" : "500",
                            background: platformInput === "lichess" ? "rgba(16,185,129,0.18)" : "transparent",
                            color: platformInput === "lichess" ? "#34d399" : "var(--text-secondary)",
                            border: platformInput === "lichess" ? "1px solid rgba(16,185,129,0.35)" : "1px solid transparent",
                            borderRadius: "8px", cursor: "pointer", transition: "all 0.2s ease",
                          }}
                        >
                          Lichess
                        </button>
                      </div>
                    </div>
                  )}

                  {accountsMsg && (
                    <p style={{ fontSize: "12px", color: accountsMsg.type === "success" ? "#10b981" : "var(--danger)", margin: 0 }}>
                      {accountsMsg.text}
                    </p>
                  )}

                  <button
                    onClick={handleSaveAccounts}
                    disabled={savingAccounts}
                    style={{
                      padding: "9px 14px", borderRadius: "8px", background: "var(--accent-color)", border: "none",
                      color: "#031a10", fontSize: "13px", fontWeight: "700",
                      cursor: savingAccounts ? "not-allowed" : "pointer", opacity: savingAccounts ? 0.7 : 1,
                    }}
                  >
                    {savingAccounts ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <div className="settings-divider" />
            </>
          )}

          {/* Board Theme */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Palette size={14} />
              Board Theme
            </div>
            <div className="theme-swatches">
              {Object.entries(BOARD_THEMES).map(([key, t]) => (
                <button
                  key={key}
                  className={`theme-swatch-btn${boardTheme === key ? " active" : ""}`}
                  onClick={() => setBoardTheme(key)}
                  title={t.label}
                >
                  <div
                    className="theme-swatch-circle"
                    style={{
                      background: `linear-gradient(135deg, ${t.dark} 50%, ${t.light} 50%)`,
                      boxShadow: boardTheme === key
                        ? "0 0 0 2px var(--accent-color)"
                        : "0 1px 4px rgba(0,0,0,0.4)",
                    }}
                  />
                  <span className="theme-swatch-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Sound */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Volume2 size={14} />
              Sound
            </div>
            <div className="toggle-row">
              <span className="engine-setting-label">Move sounds</span>
              <div className="toggle-switch" onClick={() => setSoundEnabled(!soundEnabled)}>
                <div className={`toggle-track${soundEnabled ? " active" : ""}`}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Analysis Engine */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Settings2 size={14} />
              Analysis Engine
            </div>
            <div className="engine-setting">
              <div className="toggle-row">
                <span className="engine-setting-label">Use recommended settings</span>
                <div className="toggle-switch" onClick={() => setUseRecommended(!useRecommended)}>
                  <div className={`toggle-track${useRecommended ? " active" : ""}`}>
                    <div className="toggle-thumb" />
                  </div>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Depth 14, MultiPV 2, 2 workers, 16MB hash. Turn off to customize.
              </p>
            </div>
            {ENGINE_SLIDERS.map(({ key, label, min, max, step }) => {
              const value = engineValues[key as keyof typeof engineValues];
              const setter = engineSetters[`set${key.charAt(0).toUpperCase() + key.slice(1)}` as keyof typeof engineSetters];
              return (
                <div key={key} className="engine-setting" style={useRecommended ? { opacity: 0.45 } : undefined}>
                  <div className="engine-setting-header">
                    <span className="engine-setting-label">{label}</span>
                    <span className="engine-setting-value">{value}</span>
                  </div>
                  <input
                    type="range"
                    className="engine-slider"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={useRecommended}
                    onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
                  />
                </div>
              );
            })}
            <div className="engine-setting">
              <div className="toggle-row">
                <span className="engine-setting-label">Lite Mode</span>
                <div className="toggle-switch" onClick={() => setLiteMode(!liteMode)}>
                  <div className={`toggle-track${liteMode ? " active" : ""}`}>
                    <div className="toggle-thumb" />
                  </div>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Uses less CPU by reducing depth and workers
              </p>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Appearance */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Sparkles size={14} />
              Appearance
            </div>
            <div className="toggle-row">
              <span className="engine-setting-label">Dark mode</span>
              <div className="toggle-switch" onClick={toggle}>
                <div className={`toggle-track${theme === "dark" ? " active" : ""}`}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Danger Zone */}
          <div className="settings-section">
            <div className="settings-section-title" style={{ color: "var(--danger)" }}>
              <TriangleAlert size={14} />
              Danger Zone
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <button
              onClick={() => setDeleteModalOpen(true)}
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", width: "100%" }}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <>
          <div
            onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 301, background: "var(--surface-1)", border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "420px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <TriangleAlert size={22} style={{ color: "var(--danger)", flexShrink: 0 }} />
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>Delete Account</h3>
            </div>

            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: "1.6" }}>
              This will permanently delete:
            </p>
            <ul style={{ fontSize: "13px", color: "var(--text-secondary)", paddingLeft: "20px", marginBottom: "20px", lineHeight: "2" }}>
              <li>Your account and profile</li>
              <li>All your players and their data</li>
              <li>All active sessions</li>
            </ul>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              Type <strong style={{ color: "var(--danger)" }}>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "14px",
                background: "var(--input-bg)", border: "1px solid var(--input-border)",
                color: "var(--text-primary)", outline: "none", boxSizing: "border-box", marginBottom: "20px",
              }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
                style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid var(--input-border)", background: "transparent", color: "var(--text-primary)", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                style={{
                  flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                  background: deleteConfirmText === "DELETE" ? "var(--danger)" : "rgba(239,68,68,0.2)",
                  color: deleteConfirmText === "DELETE" ? "#fff" : "rgba(239,68,68,0.4)",
                  fontSize: "14px", fontWeight: "600",
                  cursor: deleteConfirmText === "DELETE" ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                {deleteLoading ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
