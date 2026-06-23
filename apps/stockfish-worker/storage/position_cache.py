from typing import Dict, Optional, Any
import threading

class PositionCache:
    """Zobrist-hash-based position cache shared across all games.

    Avoids redundant engine evaluations for repeated positions (common
    opening lines, transpositions).  Thread-safe via a read-write lock.

    Cache entries are never invalidated during a single server process
    because chess positions are deterministic — the same FEN always
    produces the same evaluation at the same search depth.
    """

    def __init__(self):
        self._lock = threading.Lock()
        # key: zobrist hash (int)
        # value: dict mapping multipv -> list of PV dicts
        self._cache: Dict[int, Dict[int, Any]] = {}

    def get(self, zobrist_hash: int, multipv: int = 1) -> Optional[Any]:
        """Return cached evaluation for a position, or None if not cached."""
        with self._lock:
            entry = self._cache.get(zobrist_hash)
            if entry is None:
                return None
            return entry.get(multipv)

    def put(self, zobrist_hash: int, multipv: int, result: Any) -> None:
        """Store an evaluation result for this position and multipv count."""
        with self._lock:
            if zobrist_hash not in self._cache:
                self._cache[zobrist_hash] = {}
            self._cache[zobrist_hash][multipv] = result

    def clear(self) -> None:
        """Clear the entire cache (e.g. on engine restart)."""
        with self._lock:
            self._cache.clear()

    @property
    def size(self) -> int:
        """Number of cached positions."""
        with self._lock:
            return len(self._cache)
