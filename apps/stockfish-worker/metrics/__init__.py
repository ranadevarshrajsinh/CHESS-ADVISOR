"""
Metrics sub-package for statistical chess analysis.
Calculates win rates, accuracy, and time management performance.
"""
import logging

try:
    from metrics.win_rate import WinRateAnalyzer
    from metrics.time_analysis import TimeAnalyzer, TimeAnalysis
    from metrics.performance_trends import PerformanceTrendAnalyzer, PerformanceTrends
except ImportError as e:
    logging.error(f"Error in Metrics sub-package: {e}")
    WinRateAnalyzer = TimeAnalyzer = PerformanceTrendAnalyzer = None
    TimeAnalysis = PerformanceTrends = None

__all__ = [
    "WinRateAnalyzer",
    "TimeAnalyzer",
    "TimeAnalysis",
    "PerformanceTrendAnalyzer",
    "PerformanceTrends"
]
