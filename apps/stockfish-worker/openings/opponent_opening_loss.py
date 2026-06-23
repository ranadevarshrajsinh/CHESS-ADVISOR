from typing import List, Dict, Any


class OpponentOpeningLoss:
    """Analyzes how opponents lost against the user's openings."""

    def analyze(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """For each opening the user played, report opponent outcomes.

        Args:
            results: List of game analysis dicts with 'opening_name',
                    'user_result', 'user_color', 'opp_accuracy'.

        Returns:
            Dict mapping opening name -> {wins, losses, draws, opponent_accuracy}.
        """
        stats: Dict[str, Dict[str, float]] = {}

        for game in results:
            opening = game.get("opening_name", "Unknown")
            if opening not in stats:
                stats[opening] = {"wins": 0, "losses": 0, "draws": 0,
                                 "total_opp_accuracy": 0.0, "count": 0}

            result = game.get("user_result", "draw")
            if result == "win":
                stats[opening]["losses"] += 1  # opponent lost
            elif result == "loss":
                stats[opening]["wins"] += 1    # opponent won
            else:
                stats[opening]["draws"] += 1

            opp_acc = game.get("opp_accuracy", 0) or 0
            stats[opening]["total_opp_accuracy"] += opp_acc
            stats[opening]["count"] += 1

        result: Dict[str, Any] = {}
        for name, s in stats.items():
            avg_opp_acc = round(s["total_opp_accuracy"] / s["count"], 2) if s["count"] else 0
            result[name] = {
                "opponent_wins": s["wins"],
                "opponent_losses": s["losses"],
                "opponent_draws": s["draws"],
                "opponent_avg_accuracy": avg_opp_acc,
            }

        return result
