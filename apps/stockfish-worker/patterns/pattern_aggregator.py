from typing import List, Dict, Any


class PatternAggregator:
    """Aggregates tactical, positional, endgame, and time-pressure patterns
    across moves in a single game or across multiple games."""

    def aggregate_game_patterns(self, analysis_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze patterns within a single game.

        Args:
            analysis_data: List of per-move dicts with keys 'phase', 'quality',
                           'error_nature', 'accuracy', 'cp_loss', 'time_spent'.

        Returns:
            Dict with keys: tactical, positional, endgame, time_pressure, critical_weaknesses.
        """
        if not analysis_data:
            return {
                "tactical": {"tactical_summary": "No data"},
                "positional": {"positional_summary": "No data"},
                "endgame": {"endgame_summary": "No data"},
                "time_pressure": {"time_pressure_summary": "No data"},
                "critical_weaknesses": [],
            }

        phases = {"opening": [], "middlegame": [], "endgame": []}
        errors_by_nature: Dict[str, int] = {}
        total_moves = len(analysis_data)

        for move in analysis_data:
            phase = move.get("phase", "middlegame")
            phases.setdefault(phase, []).append(move)

            nature = move.get("error_nature", "None")
            if nature != "None":
                errors_by_nature[nature] = errors_by_nature.get(nature, 0) + 1

        # Tactical summary
        tactical_count = sum(1 for m in analysis_data
                             if m.get("error_nature") in ("Tactical Oversight", "Hanging Piece",
                                                           "Missed Fork", "Missed Pin", "Missed Skewer"))
        tactical = {
            "tactical_summary": f"{tactical_count} tactical error(s) in {total_moves} moves",
            "tactical_error_count": tactical_count,
            "total_moves": total_moves,
        }

        # Positional summary
        positional_count = sum(1 for m in analysis_data
                               if m.get("error_nature") == "Positional Misjudgment")
        positional = {
            "positional_summary": f"{positional_count} positional error(s)",
            "positional_error_count": positional_count,
        }

        # Endgame summary
        endgame_moves = phases.get("endgame", [])
        endgame_accuracy = (
            sum(m.get("accuracy", 0) or 0 for m in endgame_moves) / len(endgame_moves)
            if endgame_moves else 0
        )
        endgame = {
            "endgame_summary": f"Endgame accuracy: {endgame_accuracy:.1f}% ({len(endgame_moves)} moves)",
            "endgame_accuracy": round(endgame_accuracy, 1),
            "endgame_move_count": len(endgame_moves),
        }

        # Time pressure summary
        quick_moves = [m for m in analysis_data
                       if m.get("time_spent") is not None and m["time_spent"] < 5]
        time_pressure = {
            "time_pressure_summary": f"{len(quick_moves)} move(s) under time pressure (<5s)",
            "time_pressure_move_count": len(quick_moves),
        }

        # Critical weaknesses (top error types)
        sorted_errors = sorted(errors_by_nature.items(), key=lambda x: -x[1])
        critical_weaknesses = [f"{nature} ({count}x)" for nature, count in sorted_errors[:5]]

        return {
            "tactical": tactical,
            "positional": positional,
            "endgame": endgame,
            "time_pressure": time_pressure,
            "critical_weaknesses": critical_weaknesses,
        }

    def aggregate_batch_patterns(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate patterns across multiple games.

        Args:
            results: List of game analysis dicts (each with 'patterns' key).

        Returns:
            Aggregated pattern dict with combined stats.
        """
        if not results:
            return self.aggregate_game_patterns([])

        tactical_total = 0
        positional_total = 0
        endgame_accuracies = []
        endgame_counts = []
        time_pressure_moves = 0
        all_weaknesses: Dict[str, int] = {}

        for game in results:
            patterns = game.get("patterns", {})
            tac = patterns.get("tactical", {})
            tactical_total += tac.get("tactical_error_count", 0)

            pos = patterns.get("positional", {})
            positional_total += pos.get("positional_error_count", 0)

            eg = patterns.get("endgame", {})
            if eg.get("endgame_accuracy") is not None:
                endgame_accuracies.append(eg["endgame_accuracy"])
                endgame_counts.append(eg.get("endgame_move_count", 0))

            tp = patterns.get("time_pressure", {})
            time_pressure_moves += tp.get("time_pressure_move_count", 0)

            for w in patterns.get("critical_weaknesses", []):
                all_weaknesses[w] = all_weaknesses.get(w, 0) + 1

        total_games = len(results)
        avg_endgame_acc = sum(endgame_accuracies) / len(endgame_accuracies) if endgame_accuracies else 0

        sorted_w = sorted(all_weaknesses.items(), key=lambda x: -x[1])

        return {
            "tactical": {"tactical_summary": f"Avg {tactical_total/total_games:.1f} tactical errors/game"},
            "positional": {"positional_summary": f"Avg {positional_total/total_games:.1f} positional errors/game"},
            "endgame": {"endgame_summary": f"Avg endgame accuracy: {avg_endgame_acc:.1f}%"},
            "time_pressure": {"time_pressure_summary": f"Avg {time_pressure_moves/total_games:.1f} rushed moves/game"},
            "critical_weaknesses": [w for w, _ in sorted_w[:5]],
        }
