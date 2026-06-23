from typing import List, Dict, Any


class OpeningMistakes:
    """Analyzes mistakes made within specific openings."""

    def analyze_mistakes(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Count mistakes, blunders, and inaccuracies per opening.

        Args:
            results: List of game analysis dicts with 'opening_name',
                    'move_history' (list of dicts with 'quality').

        Returns:
            Dict mapping opening name -> {blunders, mistakes, inaccuracies, total_errors}.
        """
        opening_stats: Dict[str, Dict[str, int]] = {}

        for game in results:
            opening = game.get("opening_name", "Unknown")
            if opening not in opening_stats:
                opening_stats[opening] = {"blunders": 0, "mistakes": 0,
                                         "inaccuracies": 0, "total_errors": 0}

            for move in game.get("move_history", []):
                quality = move.get("quality", "")
                if quality == "Blunder":
                    opening_stats[opening]["blunders"] += 1
                    opening_stats[opening]["total_errors"] += 1
                elif quality == "Mistake":
                    opening_stats[opening]["mistakes"] += 1
                    opening_stats[opening]["total_errors"] += 1
                elif quality == "Inaccuracy":
                    opening_stats[opening]["inaccuracies"] += 1
                    opening_stats[opening]["total_errors"] += 1

        return {
            "by_opening": opening_stats,
            "worst_openings": sorted(
                opening_stats.items(),
                key=lambda x: -x[1]["total_errors"]
            )[:5],
        }
