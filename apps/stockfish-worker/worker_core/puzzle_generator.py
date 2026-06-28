import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class PuzzleGenerator:
    """Suggests puzzle themes to practice based on analysis results."""

    # Mapping from error natures / patterns to Lichess puzzle themes
    _THEME_MAP = {
        "Hanging Piece":    "Piece Safety",
        "Missed Fork":      "Forks",
        "Missed Pin":       "Pins",
        "Missed Skewer":    "Skewers",
        "Missed Discovered Attack": "Discovered Attacks",
        "Missed Back Rank Mate":    "Back Rank Mate",
        "Promotion Error":  "Endgame Fundamentals",
        "Endgame Technique": "Endgame Fundamentals",
        "Tactical Oversight": "Mixed Tactics",
        "Positional Misjudgment": "Mixed Tactics",
        "Time Pressure":    "Mixed Tactics",
    }

    def suggest_puzzle_themes(self, batch_analysis: Dict[str, Any]) -> List[str]:
        """Determine which puzzle themes to recommend based on error patterns.

        Args:
            batch_analysis: Aggregated batch report dict.

        Returns:
            Sorted list of puzzle theme names (up to 6).
        """
        avg_acc = batch_analysis.get('average_accuracy', 0) or 0
        logger.debug("PUZZLE_THEMES_START avg_accuracy=%.1f%%", avg_acc)
        theme_counts: Dict[str, int] = {}

        # Extract error natures from patterns
        patterns = batch_analysis.get("patterns", {})
        critical = patterns.get("critical_weaknesses", [])
        if critical:
            for weakness in critical:
                for nature, theme in self._THEME_MAP.items():
                    if nature.lower() in weakness.lower():
                        theme_counts[theme] = theme_counts.get(theme, 0) + 1

        # Extract from individual games if available
        individual_games = batch_analysis.get("individual_games", [])
        for game in individual_games:
            for move in game.get("move_history", []):
                nature = move.get("error_nature", "")
                if nature in self._THEME_MAP:
                    theme = self._THEME_MAP[nature]
                    theme_counts[theme] = theme_counts.get(theme, 0) + 1

        # Add defaults based on accuracy
        avg_acc = batch_analysis.get("average_accuracy", 0) or 0
        if avg_acc < 60:
            theme_counts["Piece Safety"] = theme_counts.get("Piece Safety", 0) + 2
            theme_counts["Mixed Tactics"] = theme_counts.get("Mixed Tactics", 0) + 2
        elif avg_acc < 75:
            theme_counts["Tactical Combinations"] = theme_counts.get("Tactical Combinations", 0) + 1

        # Sort by frequency (descending), return top 6
        sorted_themes = sorted(theme_counts.items(), key=lambda x: -x[1])
        themes = [theme for theme, _ in sorted_themes[:6]]
        logger.info("PUZZLE_THEMES_DONE themes=%s count=%d", themes, len(themes))
        return themes
