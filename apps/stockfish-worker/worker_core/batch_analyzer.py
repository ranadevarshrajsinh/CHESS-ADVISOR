import os
import chess.pgn
import logging
from typing import List, Dict, Any, Optional
from worker_core.game_analyzer import GameAnalyzer
from worker_core.engine_manager import EngineManager
from metrics.time_analysis import TimeAnalyzer
from metrics.performance_trends import PerformanceTrendAnalyzer
from openings.opening_repertoire import OpeningRepertoire
from openings.opening_performance import OpeningPerformance
from openings.opening_mistakes import OpeningMistakes
from openings.opening_recommendations import OpeningRecommendations
from openings.opponent_opening_loss import OpponentOpeningLoss
from patterns.pattern_aggregator import PatternAggregator
from mistakes.mistake_frequency import MistakeFrequency
from storage.analysis_storage import AnalysisStorage

logger = logging.getLogger(__name__)

class BatchAnalyzer:
    """Handles analysis of multiple games, providing aggregated statistics."""
    
    def __init__(self, engine_path: str = None):
        self.engine_manager = EngineManager(stockfish_path=engine_path)
        self.analyzer = GameAnalyzer(engine_manager=self.engine_manager)
        self.time_analyzer = TimeAnalyzer()
        self.trend_analyzer = PerformanceTrendAnalyzer()
        
        # Opening Analyzers
        self.opening_repertoire = OpeningRepertoire()
        self.opening_performance = OpeningPerformance()
        self.opening_mistakes = OpeningMistakes()
        self.opening_recommendations = OpeningRecommendations()
        self.opponent_opening_loss = OpponentOpeningLoss()
        
        # Pattern Analyzers
        self.pattern_aggregator = PatternAggregator()

        # Mistake Analyzers
        self.mistake_frequency = MistakeFrequency()

        # Disk cache
        self.storage = AnalysisStorage()

    def analyze_directory(self, directory_path: str, username: str, limit: int = 10) -> Dict[str, Any]:
        """Analyzes all PGN files in a directory for a specific user."""
        def _sort_key(fname):
            stem = fname[:-4]  # strip .pgn
            last = stem.rsplit("_", 1)[-1]
            return int(last) if last.isdigit() else 0

        pgn_files = sorted(
            [f for f in os.listdir(directory_path) if f.endswith(".pgn")],
            key=_sort_key,
            reverse=True,
        )[:limit]

        logger.info("BATCH_START user=%s dir=%s limit=%d total_pgns_found=%d",
                     username, directory_path, limit, len(pgn_files))

        if not pgn_files:
            logger.warning("BATCH_NO_FILES user=%s dir=%s", username, directory_path)
            return {"username": username, "total_analyzed": 0, "summary": "No PGN files found."}

        # Fast path: persisted aggregate is still fresh (no PGN newer than the report)
        cached_report = self.storage.get_batch_report(username, limit, directory_path)
        if cached_report:
            return cached_report

        # Incremental path: reuse raw results for games already processed, only
        # run Stockfish on files that are genuinely new.
        old_raw = self.storage.get_batch_raw(username, limit) or []
        old_by_file = {r['filename']: r for r in old_raw if r.get('filename')}

        new_files = [f for f in pgn_files if f not in old_by_file]
        reused_count = len(pgn_files) - len(new_files)

        logger.info("BATCH_INCREMENTAL user=%s new=%d reused=%d total=%d",
                     username, len(new_files), reused_count, len(pgn_files))

        new_results = []
        engine_started = False
        try:
            for idx, filename in enumerate(new_files, 1):
                filepath = os.path.join(directory_path, filename)
                pgn_mtime = os.path.getmtime(filepath)

                # Individual JSON cache may already exist (e.g. from a prior single-game analysis)
                if self.storage.is_fresh(username, filename, pgn_mtime):
                    cached = self.storage.get_analysis(username, filename)
                    if cached:
                        cached['filename'] = filename
                        new_results.append(cached)
                        logger.info("BATCH_CACHE_HIT user=%s game=%s (%d/%d)",
                                     username, filename, idx, len(new_files))
                        continue

                if not engine_started:
                    logger.info("ENGINE_START reason=batch_analyzer user=%s", username)
                    self.engine_manager.start()
                    engine_started = True

                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        game = chess.pgn.read_game(f)
                        if game:
                            analysis = self.analyzer.analyze_game(game, username)
                            analysis['filename'] = filename
                            self.storage.save_analysis(username, filename, analysis)
                            new_results.append(analysis)
                            logger.info("BATCH_ANALYZED user=%s game=%s (%d/%d) accuracy=%.1f%%",
                                         username, filename, idx, len(new_files),
                                         analysis.get('game_accuracy', 0))
                        else:
                            logger.warning("BATCH_SKIP user=%s game=%s reason=empty_pgn", username, filename)
                except OSError as e:
                    logger.error("BATCH_READ_ERROR user=%s game=%s error=%s", username, filename, e)
                except ValueError as e:
                    logger.error("BATCH_PGN_ERROR user=%s game=%s error=%s", username, filename, e)
                except Exception:
                    logger.exception("BATCH_UNEXPECTED_ERROR user=%s game=%s", username, filename)
        finally:
            if engine_started:
                self.engine_manager.stop()
                logger.info("ENGINE_STOP reason=batch_complete user=%s", username)

        # Merge new results with reused old results, preserving recency order
        all_by_file = {**old_by_file, **{r['filename']: r for r in new_results}}
        all_results = [all_by_file[f] for f in pgn_files if f in all_by_file]

        logger.info("BATCH_AGGREGATING user=%s games=%d new=%d reused=%d",
                     username, len(all_results), len(new_results), reused_count)
        report = self._aggregate_results(all_results, username)
        self.storage.save_batch_report(username, limit, report)
        self.storage.save_batch_raw(username, limit, all_results)
        logger.info("BATCH_DONE user=%s analyzed=%d avg_accuracy=%.1f%%",
                     username, report.get('total_analyzed', 0),
                     report.get('average_accuracy', 0))
        return report

    def analyze_pgn_list(self, pgn_strings: List[str], username: str) -> Dict[str, Any]:
        """Analyzes a list of PGN strings."""
        logger.info("BATCH_PGN_LIST user=%s count=%d", username, len(pgn_strings))
        results = []
        self.engine_manager.start()
        
        try:
            for idx, pgn_text in enumerate(pgn_strings, 1):
                try:
                    analysis = self.analyzer.analyze_pgn(pgn_text, username)
                    results.append(analysis)
                    logger.info("BATCH_PGN_DONE user=%s (%d/%d) accuracy=%.1f%%",
                                 username, idx, len(pgn_strings),
                                 analysis.get('game_accuracy', 0))
                except ValueError as e:
                    logger.error("BATCH_PGN_SKIP user=%s index=%d error=%s", username, idx, e)
                except Exception:
                    logger.exception("BATCH_PGN_ERROR user=%s index=%d", username, idx)
        finally:
            self.engine_manager.stop()
            
        return self._aggregate_results(results, username)

    def _aggregate_results(self, results: List[Dict[str, Any]], username: str) -> Dict[str, Any]:
        """Compiles individual game results into a summary report."""
        if not results:
            logger.warning("BATCH_AGGREGATE_EMPTY user=%s", username)
            return {"username": username, "total_analyzed": 0, "summary": "No games were analyzed."}

        logger.info("BATCH_AGGREGATE user=%s games=%d", username, len(results))

        total_accuracy = 0
        quality_counts = {
            "Brilliant": 0,
            "Best": 0,
            "Excellent": 0,
            "Good": 0,
            "Book": 0,
            "Forced": 0,
            "Inaccuracy": 0,
            "Mistake": 0,
            "Blunder": 0,
        }
        phase_stats = {
            "opening": {"accuracy": 0, "moves": 0},
            "middlegame": {"accuracy": 0, "moves": 0},
            "endgame": {"accuracy": 0, "moves": 0}
        }
        
        for game in results:
            total_accuracy += game.get('game_accuracy', 0)
            for move in game.get('move_history', []):
                q = move.get('quality')
                if q in quality_counts:
                    quality_counts[q] += 1
                
                phase = move.get('phase')
                if phase in phase_stats:
                    phase_stats[phase]['accuracy'] += move.get('accuracy', 0)
                    phase_stats[phase]['moves'] += 1

        num_games = len(results)
        
        # Calculate averages for phases
        for phase in phase_stats:
            if phase_stats[phase]['moves'] > 0:
                phase_stats[phase]['avg_accuracy'] = round(phase_stats[phase]['accuracy'] / phase_stats[phase]['moves'], 2)
            else:
                phase_stats[phase]['avg_accuracy'] = 0

        trends = self.trend_analyzer.calculate_trends(results)
        
        # Opening analysis
        repertoire    = self.opening_repertoire.analyze_repertoire(results)
        performance   = self.opening_performance.analyze_performance(results)
        mistakes      = self.opening_mistakes.analyze_mistakes(results)
        recommendations = self.opening_recommendations.get_recommendations(performance, mistakes)
        opp_losses    = self.opponent_opening_loss.analyze(results)
        
        # Pattern analysis
        patterns = self.pattern_aggregator.aggregate_batch_patterns(results)
        
        # Mistake analysis
        mistake_stats = self.mistake_frequency.aggregate_batch_frequency(results)

        return {
            "username": username,
            "total_analyzed": num_games,
            "average_accuracy": round(total_accuracy / num_games, 2) if num_games > 0 else 0,
            "move_quality_distribution": quality_counts,
            "phase_performance": {p: phase_stats[p]['avg_accuracy'] for p in phase_stats},
            "trends": trends,
            "openings": {
                "repertoire": repertoire,
                "performance": performance,
                "mistakes": mistakes,
                "recommendations": recommendations,
                "opponent_loss_analysis": opp_losses,
            },
            "patterns": patterns,
            "mistake_stats": mistake_stats,
            "individual_games": [
                {
                    "filename": g.get('filename'),
                    "accuracy": g.get('game_accuracy'),
                    "performance_rating": g.get('performance_rating'),
                    "result": g.get('metadata', {}).get('Result'),
                    "user_result": g.get('user_result', '?'),
                    "date": g.get('metadata', {}).get('Date'),
                    "opening": g.get('opening_name'),
                    "eco": g.get('eco_code'),
                    "white": g.get('white_player'),
                    "black": g.get('black_player'),
                    "white_rating": g.get('white_rating'),
                    "black_rating": g.get('black_rating'),
                    "user_color": g.get('user_color'),
                    # Full move-by-move data so consumers don't need to open cache files
                    "move_history": g.get('move_history', []),
                } for g in results
            ],
            # All moves across every game grouped by quality label
            "move_breakdown": self._build_move_breakdown(results),
        }

    @staticmethod
    def _build_move_breakdown(results: list) -> dict:
        """Return every user move grouped by quality, with game context attached."""
        order = ["Brilliant", "Best", "Excellent", "Good",
                 "Book", "Forced", "Inaccuracy", "Mistake", "Blunder"]
        breakdown: dict = {q: [] for q in order}

        for g in results:
            color = g.get('user_color', 'white')
            opp   = g.get('black_player') if color == 'white' else g.get('white_player')
            result = g.get('user_result', '?')
            game_label = f"vs {opp} ({result.upper()})"

            for m in g.get('move_history', []):
                quality = m.get('quality', '?')
                if quality not in breakdown:
                    breakdown[quality] = []
                breakdown[quality].append({
                    "game":          game_label,
                    "move_num":      m.get('move_num'),
                    "san":           m.get('san'),
                    "best_move":     m.get('best_move'),
                    "eval_before":   m.get('eval_before'),
                    "eval_after":    m.get('eval_after'),
                    "cp_loss":       m.get('cp_loss'),
                    "win_prob_drop": m.get('win_prob_drop'),
                    "accuracy":      m.get('accuracy'),
                    "phase":         m.get('phase'),
                    "error_nature":  m.get('error_nature'),
                })

        return breakdown
