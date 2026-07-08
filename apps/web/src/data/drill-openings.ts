export interface DrillOpening {
  eco: string;
  name: string;
  category: string;
  moves: string[]; // SAN moves replayed before drill starts
}

export const OPENING_CATEGORIES = [
  "All",
  "King's Pawn",
  "Sicilian",
  "French",
  "Caro-Kann",
  "Other e4",
  "Queen's Gambit",
  "Indian",
  "Flank",
  "Other d4",
] as const;

export const DRILL_OPENINGS: DrillOpening[] = [
  // ── King's Pawn ──────────────────────────────────────────────────────────
  {
    eco: "C20",
    name: "King's Pawn Game",
    category: "King's Pawn",
    moves: ["e4", "e5"],
  },
  {
    eco: "C60",
    name: "Ruy Lopez",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
  },
  {
    eco: "C65",
    name: "Ruy Lopez, Berlin Defense",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
  },
  {
    eco: "C50",
    name: "Italian Game",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  },
  {
    eco: "C54",
    name: "Italian Game, Giuoco Piano",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
  },
  {
    eco: "C45",
    name: "Scotch Game",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"],
  },
  {
    eco: "C47",
    name: "Four Knights Game",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"],
  },
  {
    eco: "C25",
    name: "Vienna Game",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nc3"],
  },
  {
    eco: "C30",
    name: "King's Gambit",
    category: "King's Pawn",
    moves: ["e4", "e5", "f4"],
  },
  {
    eco: "C33",
    name: "King's Gambit Accepted",
    category: "King's Pawn",
    moves: ["e4", "e5", "f4", "exf4"],
  },
  {
    eco: "C42",
    name: "Petrov Defense",
    category: "King's Pawn",
    moves: ["e4", "e5", "Nf3", "Nf6"],
  },
  // ── Sicilian ─────────────────────────────────────────────────────────────
  {
    eco: "B20",
    name: "Sicilian Defense",
    category: "Sicilian",
    moves: ["e4", "c5"],
  },
  {
    eco: "B97",
    name: "Sicilian, Najdorf Variation",
    category: "Sicilian",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
  },
  {
    eco: "B70",
    name: "Sicilian, Dragon Variation",
    category: "Sicilian",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"],
  },
  {
    eco: "B80",
    name: "Sicilian, Scheveningen Variation",
    category: "Sicilian",
    moves: ["e4", "c5", "Nf3", "e6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "d6"],
  },
  {
    eco: "B23",
    name: "Sicilian, Closed Variation",
    category: "Sicilian",
    moves: ["e4", "c5", "Nc3", "Nc6", "g3", "g6", "Bg2", "Bg7"],
  },
  // ── French ───────────────────────────────────────────────────────────────
  {
    eco: "C00",
    name: "French Defense",
    category: "French",
    moves: ["e4", "e6", "d4", "d5"],
  },
  {
    eco: "C02",
    name: "French, Advance Variation",
    category: "French",
    moves: ["e4", "e6", "d4", "d5", "e5", "c5"],
  },
  {
    eco: "C01",
    name: "French, Exchange Variation",
    category: "French",
    moves: ["e4", "e6", "d4", "d5", "exd5", "exd5"],
  },
  {
    eco: "C11",
    name: "French, Classical Variation",
    category: "French",
    moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6"],
  },
  // ── Caro-Kann ────────────────────────────────────────────────────────────
  {
    eco: "B10",
    name: "Caro-Kann Defense",
    category: "Caro-Kann",
    moves: ["e4", "c6", "d4", "d5"],
  },
  {
    eco: "B15",
    name: "Caro-Kann, Classical Variation",
    category: "Caro-Kann",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"],
  },
  {
    eco: "B12",
    name: "Caro-Kann, Advance Variation",
    category: "Caro-Kann",
    moves: ["e4", "c6", "d4", "d5", "e5", "Bf5"],
  },
  // ── Other e4 ─────────────────────────────────────────────────────────────
  {
    eco: "B01",
    name: "Scandinavian Defense",
    category: "Other e4",
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"],
  },
  {
    eco: "B07",
    name: "Pirc Defense",
    category: "Other e4",
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7"],
  },
  {
    eco: "B02",
    name: "Alekhine Defense",
    category: "Other e4",
    moves: ["e4", "Nf6", "e5", "Nd5", "c4", "Nb6", "d4", "d6"],
  },
  // ── Queen's Gambit ───────────────────────────────────────────────────────
  {
    eco: "D06",
    name: "Queen's Gambit",
    category: "Queen's Gambit",
    moves: ["d4", "d5", "c4"],
  },
  {
    eco: "D20",
    name: "Queen's Gambit Accepted",
    category: "Queen's Gambit",
    moves: ["d4", "d5", "c4", "dxc4", "Nf3", "Nf6", "e3", "e6"],
  },
  {
    eco: "D30",
    name: "Queen's Gambit Declined",
    category: "Queen's Gambit",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"],
  },
  {
    eco: "D10",
    name: "Slav Defense",
    category: "Queen's Gambit",
    moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3"],
  },
  {
    eco: "D43",
    name: "Semi-Slav Defense",
    category: "Queen's Gambit",
    moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "e6"],
  },
  // ── Indian Defenses ──────────────────────────────────────────────────────
  {
    eco: "E60",
    name: "King's Indian Defense",
    category: "Indian",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3"],
  },
  {
    eco: "E20",
    name: "Nimzo-Indian Defense",
    category: "Indian",
    moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
  },
  {
    eco: "E12",
    name: "Queen's Indian Defense",
    category: "Indian",
    moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6", "g3", "Bb7"],
  },
  {
    eco: "D85",
    name: "Grünfeld Defense",
    category: "Indian",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5", "cxd5", "Nxd5"],
  },
  {
    eco: "D80",
    name: "Grünfeld, Exchange Variation",
    category: "Indian",
    moves: [
      "d4", "Nf6", "c4", "g6", "Nc3", "d5", "cxd5", "Nxd5",
      "e4", "Nxc3", "bxc3", "Bg7",
    ],
  },
  {
    eco: "A57",
    name: "Benko Gambit",
    category: "Indian",
    moves: ["d4", "Nf6", "c4", "c5", "d5", "b5", "cxb5", "a6"],
  },
  // ── Flank Openings ───────────────────────────────────────────────────────
  {
    eco: "A10",
    name: "English Opening",
    category: "Flank",
    moves: ["c4", "e5", "Nc3", "Nf6", "Nf3", "Nc6", "g3"],
  },
  {
    eco: "D02",
    name: "London System",
    category: "Flank",
    moves: ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3"],
  },
  {
    eco: "A07",
    name: "King's Indian Attack",
    category: "Flank",
    moves: ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3"],
  },
  {
    eco: "E00",
    name: "Catalan Opening",
    category: "Flank",
    moves: ["d4", "Nf6", "c4", "e6", "g3", "d5", "Bg2", "Be7", "Nf3"],
  },
  {
    eco: "A45",
    name: "Trompowsky Attack",
    category: "Flank",
    moves: ["d4", "Nf6", "Bg5"],
  },
  {
    eco: "A02",
    name: "Bird's Opening",
    category: "Flank",
    moves: ["f4"],
  },
  {
    eco: "A09",
    name: "Réti Opening",
    category: "Flank",
    moves: ["Nf3", "d5", "c4"],
  },
  // ── Other d4 ─────────────────────────────────────────────────────────────
  {
    eco: "A80",
    name: "Dutch Defense",
    category: "Other d4",
    moves: ["d4", "f5", "g3", "Nf6", "Bg2", "e6", "Nf3", "Be7"],
  },
  {
    eco: "A60",
    name: "Modern Benoni",
    category: "Other d4",
    moves: ["d4", "Nf6", "c4", "c5", "d5", "e6", "Nc3", "exd5", "cxd5", "d6"],
  },
];
