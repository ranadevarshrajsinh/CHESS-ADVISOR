"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Settings = {
  boardTheme: string;
  soundEnabled: boolean;
  engineDepth: number;
  multiPv: number;
  maxWorkers: number;
  hashSize: number;
  liteMode: boolean;
};

type SettingsContextType = Settings & {
  setBoardTheme: (theme: string) => void;
  setSoundEnabled: (val: boolean) => void;
  setEngineDepth: (val: number) => void;
  setMultiPv: (val: number) => void;
  setMaxWorkers: (val: number) => void;
  setHashSize: (val: number) => void;
  setLiteMode: (val: boolean) => void;
};

function load(): Settings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem("chessAdvisorSettings");
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function save(settings: Settings) {
  localStorage.setItem("chessAdvisorSettings", JSON.stringify(settings));
}

const defaults: Settings = {
  boardTheme: "classic",
  soundEnabled: true,
  engineDepth: 14,
  multiPv: 3,
  maxWorkers: 2,
  hashSize: 16,
  liteMode: false,
};

const SettingsContext = createContext<SettingsContextType>({
  ...defaults,
  setBoardTheme: () => {},
  setSoundEnabled: () => {},
  setEngineDepth: () => {},
  setMultiPv: () => {},
  setMaxWorkers: () => {},
  setHashSize: () => {},
  setLiteMode: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(settings);
  }, [settings, hydrated]);

  const patch = (partial: Partial<Settings>) =>
    setSettings((prev) => ({ ...prev, ...partial }));

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setBoardTheme: (boardTheme) => patch({ boardTheme }),
        setSoundEnabled: (soundEnabled) => patch({ soundEnabled }),
        setEngineDepth: (engineDepth) => patch({ engineDepth }),
        setMultiPv: (multiPv) => patch({ multiPv }),
        setMaxWorkers: (maxWorkers) => patch({ maxWorkers }),
        setHashSize: (hashSize) => patch({ hashSize }),
        setLiteMode: (liteMode) => patch({ liteMode }),
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
