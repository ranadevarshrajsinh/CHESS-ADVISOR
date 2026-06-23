from typing import List, Dict, Any


class OpeningPerformance:
    """Analyzes performance statistics per opening."""

    def analyze_performance(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute per-opening performance metrics.

        Args:
            results: List of game analysis dicts with 'opening_name',
                    'user_color', 'user_result', 'game_accuracy'.

        Returns:
            Dict mapping opening name -> {wins, losses, draws, avg_accuracy, count}.
            Also includes a 'combined' key with flat list of all opening entries.
        """
        stats: Dict[str, Dict[str, float]] = {}

        for game in results:
            opening = game.get("opening_name", "Unknown")
            color = game.get("user_color", "white")
            result = game.get("user_result", "draw")
            accuracy = game.get("game_accuracy", 0) or 0

            if opening not in stats:
                stats[opening] = {"wins": 0, "losses": 0, "draws": 0,
                                 "total_accuracy": 0.0, "count": 0,
                                 "by_color": {"white": {"wins": 0, "losses": 0, "draws": 0,
                                                           "total_accuracy": 0.0, "count": 0},
                                               "black": {"wins": 0, "losses": 0, "draws": 0,
                                                           "total_accuracy": 0.0, "count": 0}}}

            stats[opening][result + "s"] += 1  # wins -> 'wins', losses -> 'losses', draws -> 'draws'
            stats[opening]["total_accuracy"] += accuracy
            stats[opening]["count"] += 1

            bc = stats[opening]["by_color"][color]
            bc[result + "s"] += 1
            bc["total_accuracy"] += accuracy
            bc["count"] += 1

        # Build output
        result: Dict[str, Any] = {}
        combined = []
        for name, s in stats.items():
            avg_acc = round(s["total_accuracy"] / s["count"], 2) if s["count"] else 0
            entry = {
                "name": name,
                "wins": s["wins"],
                "losses": s["losses"],
                "draws": s["draws"],
                "avg_accuracy": avg_acc,
                "count": s["count"],
                "by_color": {},
            }
            for color, bc in s["by_color"].items():
                bc_acc = round(bc["total_accuracy"] / bc["count"], 2) if bc["count"] else 0
                entry["by_color"][color] = {
                    "wins": bc["wins"],
                    "losses": bc["losses"],
                    "draws": bc["draws"],
                    "avg_accuracy": bc_acc,
                    "count": bc["count"],
                }
            result[name] = entry
            combined.append(entry)

        result["combined"] = combined
        return result
