"""
Metrics sub-package for statistical chess analysis.
Calculates win rates, accuracy, and time management performance.
"""
import logging

try:
    from metrics.accuracy_metrics import calculate_centipawn_loss, calculate_move_accuracy, calculate_win_prob_drop
    from metrics.time_analysis import TimeAnalyzer
    from metrics.performance_trends import PerformanceTrendAnalyzer
    from worker_core.win_rate import WinRateAnalyzer
except ImportError as e:
    logging.error(f"Error in Metrics sub-package: {e}")
    WinRateAnalyzer = AccuracyMetrics = None
    TimeAnalyzer = PerformanceTrendAnalyzer = None

__all__ = [
    "WinRateAnalyzer",
    "TimeAnalyzer",
    "PerformanceTrendAnalyzer",
    "calculate_centipawn_loss",
    "calculate_move_accuracy",
    "calculate_win_prob_drop",
]
