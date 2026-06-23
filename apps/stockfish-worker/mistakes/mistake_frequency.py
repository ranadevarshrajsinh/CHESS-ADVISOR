from typing import List, Dict, Any


class MistakeFrequency:
    """Computes mistake-rate statistics for single games and across batches."""

    def analyze_frequency(self, analysis_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze mistake frequency for a single game.

        Args:
            analysis_data: List of per-move dicts with 'quality'.

        Returns:
            Dict with keys: blunders, mistakes, inaccuracies, total_moves, error_rate.
        """
        total = len(analysis_data)
        blunders = sum(1 for m in analysis_data if m.get("quality") == "Blunder")
        mistakes = sum(1 for m in analysis_data if m.get("quality") == "Mistake")
        inaccuracies = sum(1 for m in analysis_data if m.get("quality") == "Inaccuracy")

        errors_per_10 = round((blunders + mistakes + inaccuracies) / max(total, 1) * 10, 2)

        return {
            "blunders": blunders,
            "mistakes": mistakes,
            "inaccuracies": inaccuracies,
            "total_moves": total,
            "errors_per_10_moves": errors_per_10,
        }

    def aggregate_batch_frequency(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate mistake frequencies across multiple games.

        Args:
            results: List of game analysis dicts (each with 'mistakes.frequency').

        Returns:
            Dict with keys: blunders_per_game, mistakes_per_game,
            inaccuracies_per_game, errors_per_10_moves.
        """
        if not results:
            return {
                "blunders_per_game": 0,
                "mistakes_per_game": 0,
                "inaccuracies_per_game": 0,
                "errors_per_10_moves": 0,
            }

        total_blunders = 0
        total_mistakes = 0
        total_inaccuracies = 0
        total_moves = 0

        for game in results:
            freq = game.get("mistakes", {}).get("frequency", {})
            if not freq:
                # Try flat keys from analysis_data
                freq = game.get("mistake_frequency", {})
            total_blunders += freq.get("blunders", 0)
            total_mistakes += freq.get("mistakes", 0)
            total_inaccuracies += freq.get("inaccuracies", 0)
            total_moves += freq.get("total_moves", 0)

        n = len(results)
        errors_per_10 = round((total_blunders + total_mistakes + total_inaccuracies) / max(total_moves, 1) * 10, 2)

        return {
            "blunders_per_game": round(total_blunders / n, 2) if n else 0,
            "mistakes_per_game": round(total_mistakes / n, 2) if n else 0,
            "inaccuracies_per_game": round(total_inaccuracies / n, 2) if n else 0,
            "errors_per_10_moves": errors_per_10,
        }
