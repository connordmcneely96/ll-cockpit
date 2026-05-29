#!/usr/bin/env python3
"""
scripts/backfill_r2.py
Pull all completed smoke test runs from D1 and upload to R2.

Dynamically discovers run IDs from smoke_test_runs table — no hardcoding needed.
Run from scripts/ directory after any session where R2 uploads failed.

Usage:
    python backfill_r2.py              # backfill all runs missing from R2
    python backfill_r2.py --all        # force-upload all runs including existing
    python backfill_r2.py --run <id>   # specific run ID only
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(".env"), override=True)
sys.path.insert(0, str(Path(__file__).parent))

from nexus_ops.config import Config, D1Client, R2Client, get_logger

log = get_logger("backfill_r2")


def get_r2_key(date_str: str, run_id: str, filename: str) -> str:
    return f"smoke_tests/{date_str}/{run_id}/{filename}"


def run_already_in_r2(r2: R2Client, date_str: str, run_id: str) -> bool:
    """Check if this run's summary already exists in R2."""
    try:
        key = get_r2_key(date_str, run_id, "summary.json")
        r2.client.head_object(Bucket=r2.bucket, Key=key)
        return True
    except Exception:
        return False


def backfill_run(d1: D1Client, r2: R2Client, run_id: str, started_at_ms: int, force: bool = False) -> bool:
    """Upload one run's results to R2. Returns True if uploaded, False if skipped."""
    # Derive date from started_at timestamp
    dt = datetime.fromtimestamp(started_at_ms / 1000, tz=timezone.utc)
    date_str = dt.strftime("%Y-%m-%d")

    # Skip if already in R2 (unless force)
    if not force and run_already_in_r2(r2, date_str, run_id):
        log.info(f"  SKIP {run_id[:8]} ({date_str}) — already in R2")
        return False

    # Pull clean results from D1
    results = d1.query_rows(
        """SELECT model_id, case_id, agent, task_type, composite_score,
                  bandit_reward, latency_ms, cost_usd, opus_verdict,
                  opus_notes, input_tokens, output_tokens, tested_at
           FROM smoke_test_results
           WHERE run_id = ? AND composite_score > 0
           ORDER BY tested_at""",
        [run_id],
    )

    if not results:
        log.warning(f"  SKIP {run_id[:8]} — no clean results in D1")
        return False

    # Pull run metadata
    run_meta = d1.query_rows(
        "SELECT id, status, n_cases_complete, n_cases_passed, total_cost_usd FROM smoke_test_runs WHERE id = ?",
        [run_id],
    )
    meta = run_meta[0] if run_meta else {}

    passes = sum(1 for r in results if r.get("bandit_reward", 0) > 0)
    models = sorted(set(r["model_id"] for r in results))
    agents = sorted(set(r["agent"] for r in results if r.get("agent")))
    avg_q = round(sum(r["composite_score"] for r in results) / len(results), 3)
    total_cost = meta.get("total_cost_usd") or round(sum(r.get("cost_usd") or 0 for r in results), 6)

    summary = {
        "run_id": run_id,
        "date": date_str,
        "status": meta.get("status", "unknown"),
        "total_results": len(results),
        "total_passed": passes,
        "avg_quality": avg_q,
        "total_cost_usd": total_cost,
        "models_tested": models,
        "agents_covered": agents,
        "backfilled_at": datetime.now(timezone.utc).isoformat(),
        "source": "backfill_r2.py",
    }

    r2.upload_json(get_r2_key(date_str, run_id, "summary.json"), summary)
    r2.upload_json(get_r2_key(date_str, run_id, "full_results.json"), {"run_id": run_id, "results": results})

    log.info(f"  OK   {run_id[:8]} ({date_str}) — {len(results)} results | avg_q={avg_q} | cost=${total_cost:.4f}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Force upload all runs, even those already in R2")
    parser.add_argument("--run", help="Specific run ID to backfill")
    args = parser.parse_args()

    cfg = Config()
    log.info(f"Backfill starting | bucket={cfg.cf_r2_bucket} | force={args.all}")

    with D1Client(cfg) as d1, R2Client(cfg) as r2:

        if args.run:
            # Single run mode
            run = d1.query_rows(
                "SELECT id, started_at FROM smoke_test_runs WHERE id = ?", [args.run]
            )
            if not run:
                print(f"❌ Run {args.run} not found in D1")
                sys.exit(1)
            runs = run
        else:
            # All completed runs with results
            runs = d1.query_rows(
                """SELECT id, started_at FROM smoke_test_runs
                   WHERE n_cases_complete > 0
                   ORDER BY started_at ASC""",
            )

        log.info(f"Found {len(runs)} runs to process")

        uploaded = 0
        skipped = 0
        failed = 0

        for run in runs:
            try:
                result = backfill_run(d1, r2, run["id"], run["started_at"], force=args.all)
                if result:
                    uploaded += 1
                else:
                    skipped += 1
            except Exception as e:
                log.error(f"  FAIL {run['id'][:8]} — {e}")
                failed += 1

    print(f"\n{'='*50}")
    print(f"BACKFILL COMPLETE")
    print(f"{'='*50}")
    print(f"  Uploaded : {uploaded}")
    print(f"  Skipped  : {skipped} (already in R2)")
    print(f"  Failed   : {failed}")
    print(f"  Bucket   : {cfg.cf_r2_bucket}")


if __name__ == "__main__":
    main()
