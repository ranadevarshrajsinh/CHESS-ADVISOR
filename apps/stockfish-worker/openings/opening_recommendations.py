from typing import List, Dict, Any, Optional


class OpeningRecommendations:
    """Generates opening recommendations based on performance and mistake data."""

    def get_recommendations(
        self,
        performance: Dict[str, Any],
        mistakes: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Generate actionable opening recommendations.

        Args:
            performance: Output of OpeningPerformance.analyze_performance().
            mistakes:    Output of OpeningMistakes.analyze_mistakes().

        Returns:
            List of recommendation dicts with keys: opening, type, message, priority.
        """
        recommendations = []

        by_opening = mistakes.get("by_opening", {})

        for opening_name, stats in by_opening.items():
            if not stats or stats.get("total_errors", 0) == 0:
                continue

            blunder_rate = stats.get("blunders", 0)
            mistake_rate = stats.get("mistakes", 0)

            if blunder_rate >= 3:
                recommendations.append({
                    "opening": opening_name,
                    "type": "Study",
                    "message": f"Review {opening_name} — {blunder_rate} blunder(s) suggest gaps in opening knowledge.",
                    "priority": "High",
                })
            elif mistake_rate >= 3:
                recommendations.append({
                    "opening": opening_name,
                    "type": "Study",
                    "message": f"Moderate error rate in {opening_name} ({mistake_rate} mistake(s)). Practice common tactical motifs in this line.",
                    "priority": "Medium",
                })

        # Add strengths based on high accuracy openings
        combined = performance.get("combined", [])
        if isinstance(combined, dict):
            # Flat opening entries
            entries = list(combined.values()) if combined else []
        elif isinstance(combined, list):
            entries = combined
        else:
            entries = []

        for entry in entries:
            if isinstance(entry, dict):
                acc = entry.get("avg_accuracy", 0) or 0
                name = entry.get("name", "Unknown")
                count = entry.get("count", 0)
                if acc >= 80 and count >= 2:
                    recommendations.append({
                        "opening": name,
                        "type": "Strength",
                        "message": f"Strong performance in {name} ({acc:.0f}% avg accuracy). Keep reinforcing it.",
                        "priority": "Low",
                    })

        return recommendations
