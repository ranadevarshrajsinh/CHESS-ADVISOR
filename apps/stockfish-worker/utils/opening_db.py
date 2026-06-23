import chess
from typing import Optional, Dict, Any

# A minimal built-in ECO opening map.
# This is a fallback when PGN headers lack an Opening/ECO tag.
# The full 13,000+ opening map lives in the frontend (apps/web/src/lib/engine/openings.ts).
_ECO_FENS: Dict[str, Dict[str, str]] = {
    "A00": {"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "name": "White opening"},
    "B20": {"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "name": "Sicilian Defense"},
    "C00": {"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "name": "French Defense"},
    "C20": {"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "name": "King's Pawn Game"},
    "D00": {"fen": "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1", "name": "Queen's Pawn Game"},
    "E00": {"fen": "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1", "name": "Indian Game"},
}

# Common opening positions reachable in a few moves.
# FEN hash -> opening info
_OPENING_POSITIONS: Dict[str, Dict[str, str]] = {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": {"eco": "A00", "name": "Starting Position"},
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -": {"eco": "B00", "name": "King's Pawn Opening"},
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -": {"eco": "A40", "name": "Queen's Pawn Opening"},
}

# Positions known to be in standard opening theory.
_BOOK_POSITIONS: set = {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    "rnbqkbnr/pppp1ppp/8/4p3/2p5/8/PPPP1PPP/RNBQKBNR w KQkq -",
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -",
}


class OpeningDB:
    """Opening database with position-hash-based lookup and book detection."""

    @staticmethod
    def get_opening_by_position(board: chess.Board) -> Optional[Dict[str, str]]:
        """Return opening info dict {'eco': ..., 'name': ...} for a board position,
        or None if the position is not in the database."""
        fen = _normalise_fen(board.fen())
        info = _OPENING_POSITIONS.get(fen)
        if info:
            return info
        # Fallback: walk through ECO_FENS
        for eco, entry in _ECO_FENS.items():
            ref_board = chess.Board(entry["fen"])
            if board == ref_board:
                result = {"eco": eco, "name": entry["name"]}
                _OPENING_POSITIONS[fen] = result
                return result
        return None

    @staticmethod
    def is_book_position(board: chess.Board) -> bool:
        """Return True if the board position is a known book (opening theory) position."""
        fen = _normalise_fen(board.fen())
        return fen in _BOOK_POSITIONS

    @staticmethod
    def register_position(fen_key: str, eco: str, name: str) -> None:
        """Register a new opening position at runtime (for extensibility)."""
        _OPENING_POSITIONS[_normalise_fen(fen_key)] = {"eco": eco, "name": name}


def _normalise_fen(fen: str) -> str:
    """Normalise a FEN string for cache lookups: strip move counters, keep only position + side to move."""
    parts = fen.split(" ")
    return " ".join(parts[:2])  # piece placement + active color only
