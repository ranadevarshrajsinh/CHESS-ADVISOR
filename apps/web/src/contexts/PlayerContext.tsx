"use client";
import { createContext, useContext, useEffect, useState } from "react";

type PlayerContextType = {
  chessUsername: string | null;
  lichessUsername: string | null;
  activePlatform: string;
  activeUsername: string | null;
  fullName: string | null;
  coachId: string | null;
  status: string | null;
  isApproved: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextType>({
  chessUsername: null,
  lichessUsername: null,
  activePlatform: "chess.com",
  activeUsername: null,
  fullName: null,
  coachId: null,
  status: null,
  isApproved: false,
  loading: true,
  logout: async () => {},
  refreshSession: async () => {},
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [chessUsername, setChessUsername] = useState<string | null>(null);
  const [lichessUsername, setLichessUsername] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string>("chess.com");
  const [fullName, setFullName] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        clearState();
        return;
      }
      const data = await res.json();
      if (data.userType !== "player") {
        clearState();
        return;
      }
      setChessUsername(data.chessUsername);
      setLichessUsername(data.lichessUsername);
      setActivePlatform(data.activePlatform ?? "chess.com");
      setFullName(data.fullName);
      setCoachId(data.coachId);
      setStatus(data.status);
    } catch {
      clearState();
    } finally {
      setLoading(false);
    }
  }

  function clearState() {
    setChessUsername(null);
    setLichessUsername(null);
    setActivePlatform("chess.com");
    setFullName(null);
    setCoachId(null);
    setStatus(null);
  }

  useEffect(() => {
    fetchMe();
  }, []);

  const activeUsername = activePlatform === "lichess" ? lichessUsername : chessUsername;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearState();
    window.location.href = "/login";
  };

  const refreshSession = async () => {
    await fetchMe();
  };

  return (
    <PlayerContext.Provider
      value={{
        chessUsername,
        lichessUsername,
        activePlatform,
        activeUsername,
        fullName,
        coachId,
        status,
        isApproved: status === "approved",
        loading,
        logout,
        refreshSession,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
