from typing import List, Dict, Any


class CriticalMoments:
    """Identifies critical turning points in a game where the outcome
    swung significantly (large win-probability changes)."""

    # A move is a "critical moment" if win-prob drop or gain exceeds this threshold
    CRITICAL_WIN_PROB_THRESHOLD = 10.0  # percentage points
    MAX_CRITICAL_MOMENTS = 5

    def detect_turning_points(self, analysis_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Detect the most critical positions in a game.

        Args:
            analysis_data: List of per-move dicts with 'win_prob_drop',
                          'accuracy', 'san', 'move_num', 'quality'.

        Returns:
            List of turning-point dicts sorted by significance (most impactful first),
            up to MAX_CRITICAL_MOMENTS entries.
        """
        turning_points = []

        for move in analysis_data:
            drop = abs(move.get("win_prob_drop", 0))
            if drop >= self.CRITICAL_WIN_PROB_THRESHOLD:
                turning_points.append({
                    "move_num": move.get("move_num", 0),
                    "san": move.get("san", "?"),
                    "win_prob_drop": round(drop, 1),
                    "accuracy": move.get("accuracy", 0),
                    "quality": move.get("quality", "?"),
                    "reason": self._describe_turning_point(move, drop),
                })

        # Sort by impact (descending win-prob change)
        turning_points.sort(key=lambda x: -x["win_prob_drop"])
        return turning_points[:self.MAX_CRITICAL_MOMENTS]

    @staticmethod
    def _describe_turning_point(move: Dict[str, Any], drop: float) -> str:
        """Generate a human-readable description of why this move was critical."""
        quality = move.get("quality", "?")
        san = move.get("san", "?")
        if quality == "Blunder" and drop > 20:
            return f"Severe blunder ({san}) — game swung {drop:.0f}%"
        if quality == "Blunder" and drop > 10:
            return f"Blunder ({san}) — lost {drop:.0f}% win probability"
        if quality == "Mistake" and drop > 10:
            return f"Costly mistake ({san}) — {drop:.0f}% win-prob drop"
        if quality == "Brilliant" and drop > 10:
            return f"Brilliant move ({san}) — gained {drop:.0f}% win probability"
        return f"{quality} ({san}) — {drop:.0f}% win-prob change"
