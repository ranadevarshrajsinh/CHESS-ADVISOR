from typing import List, Dict, Any, Optional


class TimeAnalyzer:
    """Analyzes time management across moves and game phases."""

    PHASE_BOUNDARIES = {
        "opening":      (1, 15),
        "middlegame":   (16, 40),
        "endgame":      (41, 999),
    }

    def _get_phase(self, move_num: int) -> str:
        for phase, (start, end) in self.PHASE_BOUNDARIES.items():
            if start <= move_num <= end:
                return phase
        return "endgame"

    def analyze_game_time(self, analysis_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Produce time-analysis summary for a single game.

        Args:
            analysis_data: List of per-move dicts (must include 'time_spent', 'move_num', 'phase').

        Returns:
            Dict with keys: average_time_per_move, phase_time_breakdown,
            time_pressure_risk, think_move_count.
        """
        if not analysis_data:
            return {
                "average_time_per_move": 0,
                "phase_time_breakdown": {"opening": 0, "middlegame": 0, "endgame": 0},
                "time_pressure_risk": "low",
                "think_move_count": 0,
            }

        times = [m.get("time_spent") for m in analysis_data if m.get("time_spent") is not None]
        avg_time = sum(times) / len(times) if times else 0

        # Phase breakdown
        phase_times: Dict[str, list] = {"opening": [], "middlegame": [], "endgame": []}
        for move in analysis_data:
            mn = move.get("move_num", 0)
            ts = move.get("time_spent")
            if ts is not None:
                phase = move.get("phase", self._get_phase(mn))
                phase_times.setdefault(phase, []).append(ts)

        phase_breakdown = {}
        for ph, vals in phase_times.items():
            phase_breakdown[ph] = round(sum(vals) / len(vals), 1) if vals else 0

        # Time pressure risk: if any move took < 5 seconds
        quick_moves = [t for t in times if t < 5]
        risk_ratio = len(quick_moves) / len(times) if times else 0
        if risk_ratio > 0.3:
            time_pressure_risk = "high"
        elif risk_ratio > 0.15:
            time_pressure_risk = "medium"
        else:
            time_pressure_risk = "low"

        # Think moves: moves with above-average time
        think_count = sum(1 for t in times if t > avg_time * 1.5) if avg_time > 0 else 0

        return {
            "average_time_per_move": round(avg_time, 1),
            "phase_time_breakdown": phase_breakdown,
            "time_pressure_risk": time_pressure_risk,
            "think_move_count": think_count,
        }
