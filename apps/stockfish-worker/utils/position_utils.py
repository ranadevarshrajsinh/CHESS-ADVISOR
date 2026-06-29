import chess

class PositionUtils:
    @staticmethod
    def detect_game_phase(board: chess.Board) -> str:
        """Return 'opening', 'middlegame', or 'endgame' based on move number and material."""
        if board.fullmove_number <= 10:
            return "opening"
        num_queens = (
            len(board.pieces(chess.QUEEN, chess.WHITE))
            + len(board.pieces(chess.QUEEN, chess.BLACK))
        )
        if num_queens == 0 or len(board.piece_map()) <= 12:
            return "endgame"
        return "middlegame"

    @staticmethod
    def is_hanging(board: chess.Board, square: chess.Square) -> bool:
        """
        A piece is hanging if:
        1. It is attacked by an opponent piece.
        2. It is either undefended OR the lowest value attacker is worth less than the piece.
        """
        piece = board.piece_at(square)
        if not piece:
            return False

        color = piece.color
        opponent_color = not color

        attackers = board.attackers(opponent_color, square)
        if not attackers:
            return False

        defenders = board.attackers(color, square)
        if not defenders:
            return True

        # If defended, check if an attacker has lower value than the piece itself
        # This is a simplified "hanging" definition.
        piece_values = {
            chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
            chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
        }
        
        piece_val = piece_values.get(piece.piece_type, 0)
        
        for attacker_sq in attackers:
            attacker_piece = board.piece_at(attacker_sq)
            if attacker_piece and piece_values.get(attacker_piece.piece_type, 0) < piece_val:
                return True
                
        return False
