import chess
import chess.pgn
import io
import logging
from typing import Dict, Any, List, Optional
from worker_core.engine_manager import EngineManager
from worker_core.move_classifier import MoveClassifier, identify_error_nature
from worker_core.tactical_validator import TacticalValidator
from metrics.accuracy_metrics import calculate_centipawn_loss, calculate_move_accuracy, calculate_win_prob_drop
from utils.time_utils import calculate_time_spent
from utils.position_utils import PositionUtils
from config.thresholds import ANALYSIS_THRESHOLDS
from metrics.time_analysis import TimeAnalyzer
from patterns.pattern_aggregator import PatternAggregator
from mistakes.mistake_categorizer import MistakeCategorizer
from mistakes.critical_moments import CriticalMoments
from mistakes.mistake_frequency import MistakeFrequency
from utils.opening_db import OpeningDB
from storage.analysis_storage import CURRENT_ANALYSIS_VERSION
from storage.position_cache import PositionCache

logger = logging.getLogger(__name__)

_PIECE_VALUES = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0,
}

def _is_sacrifice_move(board: chess.Board, move: chess.Move) -> bool:
    """Return True if the moved piece lands on a square where a lower-value opponent piece can capture it."""
    piece = board.piece_at(move.from_square)
    if not piece:
        return False
    piece_val = _PIECE_VALUES.get(piece.piece_type, 0)
    temp = board.copy()
    temp.push(move)
    for attacker_sq in temp.attackers(not piece.color, move.to_square):
        attacker = temp.piece_at(attacker_sq)
        if attacker and _PIECE_VALUES.get(attacker.piece_type, 0) < piece_val:
            return True
    return False


class GameAnalyzer:
    """Main orchestrator for single-game analysis using all sub-modules"""

    # Shared across all instances and games in the same server process.
    # Opening positions (first ~15 moves) are identical across thousands of games
    # — this eliminates redundant engine calls for those positions.
    _position_cache: PositionCache = PositionCache()

    def __init__(self, engine_path: str = None, engine_manager: Optional[EngineManager] = None):
        self.engine = engine_manager or EngineManager(stockfish_path=engine_path)
        self.time_analyzer = TimeAnalyzer()
        self.pattern_aggregator = PatternAggregator()
        self.mistake_categorizer = MistakeCategorizer()
        self.critical_moments = CriticalMoments()
        self.mistake_frequency = MistakeFrequency()

    def analyze_pgn(self, pgn_text: str, user_username: str) -> Dict[str, Any]:
        """Convenience method to analyze a single PGN string"""
        was_running = self.engine.engine is not None
        if not was_running:
            logger.info("ENGINE_START reason=analyze_pgn user=%s", user_username)
            self.engine.start()
        
        pgn_io = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn_io)
        if not game: 
            if not was_running:
                self.engine.stop()
                logger.info("ENGINE_STOP reason=parse_failed user=%s", user_username)
            raise ValueError("Invalid PGN")
        
        logger.info("ANALYZE_PGN user=%s white=%s black=%s result=%s",
                     user_username,
                     game.headers.get("White", "?"),
                     game.headers.get("Black", "?"),
                     game.headers.get("Result", "*"))
        result = self.analyze_game(game, user_username)
        
        if not was_running:
            self.engine.stop()
            logger.info("ENGINE_STOP reason=analyze_complete user=%s", user_username)
            
        return result

    def _estimate_performance_rating(
        self,
        accuracy: float,
        move_count: int,
        opp_accuracy: float = 70.0,
        opp_elo: int = 0,
        user_result: str = "unknown",
    ) -> int:
        """
        Performance rating anchored to opponent ELO, scaled by accuracy and result.

        Win  — quadratic bonus up to +300 above opponent ELO.
               At 50 % accuracy the bonus is 0; at 95 %+ it is capped at 300.
               Formula: bonus = min(300, 0.1*(acc-50)^2 + 2.8*(acc-50))

        Loss — linear penalty: each percentage point below 100 % costs 4 ELO.
               A 65 % accuracy loss → -140; a 100 % accuracy loss → 0.

        Draw — small symmetric delta: +/-2 ELO per point above/below 50 %.

        This keeps performance intuitive:
          - winning always yields perf >= opp_elo (you beat them, so you performed at least as well)
          - a well-played loss (~65 %) sits ~140 below opp_elo, not 400 below
        """
        if opp_elo <= 0:
            return max(100, int(accuracy * 18))

        acc_above = max(0.0, accuracy - 50.0)

        if user_result == "win":
            bonus = min(300.0, 0.1 * acc_above ** 2 + 2.8 * acc_above)
            return max(100, opp_elo + int(bonus))

        elif user_result == "loss":
            penalty = (100.0 - accuracy) * 4.0
            return max(100, opp_elo - int(penalty))

        else:  # draw
            delta = int((accuracy - 50.0) * 2.0)
            return max(100, opp_elo + delta)

    def analyze_game(self, game: chess.pgn.Game, user_username: str) -> Dict[str, Any]:
        """Core analysis logic that can be called repeatedly with an open engine"""
        # Ensure engine is started
        if self.engine.engine is None:
            logger.info("ENGINE_START reason=analyze_game user=%s", user_username)
            self.engine.start()

        # Determine color
        white_player = game.headers.get("White", "").lower()
        user_color = "white" if user_username.lower() in white_player else "black"

        # Opponent ELO and game result — used for honest performance rating
        try:
            opp_elo = int(game.headers.get(
                "BlackElo" if user_color == "white" else "WhiteElo", 0
            ))
        except (ValueError, TypeError):
            opp_elo = 0

        result_str = game.headers.get("Result", "*")
        if user_color == "white":
            user_result = "win" if result_str == "1-0" else ("draw" if result_str == "1/2-1/2" else "loss")
        else:
            user_result = "win" if result_str == "0-1" else ("draw" if result_str == "1/2-1/2" else "loss")
        
        logger.info("GAME_START user=%s color=%s result=%s opp_elo=%d",
                     user_username, user_color, user_result, opp_elo)

        # Opening identification fallback
        opening_name = game.headers.get("Opening")
        eco_code = game.headers.get("ECO")
        
        if not opening_name or opening_name == "Unknown Opening":
            # Walk up to 15 moves and use the last position that matches a known
            # opening line.  Position-hash lookup is transposition-aware, so
            # lines reached via unusual move orders are still recognised.
            temp_board = game.board()
            last_match = None
            for move in game.mainline_moves():
                temp_board.push(move)
                match = OpeningDB.get_opening_by_position(temp_board)
                if match:
                    last_match = match
                if temp_board.fullmove_number > 15:
                    break

            if last_match:
                opening_name = last_match['name']
                eco_code = last_match['eco']
                game.headers["Opening"] = opening_name
                game.headers["ECO"] = eco_code
                logger.info("OPENING_DETECTED name=%s eco=%s method=position_hash", opening_name, eco_code)
            else:
                logger.info("OPENING_DETECTED name=Unknown method=not_found")

        logger.info("OPENING user=%s opening=%s eco=%s", user_username, opening_name, eco_code)
        
        # Reset board and node for analysis loop
        board = game.board()
        analysis_data = []
        last_clock = None
        move_accuracies = []
        opp_accuracies = [] # Track opponent accuracy to judge complexity

        node = game
        full_history = []

        # Evaluate the starting position once — reused as first move's pre-move data
        current_pv = self.engine.evaluate_position(board, multipv=2, cache=self._position_cache)

        while node.next():
            node = node.next()
            move = node.move
            is_user_move = (board.turn == chess.WHITE and user_color == "white") or \
                          (board.turn == chess.BLACK and user_color == "black")

            clock = node.clock()
            time_spent = calculate_time_spent(last_clock, clock) if is_user_move else None
            last_clock = clock

            san_move = board.san(move)
            full_history.append({"san": san_move, "is_user": is_user_move})

            # Capture board state before move for tactical analysis
            board_before = board.copy()

            # Use pre-computed evaluation (no extra engine call needed here)
            top_pv = current_pv

            # Best move context
            best_move_eval = top_pv[0]
            best_move_san = best_move_eval.get('move_san', 'N/A')
            best_move_obj = best_move_eval.get('move')

            # Check if it's an 'only move' (second best move is much worse)
            is_only_move = False
            if len(top_pv) > 1:
                if abs(best_move_eval['eval_cp'] - top_pv[1]['eval_cp']) >= 100:
                    is_only_move = True

            # Convert to absolute (White-centric) for calculation
            eval_val_before = best_move_eval['eval_cp'] if board.turn == chess.WHITE else -best_move_eval['eval_cp']

            # Phase detection (before push)
            phase = PositionUtils.detect_game_phase(board)

            # Capture move number BEFORE push — fullmove_number increments after Black moves,
            # so reading it after the push would make all Black moves appear one too high.
            move_num = board.fullmove_number

            san_move = board.san(move)
            is_best_move = (san_move == best_move_san)

            # Sacrifice detection: piece moves to a square capturable by a lower-value piece
            is_sacrifice = False
            if is_best_move:
                is_sacrifice = _is_sacrifice_move(board_before, move)

            board.push(move)

            # Single post-move evaluation — also serves as next iteration's pre-move data
            current_pv = self.engine.evaluate_position(board, multipv=2, cache=self._position_cache)
            eval_val_after = current_pv[0]['eval_cp'] if board.turn == chess.WHITE else -current_pv[0]['eval_cp']

            # CP loss (for classification thresholds)
            cp_loss = calculate_centipawn_loss(eval_val_before, eval_val_after, "white" if board.turn == chess.BLACK else "black")

            # Win-probability accuracy (user-centric perspective)
            user_cp_before = eval_val_before if user_color == "white" else -eval_val_before
            user_cp_after  = eval_val_after  if user_color == "white" else -eval_val_after
            win_prob_drop = calculate_win_prob_drop(user_cp_before, user_cp_after)
            move_acc = calculate_move_accuracy(user_cp_before, user_cp_after)

            if is_user_move:
                # Book detection via Zobrist hash — transposition-aware, O(1).
                # board has already been pushed, so we're checking the resulting position.
                is_book = phase == 'opening' and OpeningDB.is_book_position(board)

                # Detailed classification — win-prob drop is the primary signal
                move_quality = MoveClassifier.classify(
                    cp_loss,
                    ANALYSIS_THRESHOLDS,
                    is_best_move=is_best_move,
                    is_only_move=is_only_move,
                    is_sacrifice=is_sacrifice,
                    win_prob_drop=win_prob_drop,
                )

                # Book/Dubious split: a clean book move is labelled "Book"; a
                # book move that is still objectively bad keeps its quality label
                # (Inaccuracy / Mistake / Blunder) so the student can see both
                # facts — "this is theory" AND "theory here is risky."
                if is_book and move_quality in ("Best", "Excellent", "Good"):
                    move_quality = "Book"

                # Heuristic error nature
                error_nature = identify_error_nature(time_spent, cp_loss, phase, win_prob_drop=win_prob_drop)

                # Refined tactical validation
                tactical_error = TacticalValidator.validate_move(
                    board_before, move, best_move_obj, cp_loss, phase
                )
                if tactical_error:
                    error_nature = tactical_error

                # Only count moves that required a genuine decision toward accuracy.
                # Book moves score ~100% by definition (zero CP loss), and Forced moves
                # aren't a decision at all — including either inflates the average.
                if move_quality not in ("Book", "Forced"):
                    move_accuracies.append(move_acc)

                # User-centric evaluations (pawns, not centipawns)
                user_eval_before = round(user_cp_before / 100.0, 2)
                user_eval_after  = round(user_cp_after  / 100.0, 2)

                analysis_data.append({
                    "move_num": move_num,
                    "san": san_move,
                    "eval_before": user_eval_before,
                    "eval_after": user_eval_after,
                    "eval": user_eval_after,
                    "best_move": best_move_san,
                    "cp_loss": cp_loss,
                    "win_prob_drop": round(win_prob_drop, 2),
                    "accuracy": round(move_acc, 2),
                    "quality": move_quality,
                    "is_book": is_book,
                    "time_spent": time_spent,
                    "error_nature": error_nature,
                    "phase": phase
                })
            else:
                opp_accuracies.append(move_acc)

        game_accuracy = round(sum(move_accuracies)/len(move_accuracies), 2) if move_accuracies else 0
        opp_accuracy = round(sum(opp_accuracies)/len(opp_accuracies), 2) if opp_accuracies else 70.0
        
        perf_rating = self._estimate_performance_rating(
            game_accuracy, len(analysis_data), opp_accuracy,
            opp_elo=opp_elo, user_result=user_result,
        )

        logger.info("GAME_DONE user=%s result=%s opening=%s accuracy=%.1f%% perf_rating=%d moves_analyzed=%d user_moves=%d",
                     user_username, user_result, opening_name,
                     game_accuracy, perf_rating, len(analysis_data), len(move_accuracies))

        return {
            "analysis_version": CURRENT_ANALYSIS_VERSION,
            "metadata": dict(game.headers),
            "user_color": user_color,
            "user_result": user_result,   # "win" / "loss" / "draw" — always from user's POV
            "white_player": game.headers.get("White", "Unknown"),
            "black_player": game.headers.get("Black", "Unknown"),
            "white_rating": game.headers.get("WhiteElo", "0"),
            "black_rating": game.headers.get("BlackElo", "0"),
            "performance_rating": perf_rating,
            "opening_name": opening_name,
            "eco_code": eco_code,
            "game_accuracy": game_accuracy,
            "opp_accuracy": opp_accuracy,
            "move_history": analysis_data,
            "full_history": full_history,
            "time_analysis": self.time_analyzer.analyze_game_time(analysis_data),
            "patterns": self.pattern_aggregator.aggregate_game_patterns(analysis_data),
            "mistakes": {
                "categories": self.mistake_categorizer.categorize_game_mistakes(analysis_data),
                "critical_moments": self.critical_moments.detect_turning_points(analysis_data),
                "frequency": self.mistake_frequency.analyze_frequency(analysis_data)
            }
        }

