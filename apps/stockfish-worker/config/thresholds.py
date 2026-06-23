from typing import Dict, Any

# Thresholds for move classification (dual-gate system).
# CP loss sets the error floor; win-prob drop confirms it mattered.
ANALYSIS_THRESHOLDS: Dict[str, Any] = {
    # Centipawn-loss gates  (absolute loss from the user's perspective)
    "BLUNDER_THRESHOLD":        200,
    "MISTAKE_THRESHOLD":        100,
    "INACCURACY_THRESHOLD":      50,
    "EXCELLENT_MOVE_THRESHOLD":  10,

    # Win-probability-drop gates  (percentage points)
    "BLUNDER_WIN_PROB_DROP":      15.0,
    "MISTAKE_WIN_PROB_DROP":       7.0,
    "INACCURACY_WIN_PROB_DROP":    3.0,

    # Engine evaluation limits
    "MAX_ANALYSIS_NODES":     500_000,
    "MATE_SCORE":             10_000,
}
