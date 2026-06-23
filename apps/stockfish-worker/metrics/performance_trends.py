from typing import List, Dict, Any


class PerformanceTrendAnalyzer:
    """Analyzes performance trends across multiple games."""

    def calculate_trends(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute aggregate trend data from a list of game analysis results.

        Args:
            results: List of game analysis dicts (each must have
                     'game_accuracy', 'performance_rating', 'user_result',
                     'metadata.Date' optionally).

        Returns:
            Dict with keys: accuracy_trend, rating_trend, win_rate_trend.
        """
        if not results:
            return {"accuracy_trend": 0, "rating_trend": 0, "win_rate_trend": 0}

        accuracies = [g.get("game_accuracy", 0) or 0 for g in results]
        ratings = [g.get("performance_rating", 0) or 0 for g in results]
        outcomes = [g.get("user_result", "draw") for g in results]

        # Simple trend: slope of linear regression over the sequence
        def _slope(values: List[float]) -> float:
            n = len(values)
            if n < 2:
                return 0.0
            indices = list(range(n))
            mean_x = (n - 1) / 2.0
            mean_y = sum(values) / n
            num = den = 0.0
            for i, y in enumerate(values):
                num += (i - mean_x) * (y - mean_y)
                den += (i - mean_x) ** 2
            return num / den if den != 0 else 0.0

        wins = sum(1 for o in outcomes if o == "win")
        losses = sum(1 for o in outcomes if o == "loss")

        return {
            "accuracy_trend": round(_slope(accuracies), 2),
            "rating_trend": round(_slope(ratings), 2),
            "win_rate": round(wins / len(results) * 100, 1) if results else 0,
            "loss_rate": round(losses / len(results) * 100, 1) if results else 0,
            "total_games": len(results),
        }
