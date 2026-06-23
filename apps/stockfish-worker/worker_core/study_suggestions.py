from typing import List, Dict, Any


class StudySuggestions:
    """Generates study focus area suggestions from batch analysis results."""

    def get_suggestions(self, batch_analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Return a list of study focus suggestions.

        Args:
            batch_analysis: Aggregated batch report dict with keys:
                average_accuracy, patterns, mistake_stats, phase_performance, etc.

        Returns:
            List of dicts with keys: topic, priority, message.
        """
        suggestions = []
        avg_acc = batch_analysis.get("average_accuracy", 0) or 0

        # Accuracy-based suggestions
        if avg_acc < 60:
            suggestions.append({
                "topic": "Fundamentals",
                "priority": "High",
                "message": f"Your average accuracy is {avg_acc:.1f}%. Focus on basic tactical patterns and piece safety.",
            })
        elif avg_acc < 75:
            suggestions.append({
                "topic": "Tactical Awareness",
                "priority": "High",
                "message": f"Your average accuracy is {avg_acc:.1f}%. Practice mixed tactical puzzles to sharpen calculation.",
            })
        else:
            suggestions.append({
                "topic": "Strategic Refinement",
                "priority": "Medium",
                "message": f"Your average accuracy is {avg_acc:.1f}%. Study positional play and endgame techniques to gain an edge.",
            })

        # Phase-specific suggestions
        phase_perf = batch_analysis.get("phase_performance", {})
        if phase_perf:
            worst_phase = min(phase_perf, key=phase_perf.get)
            worst_val = phase_perf.get(worst_phase, 0)
            if worst_val < 70:
                phase_labels = {"opening": "opening preparation",
                               "middlegame": "middlegame strategy",
                               "endgame": "endgame technique"}
                suggestions.append({
                    "topic": phase_labels.get(worst_phase, worst_phase).title(),
                    "priority": "High" if worst_val < 60 else "Medium",
                    "message": f"Your {worst_phase} accuracy is {worst_val:.1f}%. Dedicate extra study time to {phase_labels.get(worst_phase, worst_phase)}.",
                })

        # Mistake-driven suggestions
        mistake_stats = batch_analysis.get("mistake_stats", {})
        if mistake_stats:
            blunders = mistake_stats.get("blunders_per_game", 0)
            if blunders > 2:
                suggestions.append({
                    "topic": "Blunder Prevention",
                    "priority": "High",
                    "message": f"You average {blunders:.1f} blunder(s) per game. Practice board vision and calculation exercises.",
                })

        # Pattern-based suggestions
        patterns = batch_analysis.get("patterns", {})
        critical = patterns.get("critical_weaknesses", [])
        if critical:
            for weakness in critical[:2]:
                if isinstance(weakness, str):
                    suggestions.append({
                        "topic": weakness.split("(")[0].strip(),
                        "priority": "Medium",
                        "message": f"Identified weakness: {weakness}",
                    })

        return suggestions
