export interface PgnHeaders {
  opening?: string;
  eco?: string;
  plyCount?: number;
}

const HEADER_RE = /^\[(\w+)\s+"([^"]*)"\]/;

export function parsePgnHeaders(pgn?: string): PgnHeaders {
  if (!pgn || typeof pgn !== "string") return {};

  const out: PgnHeaders = {};
  const headerBlockEnd = pgn.indexOf("\n\n");
  const headerBlock = headerBlockEnd >= 0 ? pgn.slice(0, headerBlockEnd) : pgn;

  for (const line of headerBlock.split(/\r?\n/)) {
    const m = HEADER_RE.exec(line.trim());
    if (!m) continue;
    const [, tag, value] = m;
    if (!value) continue;
    if (tag === "Opening") out.opening = value;
    else if (tag === "ECO") out.eco = value;
    else if (tag === "ECOUrl" && !out.opening) {
      const derived = openingFromEcoUrl(value);
      if (derived) out.opening = derived;
    }
    else if (tag === "PlyCount") {
      const n = parseInt(value, 10);
      if (Number.isFinite(n)) out.plyCount = n;
    }
  }

  return out;
}

// Chess.com encodes the opening name into ECOUrl, e.g.:
//   https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3
//   https://www.chess.com/openings/Kings-Pawn-Opening-1.e4-e5
// Extract everything between `/openings/` and the first `-<digit>.` (move-list suffix).
function openingFromEcoUrl(url: string): string | undefined {
  const marker = "/openings/";
  const i = url.indexOf(marker);
  if (i < 0) return undefined;
  let slug = url.slice(i + marker.length);
  // Trim trailing move list like "-6.Be3" or "-1.e4-e5"
  const moveIdx = slug.search(/-\d+\./);
  if (moveIdx >= 0) slug = slug.slice(0, moveIdx);
  if (!slug) return undefined;
  return slug.replace(/-/g, " ").trim();
}
