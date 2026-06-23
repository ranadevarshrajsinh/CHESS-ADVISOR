from typing import Optional

def calculate_time_spent(last_clock: Optional[float], clock: Optional[float]) -> Optional[float]:
    """Compute time spent on a move from clock values.

    Args:
        last_clock: The clock value before the move (seconds remaining).
        clock:      The clock value after the move (seconds remaining).

    Returns:
        Time spent in seconds, or None if either clock is missing.
    """
    if last_clock is None or clock is None:
        return None
    spent = last_clock - clock
    # Sanity check — clock can't go backwards (increment not applied yet)
    return max(0.0, spent)
