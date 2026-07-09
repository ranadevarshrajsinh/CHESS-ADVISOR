"use client";
import { useEffect, useCallback } from "react";
import { X, Palette, Settings2, Sparkles, User, Mail, Shield, Volume2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useTheme } from "@/contexts/ThemeContext";
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
};

export default function SettingsPanel({ isOpen, onClose, userType, username, email, role }: Props) {
  const {
    boardTheme, setBoardTheme,
    soundEnabled, setSoundEnabled,
    engineDepth, setEngineDepth,
    multiPv, setMultiPv,
    maxWorkers, setMaxWorkers,
    hashSize, setHashSize,
    liteMode, setLiteMode,
  } = useSettings();
  const { theme, toggle } = useTheme();

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
              <User size={16} />
              Account
            </div>
            <div className="profile-info">
              <div className="profile-row">
                <User size={14} className="profile-row-icon" />
                <span className="profile-row-label">Name</span>
                <span>{username}</span>
              </div>
              {userType === "coach" && email && (
                <div className="profile-row">
                  <Mail size={14} className="profile-row-icon" />
                  <span className="profile-row-label">Email</span>
                  <span>{email}</span>
                </div>
              )}
              {userType === "coach" && role && (
                <div className="profile-row">
                  <Shield size={14} className="profile-row-icon" />
                  <span className="profile-row-label">Role</span>
                  <span style={{ textTransform: "capitalize" }}>{role.replace("_", " ")}</span>
                </div>
              )}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Board Theme */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Palette size={16} />
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
              <Volume2 size={16} />
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
              <Settings2 size={16} />
              Analysis Engine
            </div>
            {ENGINE_SLIDERS.map(({ key, label, min, max, step }) => {
              const value = engineValues[key as keyof typeof engineValues];
              const setter = engineSetters[`set${key.charAt(0).toUpperCase() + key.slice(1)}` as keyof typeof engineSetters];
              return (
                <div key={key} className="engine-setting">
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
                    onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
                  />
                </div>
              );
            })}
            <div className="engine-setting" style={{ marginTop: "16px" }}>
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
              <Sparkles size={16} />
              Appearance
            </div>
            <div className="toggle-row">
              <span className="engine-setting-label">Dark Theme</span>
              <div className="toggle-switch" onClick={toggle}>
                <div className={`toggle-track${theme === "dark" ? " active" : ""}`}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
