import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Increment this whenever the analysis pipeline changes output (new formula,
# different engine depth strategy, etc.).  Cached results with an older version
# are treated as stale and re-analyzed on the next request.
CURRENT_ANALYSIS_VERSION = 2

class AnalysisStorage:
    """Manages persistence of analysis results to the local filesystem."""
    
    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            # Use data/analysis relative to backend root
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.storage_dir = os.path.join(base_dir, "data", "analysis")
        else:
            self.storage_dir = storage_dir
            
        os.makedirs(self.storage_dir, exist_ok=True)

    def save_analysis(self, username: str, filename: str, result: Dict[str, Any]) -> str:
        """Saves a single game analysis as JSON."""
        user_dir = os.path.join(self.storage_dir, username.lower())
        os.makedirs(user_dir, exist_ok=True)
        
        # Clean filename to be safe
        safe_name = filename.replace(".pgn", ".json")
        filepath = os.path.join(user_dir, safe_name)
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=4)
        
        logger.info("CACHE_SAVE user=%s game=%s path=%s size=%d",
                     username, filename, filepath, len(json.dumps(result)))
        return filepath

    def get_analysis(self, username: str, filename: str) -> Optional[Dict[str, Any]]:
        """Retrieves a saved analysis."""
        safe_name = filename.replace(".pgn", ".json")
        filepath = os.path.join(self.storage_dir, username.lower(), safe_name)

        if not os.path.exists(filepath):
            logger.debug("CACHE_MISS user=%s game=%s reason=not_found", username, filename)
            return None

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.warning("CACHE_CORRUPTED user=%s game=%s path=%s — removing", username, filename, filepath)
            # Corrupted cache — remove it so the game is re-analyzed on next request
            try:
                os.remove(filepath)
            except OSError:
                pass
            return None

        # Version check: results produced under an older pipeline are stale.
        # Returning None causes the caller to re-analyze and overwrite with a
        # fresh v{CURRENT_ANALYSIS_VERSION} result.
        if data.get("analysis_version", 1) < CURRENT_ANALYSIS_VERSION:
            logger.info("CACHE_STALE user=%s game=%s version=%d < current=%d",
                         username, filename, data.get("analysis_version", 1), CURRENT_ANALYSIS_VERSION)
            return None

        logger.debug("CACHE_HIT user=%s game=%s version=%d", username, filename, data.get("analysis_version", 1))
        return data

    def is_fresh(self, username: str, filename: str, pgn_mtime: float) -> bool:
        """Returns True if the cached analysis JSON is newer than the PGN source file."""
        safe_name = filename.replace(".pgn", ".json")
        filepath = os.path.join(self.storage_dir, username.lower(), safe_name)
        if not os.path.exists(filepath):
            return False
        analysis_mtime = os.path.getmtime(filepath)
        is_fresh = analysis_mtime >= pgn_mtime
        logger.debug("CACHE_FRESH user=%s game=%s analysis_mtime=%.3f pgn_mtime=%.3f fresh=%s",
                      username, filename, analysis_mtime, pgn_mtime, is_fresh)
        return is_fresh

    def save_batch_report(self, username: str, limit: int, report: dict) -> None:
        """Persists an aggregated batch report to disk."""
        user_dir = os.path.join(self.storage_dir, username.lower())
        os.makedirs(user_dir, exist_ok=True)
        filepath = os.path.join(user_dir, f"_batch_{limit}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f)
        logger.info("BATCH_REPORT_SAVED user=%s limit=%d path=%s", username, limit, filepath)

    def save_batch_raw(self, username: str, limit: int, raw_results: list) -> None:
        """Persists raw per-game results so incremental updates avoid re-reading individual files."""
        user_dir = os.path.join(self.storage_dir, username.lower())
        os.makedirs(user_dir, exist_ok=True)
        filepath = os.path.join(user_dir, f"_raw_{limit}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(raw_results, f)
        logger.info("BATCH_RAW_SAVED user=%s limit=%d games=%d", username, limit, len(raw_results))

    def get_batch_raw(self, username: str, limit: int) -> Optional[list]:
        """Returns stored raw per-game results regardless of freshness, or None if missing/corrupted."""
        filepath = os.path.join(self.storage_dir, username.lower(), f"_raw_{limit}.json")
        if not os.path.exists(filepath):
            logger.debug("BATCH_RAW_MISS user=%s limit=%d", username, limit)
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.debug("BATCH_RAW_HIT user=%s limit=%d games=%d", username, limit, len(data))
            return data
        except (json.JSONDecodeError, OSError):
            logger.warning("BATCH_RAW_CORRUPTED user=%s limit=%d — removing", username, limit)
            try:
                os.remove(filepath)
            except OSError:
                pass
            return None

    def get_batch_report(self, username: str, limit: int, games_dir: str) -> Optional[Dict[str, Any]]:
        """Returns the cached batch report if no PGN file is newer than it, else None."""
        filepath = os.path.join(self.storage_dir, username.lower(), f"_batch_{limit}.json")
        if not os.path.exists(filepath):
            logger.debug("BATCH_REPORT_MISS user=%s limit=%d", username, limit)
            return None
        report_mtime = os.path.getmtime(filepath)
        try:
            for fname in os.listdir(games_dir):
                if fname.endswith(".pgn"):
                    f_mtime = os.path.getmtime(os.path.join(games_dir, fname))
                    if f_mtime > report_mtime:
                        logger.info("BATCH_REPORT_STALE user=%s limit=%d — newer PGN %s (mtime=%.3f > %.3f)",
                                     username, limit, fname, f_mtime, report_mtime)
                        return None
        except OSError:
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info("BATCH_REPORT_HIT user=%s limit=%d", username, limit)
            return data
        except (json.JSONDecodeError, OSError):
            logger.warning("BATCH_REPORT_CORRUPTED user=%s limit=%d — removing", username, limit)
            try:
                os.remove(filepath)
            except OSError:
                pass
            return None
