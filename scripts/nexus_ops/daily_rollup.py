#!/usr/bin/env python3
"""
nexus_ops/daily_rollup.py
Daily analytics rollup + Supabase semantic sync.

Triggered by: Cloudflare Cron Worker at 6am UTC (1am EST) via VPS webhook

What it does:
  1. Backup all analytics tables to R2
  2. Compute routing_analytics_snapshots for today
  3. Flush any pending bandit updates (force_all=True)
  4. Sync new task_executions to Supabase semantic_task_index
  5. Log summary to D1 + R2

Usage:
    python -m nexus_ops.daily_rollup                    # run today
    python -m nexus_ops.daily_rollup --date 2026-05-20  # rerun a date
    DRY_RUN=true python -m nexus_ops.daily_rollup       # preview
"""

from __future__ import annotations

import argparse
import json
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from nexus_ops.bandit_updater import run_bandit_update
from nexus_ops.config import (
    BANDIT_TABLES, Config, D1Client, R2Client, SupabaseClient,
    backup_d1, generate_embedding, get_logger,
)

log = get_logger("daily_rollup")


def compute_cost_by_model(d1: D1Client, since_ms: int) -> Dict:
    rows = d1.query_rows("SELECT model_id, SUM(cost_usd) as total FROM task_executions WHERE started_at >= ? AND cost_usd IS NOT NULL GROUP BY model_id", [since_ms])
    return {r["model_id"]: round(r["total"], 6) for r in rows}

def compute_quality_by_model(d1: D1Client, since_ms: int) -> Dict:
    rows = d1.query_rows("SELECT model_used, AVG(quality_score) as avg_q FROM task_executions WHERE started_at >= ? AND quality_score IS NOT NULL GROUP BY model_used", [since_ms])
    return {r["model_used"]: round(r["avg_q"], 3) for r in rows}

def compute_execs_by_agent(d1: D1Client, since_ms: int) -> Dict:
    rows = d1.query_rows("SELECT agent, COUNT(*) as n FROM task_executions WHERE started_at >= ? GROUP BY agent", [since_ms])
    return {r["agent"]: r["n"] for r in rows}

def compute_model_standings(d1: D1Client) -> Dict:
    rows = d1.query_rows("SELECT task_type, model_id, alpha, beta, n_trials, CAST(n_successes AS REAL) / NULLIF(n_trials, 0) as win_rate FROM model_bandit_params ORDER BY task_type, alpha DESC")
    standings = defaultdict(list)
    for r in rows:
        standings[r["task_type"]].append(r)
    result = {}
    for task_type, models in standings.items():
        leader = models[0]
        total_alpha = sum(m["alpha"] for m in models)
        result[task_type] = {
            "winner": leader["model_id"],
            "win_pct": round(float(leader.get("win_rate") or 0), 3),
            "n_trials": leader["n_trials"],
            "converged": leader["alpha"] / total_alpha >= 0.60 if total_alpha > 0 else False,
            "runner_up": models[1]["model_id"] if len(models) > 1 else None,
        }
    return result

def compute_sentinel_pass_rate(d1: D1Client, since_ms: int) -> float:
    row = d1.query_rows("SELECT AVG(CAST(sentinel_pass AS REAL)) as rate FROM task_executions WHERE started_at >= ? AND sentinel_pass IS NOT NULL", [since_ms])
    return round(float(row[0]["rate"] or 0), 3) if row else 0.0

def compute_opus_gate_pass_rate(d1: D1Client, since_ms: int) -> float:
    row = d1.query_rows("SELECT AVG(CASE WHEN decision='approved' OR decision='approved_with_notes' THEN 1.0 ELSE 0.0 END) as rate FROM approval_gates WHERE gate_opened_at >= ?", [since_ms])
    return round(float(row[0]["rate"] or 0), 3) if row else 0.0

def compute_anthropic_usage(d1: D1Client, since_ms: int) -> Dict:
    rows = d1.query_rows("SELECT te.model_used, COUNT(*) as n, SUM(te.cost_usd) as cost FROM task_executions te JOIN model_registry mr ON te.model_used = mr.model_id WHERE te.started_at >= ? AND mr.is_anthropic = 1 GROUP BY te.model_used", [since_ms])
    total_n = sum(r["n"] for r in rows) or 1
    total_cost = sum(r["cost"] or 0 for r in rows)
    return {
        "haiku_pct":  round(next((r["n"] for r in rows if "haiku" in r["model_used"]), 0) / total_n * 100, 1),
        "sonnet_pct": round(next((r["n"] for r in rows if "sonnet" in r["model_used"]), 0) / total_n * 100, 1),
        "opus_pct":   round(next((r["n"] for r in rows if "opus" in r["model_used"]), 0) / total_n * 100, 1),
        "total_cost": round(total_cost, 6),
    }

def compute_unaccounted(d1: D1Client, since_ms: int) -> int:
    row = d1.query_rows("SELECT COUNT(*) as n FROM task_executions te WHERE te.started_at >= ? AND te.status = 'success' AND NOT EXISTS (SELECT 1 FROM artifact_registry ar WHERE ar.execution_id = te.id)", [since_ms])
    return row[0]["n"] if row else 0


def sync_to_supabase(d1: D1Client, supa: SupabaseClient, cfg: Config, since_ms: int) -> int:
    rows = d1.query_rows("SELECT id, agent, task_type, model_used, quality_score, sentinel_pass, cost_usd, latency_ms, task_input, task_output, project_id FROM task_executions WHERE started_at >= ? AND status = 'success' AND quality_score >= 0.75 AND supabase_synced IS NULL LIMIT 50", [since_ms])
    if not rows:
        return 0

    synced = 0
    upsert_batch: List[Dict] = []
    for row in rows:
        content = f"{row['task_input'] or ''} {row['task_output'] or ''}".strip()[:1500]
        try:
            embedding = generate_embedding(content, cfg)
            upsert_batch.append({
                "d1_execution_id": row["id"], "agent": row["agent"],
                "task_type": row["task_type"], "model_used": row["model_used"],
                "quality_score": row["quality_score"], "sentinel_pass": bool(row["sentinel_pass"]),
                "cost_usd": row["cost_usd"], "latency_ms": row["latency_ms"],
                "content_snippet": content[:1000], "embedding": embedding, "project_id": row["project_id"],
            })
            synced += 1
        except Exception as e:
            log.warning(f"  embedding failed for {row['id']}: {e}")

    if upsert_batch and not cfg.dry_run:
        supa.upsert("semantic_task_index", upsert_batch, on_conflict="d1_execution_id")
        for row in rows[:synced]:
            try:
                d1.execute("UPDATE task_executions SET supabase_synced=1 WHERE id=?", [row["id"]])
            except Exception:
                pass
    return synced


def run_daily_rollup(target_date: Optional[str] = None) -> Dict:
    cfg = Config()
    today_str = target_date or date.today().isoformat()
    since_ms = int((datetime.now(timezone.utc).timestamp() - 86400) * 1000)
    log.info(f"=== Daily rollup for {today_str} ===")
    summary = {"date": today_str, "errors": [], "dry_run": cfg.dry_run}

    with D1Client(cfg) as d1, R2Client(cfg) as r2, SupabaseClient(cfg) as supa:
        log.info("Step 1: Backup...")
        backup_d1(d1, r2, BANDIT_TABLES, f"daily_{today_str}")

        log.info("Step 2: Flush bandit updates...")
        bandit_result = run_bandit_update(force_all=True)
        summary["bandit_updates"] = bandit_result.get("total_updates", 0)

        log.info("Step 3: Computing analytics...")
        try:
            cost_by_model = compute_cost_by_model(d1, since_ms)
            quality_by_model = compute_quality_by_model(d1, since_ms)
            execs_by_agent = compute_execs_by_agent(d1, since_ms)
            standings = compute_model_standings(d1)
            sentinel_rate = compute_sentinel_pass_rate(d1, since_ms)
            opus_rate = compute_opus_gate_pass_rate(d1, since_ms)
            anthropic_usage = compute_anthropic_usage(d1, since_ms)
            unaccounted = compute_unaccounted(d1, since_ms)
            total_cost = sum(cost_by_model.values())
            total_execs = sum(execs_by_agent.values())
            converged = [t for t, s in standings.items() if s["converged"]]
            snapshot_id = str(uuid.uuid4())
            now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

            d1.execute("""INSERT OR REPLACE INTO routing_analytics_snapshots
                (id, snapshot_date, snapshot_type, standings_json, total_cost_usd,
                 cost_by_model_json, cost_by_agent_json, quality_by_model_json,
                 sentinel_pass_rate, opus_gate_pass_rate, total_executions,
                 executions_by_agent_json, converged_task_types_json, artifacts_produced,
                 unaccounted_executions, haiku_usage_pct, sonnet_usage_pct, opus_usage_pct,
                 anthropic_total_cost, generated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,
                      (SELECT COUNT(*) FROM artifact_registry WHERE created_at >= ?),
                      ?,?,?,?,?,?)""",
                [snapshot_id, today_str, "daily", json.dumps(standings),
                 total_cost, json.dumps(cost_by_model), json.dumps(execs_by_agent),
                 json.dumps(quality_by_model), sentinel_rate, opus_rate,
                 total_execs, json.dumps(execs_by_agent), json.dumps(converged), since_ms,
                 unaccounted, anthropic_usage["haiku_pct"], anthropic_usage["sonnet_pct"],
                 anthropic_usage["opus_pct"], anthropic_usage["total_cost"], now_ts])

            summary.update({"total_executions": total_execs, "total_cost_usd": round(total_cost, 6),
                             "sentinel_pass_rate": sentinel_rate, "opus_gate_pass_rate": opus_rate,
                             "converged_task_types": converged, "unaccounted_execs": unaccounted,
                             "anthropic_usage": anthropic_usage})
            if unaccounted > 0:
                log.warning(f"  {unaccounted} executions have no artifact — ACCOUNTABILITY FAIL")
        except Exception as e:
            summary["errors"].append(f"analytics: {e}")
            log.error(f"Analytics error: {e}", exc_info=True)

        log.info("Step 4: Supabase semantic sync...")
        try:
            synced = sync_to_supabase(d1, supa, cfg, since_ms)
            summary["supabase_synced"] = synced
            log.info(f"  Synced {synced} executions to Supabase")
        except Exception as e:
            summary["errors"].append(f"supabase_sync: {e}")
            log.error(f"Supabase sync error: {e}", exc_info=True)

    RR = R2Client(cfg)
    RR.upload_json(f"analytics/daily/{today_str}.json", summary)
    RR.close()
    log.info("=== Rollup complete ===")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NEXUS daily rollup")
    parser.add_argument("--date", help="Target date YYYY-MM-DD (default: today)")
    args = parser.parse_args()
    result = run_daily_rollup(target_date=args.date)
    print(f"\n=== DAILY ROLLUP ===")
    print(f"  Date: {result['date']} | Executions: {result.get('total_executions','N/A')} | Cost: ${result.get('total_cost_usd',0):.4f}")
    print(f"  Sentinel: {result.get('sentinel_pass_rate',0):.1%} | Opus gate: {result.get('opus_gate_pass_rate',0):.1%}")
    print(f"  Supabase synced: {result.get('supabase_synced',0)} | Bandit updates: {result.get('bandit_updates',0)}")
    print(f"  Converged routes: {len(result.get('converged_task_types',[]))}")
    if result.get("unaccounted_execs", 0) > 0:
        print(f"  ACCOUNTABILITY FAIL: {result['unaccounted_execs']} unaccounted executions")
    if result.get("errors"):
        print(f"  Errors: {result['errors']}")
