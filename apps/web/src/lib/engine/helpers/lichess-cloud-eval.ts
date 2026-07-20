import type { LineEval, PositionEval } from "@/types/engine-types";

const TIMEOUT_MS = 500;
const MIN_DEPTH = 10;

interface LichessCloudPv {
  moves: string;
  cp?: number;
  mate?: number;
}

interface LichessCloudEvalResponse {
  depth: number;
  pvs: LichessCloudPv[];
}

export async function fetchLichessCloudEval(
  fen: string,
  multiPv: number
): Promise<PositionEval | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data: LichessCloudEvalResponse = await res.json();
    if (data.depth < MIN_DEPTH || !data.pvs?.length) return null;

    const whiteToPlay = fen.split(" ")[1] === "w";
    const flip = !whiteToPlay;

    const lines: LineEval[] = data.pvs.map((pv, i) => ({
      pv: pv.moves ? pv.moves.split(" ").filter(Boolean) : [],
      cp: pv.cp !== undefined ? (flip ? -pv.cp : pv.cp) : undefined,
      mate: pv.mate !== undefined ? (flip ? -pv.mate : pv.mate) : undefined,
      depth: data.depth,
      multiPv: i + 1,
    }));

    return { lines, bestMove: lines[0]?.pv?.[0] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
