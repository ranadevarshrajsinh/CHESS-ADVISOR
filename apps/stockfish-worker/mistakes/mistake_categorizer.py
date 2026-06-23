from typing import List, Dict, Any


class MistakeCategorizer:
    """Categorizes mistakes in a single game by type and phase."""

    # Error types with severity weights
    _CATEGORY_ORDER = [
        "Blunder",
        "Mistake",
        "Inaccuracy",
        "Tactical Oversight",
        "Positional Misjudgment",
        "Opening Knowledge",
        "Endgame Technique",
        "Time Pressure",
        "Hanging Piece",
        "Missed Fork",
        "Missed Pin",
        "Missed Skewer",
        "Missed Discovered Attack",
        "Promotion Error",
    ]

    def categorize_game_mistakes(self, analysis_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Categorize every mistake, blunder, and inaccuracy in a game.

        Args:
            analysis_data: List of per-move dicts with 'quality', 'error_nature', 'phase', etc.

        Returns:
            Dict with keys: by_quality, by_phase, by_nature, total_errors, error_summary.
        """
        by_quality: Dict[str, int] = {}
        by_phase: Dict[str, int] = {}
        by_nature: Dict[str, int] = {}

        for move in analysis_data:
            quality = move.get("quality", "")
            phase = move.get("phase", "unknown")
            nature = move.get("error_nature", "None")

            # Count errors (Inaccuracy, Mistake, Blunder)
            if quality in ("Inaccuracy", "Mistake", "Blunder"):
                by_quality[quality] = by_quality.get(quality, 0) + 1
                by_phase[phase] = by_phase.get(phase, 0) + 1

            if nature != "None" and nature not in ("None",):
                by_nature[nature] = by_nature.get(nature, 0) + 1

        total_errors = sum(by_quality.values())

        # Build a brief summary sentence
        parts = []
        if by_quality.get("Blunder"):
            parts.append(f"{by_quality['Blunder']} blunder(s)")
        if by_quality.get("Mistake"):
            parts.append(f"{by_quality['Mistake']} mistake(s)")
        if by_quality.get("Inaccuracy"):
            parts.append(f"{by_quality['Inaccuracy']} inaccurac(ies)")
        summary = ", ".join(parts) if parts else "No errors detected"

        return {
            "by_quality": by_quality,
            "by_phase": by_phase,
            "by_nature": by_nature,
            "total_errors": total_errors,
            "error_summary": summary,
        }
