import shutil
import chess.engine
import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Import lazily-resolved to avoid circular imports at package init
def _default_stockfish() -> str:
    from worker_config import settings
    return settings.STOCKFISH_PATH

def _default_analysis_nodes() -> int:
    from worker_config import settings
    return settings.ANALYSIS_NODES

class EngineManager:
    def __init__(self, stockfish_path: str = None, analysis_nodes: int = None):
        # Priority: explicit argument > central config > auto-discovery.
        # Always validate the resolved path — fall back to _find_stockfish() if
        # the configured value doesn't point to a real executable.
        candidate = stockfish_path or _default_stockfish()
        self.stockfish_path = candidate if self._path_is_valid(candidate) else self._find_stockfish()
        self.analysis_nodes = analysis_nodes if analysis_nodes is not None else _default_analysis_nodes()
        self.engine = None
        logger.info("ENGINE_INIT path=%s analysis_nodes=%d", self.stockfish_path, self.analysis_nodes)

    @staticmethod
    def _path_is_valid(path: str) -> bool:
        return bool(shutil.which(path) or Path(path).exists())

    def _find_stockfish(self) -> str:
        import platform
        is_linux = platform.system().lower() == "linux"
        
        # On Render/Linux, 'stockfish' should always be in the PATH after apt-get install.
        found = shutil.which("stockfish")
        if found:
            return found
            
        # Fallback list for local dev environments
        possible_paths = [
            "/opt/homebrew/bin/stockfish", # MacOS Homebrew
            "/usr/local/bin/stockfish",
            "/usr/bin/stockfish",
        ]
        
        # Only add Windows paths if NOT on Linux
        if not is_linux:
            possible_paths.extend([
                "bin/stockfish/stockfish-windows-x86-64-avx2.exe",
                "bin/stockfish/stockfish.exe",
            ])
            
        for path in possible_paths:
            if Path(path).is_file():
                return path
        return "stockfish"

    def start(self):
        if self.engine is None:
            logger.info("ENGINE_START path=%s", self.stockfish_path)
            self.engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
            logger.info("ENGINE_STARTED path=%s", self.stockfish_path)
        else:
            logger.debug("ENGINE_ALREADY_RUNNING path=%s", self.stockfish_path)

    def stop(self):
        if self.engine:
            logger.info("ENGINE_STOP path=%s", self.stockfish_path)
            self.engine.quit()
            self.engine = None
            logger.info("ENGINE_STOPPED path=%s", self.stockfish_path)

    def evaluate_position(self, board: chess.Board, multipv: int = 1, cache=None) -> Any:
        zobrist_hash = None
        if cache is not None:
            import chess.polyglot
            zobrist_hash = chess.polyglot.zobrist_hash(board)
            cached = cache.get(zobrist_hash, multipv)
            if cached is not None:
                logger.debug("EVAL_CACHE_HIT hash=%s multipv=%d nodes=%d",
                             hex(zobrist_hash), multipv, self.analysis_nodes)
                return cached

        logger.debug("EVAL_START halfmove=%d fen=%s nodes=%d multipv=%d",
                     board.halfmove_clock, board.fen(), self.analysis_nodes, multipv)
        limit = chess.engine.Limit(nodes=self.analysis_nodes)
        info = self.engine.analyse(board, limit, multipv=multipv)
        
        # When multipv=1, info is an InfoDict
        # When multipv > 1, info is a list of InfoDicts (usually)
        if multipv > 1:
            if not isinstance(info, list):
                info = [info]

            results = []
            for entry in info:
                score = entry['score'].relative
                eval_cp = score.score(mate_score=10000)
                move = entry.get('pv', [None])[0] if entry.get('pv') else None
                results.append({
                    "eval_cp": eval_cp,
                    "move": move,
                    "move_san": board.san(move) if move and move in board.legal_moves else "N/A"
                })
            logger.debug("EVAL_DONE multipv=%d top_eval=%+d best_move=%s cache=%s",
                         multipv, results[0]['eval_cp'],
                         results[0].get('move_san', 'N/A'),
                         "miss" if zobrist_hash is None else "saved")
            if cache is not None:
                cache.put(zobrist_hash, multipv, results)
            return results
        else:
            # Single PV (explicitly requested)
            if isinstance(info, list):
                info = info[0]

            score = info['score'].relative
            eval_cp = score.score(mate_score=10000)
            best_move = info.get('pv', [None])[0] if info.get('pv') else None
            result = {
                "eval_cp": eval_cp,
                "best_move": best_move,
                "best_move_san": board.san(best_move) if best_move and best_move in board.legal_moves else "N/A"
            }
            logger.debug("EVAL_DONE multipv=1 eval=%+d best_move=%s cache=%s",
                         eval_cp, result.get('best_move_san', 'N/A'),
                         "miss" if zobrist_hash is None else "saved")
            if cache is not None:
                cache.put(zobrist_hash, multipv, result)
            return result
