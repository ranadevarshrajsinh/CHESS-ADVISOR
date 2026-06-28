import chess

# Piece values for material counting
_PHASE_VALUES = {
    chess.PAWN: 0,
    chess.KNIGHT: 1,
    chess.BISHOP: 1,
    chess.ROOK: 2,
    chess.QUEEN: 4,
    chess.KING: 0,
}

class PositionUtils:
    @staticmethod
    def detect_game_phase(board: chess.Board) -> str:
        """
        Determine the game phase (opening / middlegame / endgame) based on
        remaining non-pawn material for both sides.

        Heuristic (standard chess):
        - Opening:  total piece-score >= 16
        - Middlegame: total piece-score between 8 and 15
        - Endgame:   total piece-score <= 7

        Piece-score assigns value 4 to each queen, 2 to each rook,
        1 to each minor (knight / bishop).  Pawns and kings are not counted.
        A full set of 16 pieces (both sides) scores 24.
        """
        score = 0
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if piece and piece.piece_type not in (chess.PAWN, chess.KING):
                score += _PHASE_VALUES.get(piece.piece_type, 0)

        if score >= 16:
            return "opening"
        elif score >= 8:
            return "middlegame"
        else:
            return "endgame"

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
