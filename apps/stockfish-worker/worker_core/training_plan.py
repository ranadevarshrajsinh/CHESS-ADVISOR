import logging
from typing import List, Dict, Any
from worker_core.study_suggestions import StudySuggestions
from worker_core.opening_suggestions import OpeningSuggestions
from worker_core.puzzle_generator import PuzzleGenerator

logger = logging.getLogger(__name__)

class TrainingPlan:
    """Aggregates all suggestions into a unified training plan."""
    
    def __init__(self):
        self.study = StudySuggestions()
        self.openings = OpeningSuggestions()
        self.puzzles = PuzzleGenerator()

    def generate_plan(self, batch_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Creates a personalized training plan from batch analysis results."""
        acc = batch_analysis.get('average_accuracy', 0) or 0
        strategy = self._determine_overall_strategy(batch_analysis)
        logger.info("PLAN_GENERATE avg_accuracy=%.1f%% strategy=%s games_analyzed=%d",
                     acc, strategy, batch_analysis.get('total_analyzed', 0))

        study_tips = self.study.get_suggestions(batch_analysis)
        opening_tips = self.openings.get_suggestions(batch_analysis)
        puzzle_themes = self.puzzles.suggest_puzzle_themes(batch_analysis)

        logger.info("PLAN_RESULT user=%s strategy=%s study_topics=%d opening_adjustments=%d puzzle_themes=%d",
                     batch_analysis.get('username'), strategy,
                     len(study_tips), len(opening_tips), len(puzzle_themes))
        
        return {
            "overall_strategy": strategy,
            "study_focus": study_tips,
            "opening_adjustments": opening_tips,
            "recommended_puzzle_themes": puzzle_themes,
            "estimated_training_time": "1 hour per day"
        }

    def _determine_overall_strategy(self, batch_analysis: Dict[str, Any]) -> str:
        acc = batch_analysis.get('average_accuracy', 0)
        if acc < 60:
            return "Solidify Foundations"
        elif acc < 75:
            return "Sharpen Tactics and Opening Theory"
        else:
            return "Refine Strategic Execution and Endgame Mastery"

class TrainingPlanGenerator(TrainingPlan):
    """Alias for backward compatibility."""
    pass
