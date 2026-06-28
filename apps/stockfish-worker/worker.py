import time
import json
import logging
from datetime import datetime, timezone
from supabase import create_client, Client
from worker_config import settings
from worker_core.game_analyzer import GameAnalyzer
from worker_core.batch_analyzer import BatchAnalyzer
from storage.analysis_storage import AnalysisStorage

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
# Suppress noisy httpx access logs (Supabase client uses httpx under the hood)
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
logger.info("WORKER_INIT supabase_url=%s", settings.SUPABASE_URL)

def process_job(job, game_num: int = 0, total_games: int = 0):
    job_id = job.get('id', '?')
    username = job.get('username', '?')
    filename = job.get('filename', '?')
    
    if total_games > 0:
        logger.info("JOB_START game=%d/%d job_id=%s username=%s filename=%s",
                     game_num, total_games, job_id, username, filename)
    else:
        logger.info("JOB_START job_id=%s username=%s filename=%s", job_id, username, filename)
    
    try:
        # ── Update status to processing ─────────────────────────────────────
        now = datetime.now(timezone.utc).isoformat()
        res = supabase.table("analysis_jobs").update({
            "status": "processing",
            "updated_at": now,
        }).eq("id", job_id).execute()
        logger.info("JOB_PROCESSING job_id=%s updated_rows=%s",
                     job_id, len(res.data) if res.data else 0)
        
        # ── Extract PGN from the job's result field ─────────────────────────
        # The batch API stores { pgn, platform } in the result column on creation.
        job_result = job.get('result') or {}
        pgn_text = job_result.get('pgn') if isinstance(job_result, dict) else None
        
        if not pgn_text:
            raise ValueError(
                "No PGN data found in job.result — the batch API must store "
                "PGN text in the result field when creating the job."
            )
        
        # ── Run actual analysis ────────────────────────────────────────────
        analyzer = GameAnalyzer()
        result = analyzer.analyze_pgn(pgn_text, username)
        
        # ── Persist to local AnalysisStorage for fast cache hits ────────────
        try:
            storage = AnalysisStorage()
            storage.save_analysis(username, filename, result)
        except Exception as storage_err:
            logger.warning("JOB_LOCAL_CACHE_FAILED job_id=%s error=%s", job_id, storage_err)
        
        # ── Update job as completed with the real result ────────────────────
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("analysis_jobs").update({
            "status": "completed",
            "result": result,
            "updated_at": now,
        }).eq("id", job_id).execute()
        
        if total_games > 0:
            logger.info("JOB_COMPLETED game=%d/%d job_id=%s username=%s accuracy=%.1f%%",
                         game_num, total_games, job_id, username, result.get('game_accuracy', 0))
        else:
            logger.info("JOB_COMPLETED job_id=%s username=%s accuracy=%.1f%%",
                         job_id, username, result.get('game_accuracy', 0))
                     
    except Exception as e:
        logger.error("JOB_FAILED job_id=%s error=%s", job_id, e)
        try:
            now = datetime.now(timezone.utc).isoformat()
            supabase.table("analysis_jobs").update({
                "status": "failed",
                "updated_at": now,
                "error": str(e)[:500],
            }).eq("id", job_id).execute()
            logger.info("JOB_FAILURE_RECORDED job_id=%s", job_id)
        except Exception as db_err:
            logger.error("JOB_FAILURE_DB_ERROR job_id=%s error=%s", job_id, db_err)

def _count_jobs() -> tuple[int, int, int]:
    """Return (pending, processing, completed) counts from Supabase."""
    try:
        pending = supabase.table("analysis_jobs").select("id", count="exact").eq("status", "pending").execute()
        processing = supabase.table("analysis_jobs").select("id", count="exact").eq("status", "processing").execute()
        completed = supabase.table("analysis_jobs").select("id", count="exact").eq("status", "completed").execute()
        return (
            pending.count if hasattr(pending, "count") else 0,
            processing.count if hasattr(processing, "count") else 0,
            completed.count if hasattr(completed, "count") else 0,
        )
    except Exception:
        return (-1, -1, -1)


def main():
    poll_count = 0
    # Verify Supabase connectivity by checking the table exists
    try:
        check = supabase.table("analysis_jobs").select("id", count="exact").limit(1).execute()
        logger.info("WORKER_STARTED table=analysis_jobs total_rows=%s", check.count if hasattr(check, 'count') else '?')
    except Exception as e:
        logger.warning("WORKER_STARTED table=analysis_jobs connection_check_failed=%s — will retry in loop", e)

    while True:
        poll_count += 1
        try:
            # Poll for pending jobs
            res = supabase.table("analysis_jobs").select("*").eq("status", "pending").order("created_at").limit(1).execute()
            if res.data:
                pending, processing, completed = _count_jobs()
                total_remaining = pending + processing
                total_games = completed + total_remaining
                game_num = completed + 1
                logger.info(
                    "POLL_HIT poll=%d job_id=%s game=%d/%d completed=%d remaining=%d",
                    poll_count, res.data[0].get('id'),
                    game_num, total_games, completed, total_remaining,
                )
                process_job(res.data[0], game_num=game_num, total_games=total_games)
                # After processing, log updated progress
                pending, processing, completed = _count_jobs()
                total_remaining = pending + processing
                logger.info(
                    "PROGRESS poll=%d completed=%d remaining=%d total=%d",
                    poll_count, completed, total_remaining, completed + total_remaining,
                )
            else:
                if poll_count % 3 == 0:
                    _, _, completed = _count_jobs()
                    logger.info(
                        "IDLE poll=%d — waiting for pending jobs (completed=%d so far, checking every 5s)",
                        poll_count, completed,
                    )
                time.sleep(5)
        except Exception as e:
            logger.error("POLL_ERROR poll=%d error=%s", poll_count, e)
            time.sleep(10)

if __name__ == "__main__":
    main()
