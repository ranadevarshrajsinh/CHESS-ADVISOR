import math

def calculate_centipawn_loss(eval_before: float, eval_after: float, perspective: str = "white") -> float:
    """Calculate centipawn loss for a move.

    Args:
        eval_before: Evaluation before the move (White-centric centipawns).
        eval_after:  Evaluation after the move (White-centric centipawns).
        perspective: The side that just moved ("white" or "black").

    Returns:
        Non-negative centipawn loss. Higher = worse.
    """
    loss = eval_before - eval_after
    if perspective == "black":
        loss = -loss
    return max(0.0, loss)


def calculate_move_accuracy(user_cp_before: float, user_cp_after: float) -> float:
    """Calculate move accuracy as a score from 0 to 100.

    Uses a sigmoid-based mapping: accuracy = 100 / (1 + exp(-k * (cp_gain - x0)))
    where cp_gain is the change in centipawns FROM THE USER'S perspective.
    Negative change (losing advantage) maps to lower accuracy.

    A 0 cp loss maps to ~100% accuracy.
    A 50 cp loss maps to ~90% accuracy.
    A 100 cp loss maps to ~70% accuracy.
    A 300 cp loss maps to ~10% accuracy.
    """
    cp_gain = user_cp_after - user_cp_before  # positive = improvement
    # Negate so loss maps to lower accuracy, then clamp
    cp_loss = -cp_gain
    # Sigmoid: accuracy drops as cp_loss increases
    # k ≈ 0.015 gives ~90% at 50cp, ~70% at 100cp, ~10% at 300cp
    accuracy = 100.0 / (1.0 + math.exp(0.015 * (cp_loss - 20)))
    return max(0.0, min(100.0, accuracy))


def calculate_win_prob_drop(user_cp_before: float, user_cp_after: float) -> float:
    """Calculate the drop in win probability (percentage points 0-100).

    Uses the standard sigmoid win-probability model:
        W(cp) = 1 / (1 + 10^(-cp/400))

    Args:
        user_cp_before: Centipawn evaluation before the move (user-centric).
        user_cp_after:  Centipawn evaluation after the move (user-centric).

    Returns:
        Win probability drop as a percentage (0-100).
    """
    def win_prob(cp: float) -> float:
        return 1.0 / (1.0 + 10.0 ** (-cp / 400.0))

    wp_before = win_prob(user_cp_before) * 100.0
    wp_after = win_prob(user_cp_after) * 100.0
    drop = wp_before - wp_after
    return max(0.0, min(100.0, drop))
