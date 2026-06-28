import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class OpeningSuggestions:
    """Generates opening repertoire adjustment suggestions."""

    def get_suggestions(self, batch_analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Analyze opening performance and return adjustment suggestions.

        Args:
            batch_analysis: Aggregated batch report dict with 'openings' key
                           containing repertoire, performance, and recommendations.

        Returns:
            List of dicts with keys: opening, priority, suggestion (or message).
        """
        logger.debug("OPENING_SUGGESTIONS_START")
        suggestions = []
        openings = batch_analysis.get("openings", {})

        # Use pre-computed recommendations if available
        recommendations = openings.get("recommendations", [])
        if recommendations:
            for rec in recommendations:
                if isinstance(rec, dict):
                    suggestions.append({
                        "opening": rec.get("opening", "Unknown"),
                        "priority": rec.get("priority", "Medium"),
                        "suggestion": rec.get("message", ""),
                    })

        # Fallback: analyze performance directly
        performance = openings.get("performance", {})
        combined = performance.get("combined", [])
        if isinstance(combined, list):
            for entry in combined:
                if not isinstance(entry, dict):
                    continue
                name = entry.get("name", "Unknown")
                acc = entry.get("avg_accuracy", 0) or 0
                count = entry.get("count", 0)

                if acc < 60 and count >= 2:
                    suggestions.append({
                        "opening": name,
                        "priority": "High",
                        "suggestion": f"Accuracy in {name} is only {acc:.0f}%. Review key lines and common tactics in this opening.",
                    })
                elif acc < 75 and count >= 2:
                    suggestions.append({
                        "opening": name,
                        "priority": "Medium",
                        "suggestion": f"Moderate performance in {name} ({acc:.0f}%). Consider deepening your repertoire.",
                    })

        # Deduplicate by opening name
        seen = set()
        deduped = []
        for s in suggestions:
            key = s.get("opening", "")
            if key not in seen:
                seen.add(key)
                deduped.append(s)

        logger.info("OPENING_SUGGESTIONS_DONE total=%d deduped=%d", len(suggestions), len(deduped))
        return deduped
