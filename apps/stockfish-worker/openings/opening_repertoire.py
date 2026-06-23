from typing import List, Dict, Any


class OpeningRepertoire:
    """Analyzes opening repertoire from game results — identifies which
    openings a player uses as White and as Black."""

    def analyze_repertoire(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Build a repertoire snapshot from analyzed games.

        Args:
            results: List of game analysis dicts with 'opening_name',
                    'user_color', 'eco_code'.

        Returns:
            Dict with keys: user_as_white, user_as_black, opening_counts.
        """
        white_openings: Dict[str, int] = {}
        black_openings: Dict[str, int] = {}

        for game in results:
            opening = game.get("opening_name", "Unknown")
            color = game.get("user_color", "white")
            if color == "white":
                white_openings[opening] = white_openings.get(opening, 0) + 1
            else:
                black_openings[opening] = black_openings.get(opening, 0) + 1

        white_sorted = sorted(white_openings.items(), key=lambda x: -x[1])
        black_sorted = sorted(black_openings.items(), key=lambda x: -x[1])

        return {
            "user_as_white": [name for name, _ in white_sorted],
            "user_as_black": [name for name, _ in black_sorted],
            "opening_counts": {
                "white": dict(white_sorted),
                "black": dict(black_sorted),
            },
        }
