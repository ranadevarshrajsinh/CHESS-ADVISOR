import logging
from typing import Dict, Optional, Any
import threading

logger = logging.getLogger(__name__)

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
        self._hits = 0
        self._misses = 0

    def get(self, zobrist_hash: int, multipv: int = 1) -> Optional[Any]:
        """Return cached evaluation for a position, or None if not cached."""
        with self._lock:
            entry = self._cache.get(zobrist_hash)
            if entry is None:
                self._misses += 1
                return None
            pv_entry = entry.get(multipv)
            if pv_entry is None:
                self._misses += 1
                return None
            self._hits += 1
            return pv_entry

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
            self._hits = 0
            self._misses = 0
        logger.info("POSITION_CACHE_CLEARED")

    def stats(self) -> Dict[str, Any]:
        """Return cache usage statistics."""
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "total": total,
            "hit_rate_pct": round(100 * self._hits / total, 1) if total > 0 else 0,
        }

    @property
    def size(self) -> int:
        """Number of cached positions."""
        with self._lock:
            return len(self._cache)
