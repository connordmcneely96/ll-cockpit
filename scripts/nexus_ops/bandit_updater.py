#!/usr/bin/env python3
"""
nexus_ops/bandit_updater.py
Thompson Sampling batch updater.

Trigger: called by CF Queue consumer (nexus-bandit-updates)
         OR run directly as a cron every 4 hours to flush stragglers.

Logic:
  1. Backup bandit tables to R2
  2. Query bandit_reward_log for rows NOT yet applied (applied=0)
  3. Group by (task_type, model_id)
  4. For any group with >= TS_UPDATE_THRESHOLD pending rows -> batch update
  5. Recalculate alpha, beta, avg_latency, avg_cost, convergence_pct
  6. Write updated model_bandit_params rows
  7. Mark processed reward_log rows applied=1

Usage:
    python -m nexus_ops.bandit_updater               # live run
    DRY_RUN=true python -m nexus_ops.bandit_updater  # preview only
    python -m nexus_ops.bandit_updater --force-all   # flush all pending
"""

from __future__ import annotations

import argparse
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Tuple

from nexus_ops.config import (
    BANDIT_TABLES, TS_UPDATE_THRESHOLD,
    Config, D1Client, R2Client, backup_d1, get_logger,
)

log = get_logger("bandit_updater")

ADD_APPLIED_COLUMN = "ALTER TABLE bandit_reward_log ADD COLUMN IF NOT EXISTS applied INTEGER DEFAULT 0;"
ADD_APPLIED_INDEX  = "CREATE INDEX IF NOT EXISTS idx_reward_applied ON bandit_reward_log(applied, task_type, model_id);"

FETCH_PENDING = """
SELECT id, task_type, model_id, quality_score, reward, latency_ms, cost_usd,
       alpha_before, beta_before, alpha_after, beta_after
FROM bandit_reward_log WHERE applied = 0 ORDER BY rewarded_at ASC
"""

FETCH_CURRENT_PARAMS = """
SELECT task_type, model_id, alpha, beta, n_trials, n_successes, n_failures,
       avg_latency_ms, avg_cost_usd
FROM model_bandit_params WHERE task_type = ? AND model_id = ?
"""

UPSERT_PARAMS = """
INSERT INTO model_bandit_params
  (id, task_type, model_id, alpha, beta, n_trials, n_successes, n_failures,
   avg_latency_ms, avg_cost_usd, convergence_pct, last_updated)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(task_type, model_id) DO UPDATE SET
  alpha=excluded.alpha, beta=excluded.beta, n_trials=excluded.n_trials,
  n_successes=excluded.n_successes, n_failures=excluded.n_failures,
  avg_latency_ms=excluded.avg_latency_ms, avg_cost_usd=excluded.avg_cost_usd,
  convergence_pct=excluded.convergence_pct, last_updated=excluded.last_updated
"""

FETCH_ALL_ALPHAS_FOR_TASK = "SELECT model_id, alpha FROM model_bandit_params WHERE task_type = ?"
MARK_APPLIED = "UPDATE bandit_reward_log SET applied = 1 WHERE id = ?"


def calc_convergence(d1: D1Client, task_type: str, winner_alpha: float) -> float:
    rows = d1.query_rows(FETCH_ALL_ALPHAS_FOR_TASK, [task_type])
    if not rows:
        return 0.0
    total_alpha = sum(r["alpha"] for r in rows)
    return round((winner_alpha / total_alpha) * 100, 1) if total_alpha > 0 else 0.0


def run_bandit_update(force_all: bool = False) -> Dict:
    cfg = Config()
    summary = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updates": [], "skipped": [], "errors": [], "dry_run": cfg.dry_run,
    }

    with D1Client(cfg) as d1, R2Client(cfg) as r2:
        # Ensure applied column exists (idempotent)
        try:
            d1.execute(ADD_APPLIED_COLUMN)
            d1.execute(ADD_APPLIED_INDEX)
        except Exception:
            pass

        log.info("Backing up bandit tables...")
        backup_d1(d1, r2, ["model_bandit_params", "bandit_reward_log"], label="pre_bandit_update")

        pending = d1.query_rows(FETCH_PENDING)
        log.info(f"Found {len(pending)} unapplied reward rows")
        if not pending:
            log.info("Nothing to process.")
            return summary

        groups: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
        for row in pending:
            groups[(row["task_type"], row["model_id"])].append(row)

        for (task_type, model_id), rewards in groups.items():
            n = len(rewards)
            threshold = 1 if force_all else TS_UPDATE_THRESHOLD

            if n < threshold:
                log.debug(f"  skip ({task_type}, {model_id}): {n} pending < {threshold}")
                summary["skipped"].append({"task_type": task_type, "model_id": model_id, "pending": n})
                continue

            try:
                current = d1.query_rows(FETCH_CURRENT_PARAMS, [task_type, model_id])
                if current:
                    c = current[0]
                    alpha=float(c["alpha"]); beta=float(c["beta"])
                    n_trials=int(c["n_trials"]); n_successes=int(c["n_successes"]); n_failures=int(c["n_failures"])
                    old_latency=float(c["avg_latency_ms"] or 0); old_cost=float(c["avg_cost_usd"] or 0)
                else:
                    alpha=1.0; beta=1.0; n_trials=0; n_successes=0; n_failures=0
                    old_latency=0.0; old_cost=0.0

                batch_successes = sum(1 for r in rewards if float(r["reward"]) >= 1.0)
                batch_failures  = n - batch_successes
                alpha += batch_successes; beta += batch_failures
                n_trials += n; n_successes += batch_successes; n_failures += batch_failures

                valid_latency = [r["latency_ms"] for r in rewards if r["latency_ms"]]
                valid_cost    = [r["cost_usd"]   for r in rewards if r["cost_usd"]]
                if valid_latency:
                    ow = (n_trials - n) / n_trials if n_trials > n else 0
                    new_avg_lat = ow * old_latency + (1-ow) * (sum(valid_latency)/len(valid_latency))
                else:
                    new_avg_lat = old_latency
                if valid_cost:
                    ow = (n_trials - n) / n_trials if n_trials > n else 0
                    new_avg_cost = ow * old_cost + (1-ow) * (sum(valid_cost)/len(valid_cost))
                else:
                    new_avg_cost = old_cost

                convergence = calc_convergence(d1, task_type, alpha)
                now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

                d1.execute(UPSERT_PARAMS, [
                    str(uuid.uuid4()), task_type, model_id,
                    round(alpha,4), round(beta,4), n_trials, n_successes, n_failures,
                    round(new_avg_lat,1), round(new_avg_cost,8), convergence, now_ts,
                ])
                for row in rewards:
                    d1.execute(MARK_APPLIED, [row["id"]])

                result = {
                    "task_type": task_type, "model_id": model_id,
                    "rewards_applied": n, "alpha": round(alpha,4), "beta": round(beta,4),
                    "n_trials": n_trials,
                    "win_rate": round(n_successes/n_trials,3) if n_trials else 0,
                    "convergence_pct": convergence,
                }
                summary["updates"].append(result)
                log.info(f"  + ({task_type}, {model_id}): a={alpha:.2f} b={beta:.2f} win={result['win_rate']:.1%} conv={convergence:.1f}%")

            except Exception as e:
                msg = f"({task_type}, {model_id}): {e}"
                summary["errors"].append(msg)
                log.error(f"  x {msg}", exc_info=True)

    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    summary["total_updates"] = len(summary["updates"])
    summary["total_skipped"] = len(summary["skipped"])
    summary["total_errors"]  = len(summary["errors"])
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Thompson Sampling bandit updater")
    parser.add_argument("--force-all", action="store_true", help="Flush all pending rewards regardless of threshold")
    args = parser.parse_args()

    result = run_bandit_update(force_all=args.force_all)
    print(f"\n=== BANDIT UPDATE ===")
    print(f"  Updates: {result['total_updates']}  Skipped: {result['total_skipped']}  Errors: {result['total_errors']}  DryRun: {result['dry_run']}")
    for u in result["updates"]:
        print(f"    {u['task_type']:30} {u['model_id']:35} win={u['win_rate']:.1%} conv={u['convergence_pct']:.0f}% n={u['n_trials']}")
    sys.exit(1 if result["total_errors"] else 0)
