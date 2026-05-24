#!/usr/bin/env python3
"""
nexus_ops/smoke_test_runner.py
Universal model smoke test harness.

Tests EVERY model in model_registry against every (agent, task_type) combination.
Nothing is hardcoded. Winners are empirically derived.
Results seed model_bandit_params and refresh agent_model_routing.

Providers supported: anthropic | openrouter | openai | cloudflare_workers_ai | ollama

Usage:
    python -m nexus_ops.smoke_test_runner                        # all models, all tasks
    python -m nexus_ops.smoke_test_runner --provider anthropic   # one provider
    python -m nexus_ops.smoke_test_runner --task-type intent_classify
    python -m nexus_ops.smoke_test_runner --agent FORGE
    DRY_RUN=true python -m nexus_ops.smoke_test_runner           # preview, no writes
"""

from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from nexus_ops.config import Config, D1Client, R2Client, AnthropicClient, backup_d1, get_logger

log = get_logger("smoke_test_runner")

# ─────────────────────────────────────────────────────────────
# OPUS SCORER — always Anthropic Opus 4.7, never replaced
# Scoring is the one thing that must be consistent across all runs.
# ─────────────────────────────────────────────────────────────
SCORER_MODEL = "claude-opus-4-7"

SCORER_SYSTEM = """
You are a strict QA evaluator for an AI agent system.
You receive: a task prompt, an AI model response, and evaluation criteria.
Output ONLY valid JSON — no preamble, no markdown fences:
{
  "score_accuracy":     0.0-1.0,
  "score_completeness": 0.0-1.0,
  "score_tone":         0.0-1.0,
  "score_criteria_met": 0.0-1.0,
  "composite_score":    0.0-1.0,
  "verdict":            "pass" | "fail" | "conditional",
  "notes":              "one sentence"
}
0.85+ = production-ready. 0.70-0.84 = acceptable with caveats. Below 0.70 = fail.
"""

# ─────────────────────────────────────────────────────────────
# TEST CASES — per (agent, task_type)
# These are deliberately simple and deterministic so scoring is stable.
# ─────────────────────────────────────────────────────────────
TEST_CASES: Dict[str, Dict[str, List[Dict]]] = {
    "NEXUS": {
        "intent_classify": [
            {"name": "route_build",     "difficulty": "easy",   "prompt": "I need a landing page for my gym business", "criteria": {"must_include": ["build", "design", "web"]}},
            {"name": "route_engineer",  "difficulty": "medium", "prompt": "Analyze hydraulic load on a centrifugal pump at 3500 RPM per API 610", "criteria": {"must_include": ["engineering", "technical"]}},
            {"name": "route_ambiguous", "difficulty": "hard",   "prompt": "Help me grow faster", "criteria": {"must_not_include": ["I cannot", "I am unable"]}},
        ],
        "strategic_decide": [
            {"name": "spawn_decision", "difficulty": "hard", "prompt": "We have 3 active clients, $8k MRR, and 40hrs/week capacity. Should we launch a second product vertical now?", "criteria": {"must_include": ["revenue", "capacity", "risk"]}},
        ],
    },
    "FORGE": {
        "code_generate": [
            {"name": "react_table",  "difficulty": "medium", "prompt": "Write a TypeScript React component: data table with sorting + pagination, no external UI lib", "criteria": {"must_include": ["useState", "typescript", "sort"], "must_not_include": ["TODO", "placeholder"]}},
            {"name": "d1_query",     "difficulty": "medium", "prompt": "Write a Cloudflare D1 SQL query: top 10 agents by avg quality_score in the last 7 days", "criteria": {"must_include": ["SELECT", "quality_score", "GROUP BY", "ORDER BY"]}},
            {"name": "ts_migration", "difficulty": "hard",   "prompt": "Write SQL migration to add Thompson Sampling beta columns (alpha, beta, n_trials) to an existing table without data loss", "criteria": {"must_include": ["ALTER TABLE", "DEFAULT", "ADD COLUMN"]}},
        ],
        "code_complex": [
            {"name": "worker_arch", "difficulty": "hard", "prompt": "Design a Cloudflare Worker that routes LLM requests using Thompson Sampling. Show the core routing function with type annotations.", "criteria": {"must_include": ["beta", "sample", "alpha", "route"], "must_not_include": ["TODO"]}},
        ],
    },
    "HERALD": {
        "content_write": [
            {"name": "linkedin_hook",    "difficulty": "easy",   "prompt": "Write 3 LinkedIn post hooks for a mechanical engineer building AI tools. Each hook under 20 words.", "criteria": {"must_include": ["engineer", "AI"], "tone": "professional, punchy"}},
            {"name": "case_study_open",  "difficulty": "medium", "prompt": "Write the opening paragraph of a case study: we helped a pump manufacturer cut FMEA review time by 60% using AI agents", "criteria": {"must_include": ["pump", "FMEA", "60%"]}},
        ],
        "caption_short": [
            {"name": "product_caption", "difficulty": "easy", "prompt": "Write a tweet announcing: our AI platform now automatically routes tasks to the best LLM based on performance data. Max 280 chars.", "criteria": {"must_include": ["AI", "LLM"], "max_length": 280}},
        ],
    },
    "INTAKE": {
        "json_extract": [
            {"name": "scope_parse",  "difficulty": "easy",   "prompt": "Extract JSON from: 'Build a 5-page website: home, about, services, portfolio, contact. Budget $2500. 3-week timeline. Client: Cascade Pumps.'", "criteria": {"must_include": ["pages", "budget", "timeline", "client"]}},
            {"name": "email_parse",  "difficulty": "medium", "prompt": "Extract structured JSON from this inquiry: 'Hi, we need a custom dashboard for our pump testing lab. We have 12 test stands generating CSV data every 30s. Need real-time charts and alerting. Budget around $15k. Timeline flexible but want MVP in 6 weeks.'", "criteria": {"must_include": ["budget", "timeline", "requirements"]}},
        ],
    },
    "SENTINEL": {
        "qa_precheck": [
            {"name": "code_sanity",    "difficulty": "easy",   "prompt": "Quick check: does this code have obvious bugs? `def divide(a, b): return a/b` — used in production financial calculations", "criteria": {"must_include": ["zero", "division", "error"]}},
            {"name": "content_sanity", "difficulty": "easy",   "prompt": "Quick check: is this client-ready? 'Our AI achieves 100% accuracy and never fails, guaranteed.'", "criteria": {"must_include": ["misleading", "claim", "accuracy"]}},
        ],
        "qa_review": [
            {"name": "fmea_review",  "difficulty": "hard", "prompt": "Review this FMEA entry: Effect='pump fails', Severity=9, Occurrence=3, Detection=7, RPN=189. Controls: 'visual inspection quarterly'. Is this acceptable for API 610 compliance?", "criteria": {"must_include": ["RPN", "detection", "control", "API 610"]}},
        ],
    },
    "ATLAS": {
        "engineering_calc": [
            {"name": "pump_rpn",   "difficulty": "hard", "prompt": "Calculate minimum required NPSHa for a centrifugal pump: flow 500 GPM, suction head 15ft, vapor pressure 0.5 psia, pipe losses 3ft. Show formula and units.", "criteria": {"must_include": ["NPSHa", "formula", "units", "ft"]}},
            {"name": "shaft_load", "difficulty": "hard", "prompt": "What is the critical shaft speed for a pump shaft: length 24in, diameter 1.5in, material steel (E=30e6 psi)? Show Rayleigh method.", "criteria": {"must_include": ["critical", "speed", "RPM", "Rayleigh"]}},
        ],
        "long_doc_ingest": [
            {"name": "spec_summary", "difficulty": "medium", "prompt": "Summarize the key requirements for centrifugal pump casing design per API 610 12th edition. Focus on pressure rating, material classes, and inspection requirements.", "criteria": {"must_include": ["pressure", "material", "inspection", "API 610"]}},
        ],
    },
    "SCOUT": {
        "outreach_personalize": [
            {"name": "me_firm_outreach",  "difficulty": "medium", "prompt": "Write a 3-sentence cold outreach to the Engineering Director at a mid-size pump manufacturer. We offer AI tools that cut FMEA documentation time by 60%.", "criteria": {"must_include": ["FMEA", "60%", "pump"], "tone": "professional, direct"}},
        ],
        "social_intel": [
            {"name": "market_scan", "difficulty": "medium", "prompt": "What are the top 3 pain points mechanical engineers are discussing about FMEA processes in 2024-2025? Focus on documentation and compliance.", "criteria": {"must_include": ["documentation", "time", "compliance"]}},
        ],
    },
    "ORACLE": {
        "research_summarize": [
            {"name": "ai_engineering_trend", "difficulty": "medium", "prompt": "Summarize the current state of AI adoption in mechanical engineering and predictive maintenance as of 2025. Key vendors, adoption barriers, ROI data.", "criteria": {"must_include": ["predictive", "maintenance", "adoption"]}},
        ],
        "genesis_score_gap": [
            {"name": "market_gap", "difficulty": "hard", "prompt": "Evaluate market gap: AI-powered FMEA documentation tool for process industries. Score opportunity on: market size, competition density, willingness to pay, and our ME moat advantage.", "criteria": {"must_include": ["market", "competition", "willingness", "moat"]}},
        ],
    },
    "ANCHOR": {
        "research_summarize": [
            {"name": "cost_analysis", "difficulty": "medium", "prompt": "Analyze the cost structure of running an AI agent platform: LLM API costs, compute, storage. What % of revenue should be allocated to AI costs at $10k MRR?", "criteria": {"must_include": ["cost", "revenue", "percentage", "LLM"]}},
        ],
    },
}


# ─────────────────────────────────────────────────────────────
# MULTI-PROVIDER API CALLER
# Routes to the right API based on model_registry.provider
# ─────────────────────────────────────────────────────────────
def call_model(model_id: str, provider: str, prompt: str, cfg: Config, timeout: int = 60) -> Dict[str, Any]:
    """
    Call any model regardless of provider.
    Returns: {output, input_tokens, output_tokens, cost_usd, latency_ms, error}
    """
    start = time.monotonic()

    try:
        if provider == "anthropic":
            claude = AnthropicClient(cfg)
            data = claude.complete(model=model_id, prompt=prompt, max_tokens=1024)
            claude.close()
            output = data["content"][0]["text"]
            usage = data.get("usage", {})
            in_tok, out_tok = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
            cost = claude.estimate_cost(model_id, in_tok, out_tok)

        elif provider in ("openrouter", "openai"):
            base = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
            api_key = os.getenv("OPENROUTER_API_KEY") if provider == "openrouter" else os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                return {"output": None, "error": f"Missing API key for {provider}", "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            resp = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model_id, "messages": [{"role": "user", "content": prompt}], "max_tokens": 1024},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            output = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            in_tok = usage.get("prompt_tokens", 0)
            out_tok = usage.get("completion_tokens", 0)
            cost = 0.0  # Will be computed from model_registry rates by caller

        elif provider == "cloudflare_workers_ai":
            cf_model = model_id.replace("cf-", "@cf/").replace("-", "/", 1) if model_id.startswith("cf-") else model_id
            # Use CF AI Gateway via VPS tunnel if available, else direct CF API
            if cfg.vps_tunnel_url:
                resp = httpx.post(
                    f"{cfg.vps_tunnel_url}/cf-ai",
                    headers={"x-secret": cfg.vps_secret},
                    json={"model": cf_model, "prompt": prompt},
                    timeout=timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                output = data.get("result", {}).get("response", "")
            else:
                resp = httpx.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{cfg.cf_account_id}/ai/run/{cf_model}",
                    headers={"Authorization": f"Bearer {cfg.cf_api_token}"},
                    json={"messages": [{"role": "user", "content": prompt}], "max_tokens": 1024},
                    timeout=timeout,
                )
                resp.raise_for_status()
                output = resp.json().get("result", {}).get("response", "")
            in_tok, out_tok, cost = 0, 0, 0.0

        elif provider == "ollama":
            # Ollama on nexus-vm via VPS tunnel
            ollama_model = model_id.replace("ollama/", "")
            base_url = f"{cfg.vps_tunnel_url}/ollama" if cfg.vps_tunnel_url else "http://localhost:11434"
            resp = httpx.post(
                f"{base_url}/api/generate",
                headers={"x-secret": cfg.vps_secret} if cfg.vps_tunnel_url else {},
                json={"model": ollama_model, "prompt": prompt, "stream": False},
                timeout=120,
            )
            resp.raise_for_status()
            data = resp.json()
            output = data.get("response", "")
            in_tok = data.get("prompt_eval_count", 0)
            out_tok = data.get("eval_count", 0)
            cost = 0.0  # Free local inference

        else:
            return {"output": None, "error": f"Unknown provider: {provider}", "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}

        latency = int((time.monotonic() - start) * 1000)
        return {"output": output, "error": None, "latency_ms": latency,
                "input_tokens": in_tok, "output_tokens": out_tok, "cost_usd": cost}

    except Exception as e:
        return {"output": None, "error": str(e), "latency_ms": int((time.monotonic() - start) * 1000),
                "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}


def score_with_opus(task_prompt: str, output: str, criteria: Dict, cfg: Config) -> Dict:
    """Always Opus. Always consistent. Never replaced."""
    prompt = f"Task:\n{task_prompt}\n\nResponse:\n{output[:3000]}\n\nCriteria:\n{json.dumps(criteria)}\n\nScore strictly. JSON only."
    try:
        claude = AnthropicClient(cfg)
        start = time.monotonic()
        raw = claude.complete_text(model=SCORER_MODEL, prompt=prompt, system=SCORER_SYSTEM, max_tokens=512)
        latency = int((time.monotonic() - start) * 1000)
        claude.close()
        raw = raw.strip().lstrip("```json").rstrip("```").strip()
        scores = json.loads(raw)
        scores["scoring_latency_ms"] = latency
        return scores
    except Exception as e:
        log.warning(f"Opus scoring failed: {e}")
        return {"score_accuracy": 0.5, "score_completeness": 0.5, "score_tone": 0.5,
                "score_criteria_met": 0.5, "composite_score": 0.5,
                "verdict": "conditional", "notes": f"Scoring error: {e}", "scoring_latency_ms": 0}


def refresh_routing_table(d1: D1Client, agent: str, task_type: str, run_id: str, cfg: Config) -> Optional[str]:
    """
    After test results land, compute the empirical winner for (agent, task_type)
    and upsert into agent_model_routing. Returns winning model_id or None.
    """
    rows = d1.query_rows("""
      SELECT model_id, alpha, beta, n_trials, n_successes,
             CAST(n_successes AS REAL) / NULLIF(n_trials, 0) as win_rate
      FROM model_bandit_params
      WHERE agent=? AND task_type=? AND n_trials > 0
      ORDER BY alpha DESC
    """, [agent, task_type])

    if not rows:
        return None

    winner = rows[0]
    runner_up = rows[1] if len(rows) > 1 else None
    total_alpha = sum(r["alpha"] for r in rows)
    conv_pct = round((winner["alpha"] / total_alpha) * 100, 1) if total_alpha > 0 else 0.0
    status = "converged" if conv_pct >= 60 and winner["n_trials"] >= 5 else "provisional"

    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    d1.execute("""
      INSERT INTO agent_model_routing
        (id, agent, task_type, winning_model, win_rate, n_trials, convergence_pct,
         runner_up_model, runner_up_rate, derived_from_run_id, last_test_date,
         status, promoted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent, task_type) DO UPDATE SET
        winning_model=excluded.winning_model,
        win_rate=excluded.win_rate,
        n_trials=excluded.n_trials,
        convergence_pct=excluded.convergence_pct,
        runner_up_model=excluded.runner_up_model,
        runner_up_rate=excluded.runner_up_rate,
        derived_from_run_id=excluded.derived_from_run_id,
        last_test_date=excluded.last_test_date,
        status=excluded.status,
        promoted_at=excluded.promoted_at
    """, [
        str(uuid.uuid4()), agent, task_type,
        winner["model_id"], round(float(winner.get("win_rate") or 0), 3),
        winner["n_trials"], conv_pct,
        runner_up["model_id"] if runner_up else None,
        round(float(runner_up.get("win_rate") or 0), 3) if runner_up else None,
        run_id, datetime.now(timezone.utc).date().isoformat(),
        status, now_ts,
    ])

    log.info(f"  routing [{agent}/{task_type}] -> {winner['model_id']} ({status}, conv={conv_pct:.0f}%)")
    return winner["model_id"]


def run_smoke_tests(
    provider_filter: Optional[str] = None,
    agent_filter: Optional[str] = None,
    task_type_filter: Optional[str] = None,
) -> Dict:
    cfg = Config()
    run_id = str(uuid.uuid4())
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

    summary = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"provider": provider_filter, "agent": agent_filter, "task_type": task_type_filter},
        "results": [],
        "routing_updates": [],
        "total_cost_usd": 0.0,
        "dry_run": cfg.dry_run,
        "errors": [],
    }

    with D1Client(cfg) as d1, R2Client(cfg) as r2:
        # 1. Backup before any writes
        backup_d1(d1, r2, ["model_bandit_params", "agent_model_routing", "smoke_test_results"], f"pre_smoke_{run_id[:8]}")

        # 2. Load all active models from registry — no hardcoding
        model_filter_sql = "WHERE active=1"
        model_filter_params = []
        if provider_filter:
            model_filter_sql += " AND provider=?"
            model_filter_params.append(provider_filter)
        models = d1.query_rows(f"SELECT model_id, provider, display_name, cost_input_per_1m, cost_output_per_1m FROM model_registry {model_filter_sql}", model_filter_params)
        log.info(f"Loaded {len(models)} models from registry (provider filter: {provider_filter or 'all'})")

        # 3. Register the run
        total_cases = sum(
            len(cases)
            for ag, tasks in TEST_CASES.items() if (not agent_filter or ag == agent_filter)
            for tt, cases in tasks.items() if (not task_type_filter or tt == task_type_filter)
        ) * len(models)
        d1.execute(
            "INSERT OR IGNORE INTO smoke_test_runs (id, suite_id, trigger, triggered_by, status, models_under_test, n_cases_planned, started_at) VALUES (?,?,?,?,?,?,?,?)",
            [run_id, "universal", "manual", "connor", "running", ",".join(m["model_id"] for m in models), total_cases, now_ts]
        )

        # 4. Run every (agent × task_type × model) combination
        all_results = []
        tested_pairs = set()

        for agent, task_map in TEST_CASES.items():
            if agent_filter and agent != agent_filter:
                continue
            for task_type, cases in task_map.items():
                if task_type_filter and task_type != task_type_filter:
                    continue

                log.info(f"\n{'='*60}")
                log.info(f"AGENT: {agent} | TASK: {task_type} | {len(cases)} cases x {len(models)} models")
                log.info(f"{'='*60}")

                for model in models:
                    model_id = model["model_id"]
                    provider = model["provider"]
                    log.info(f"\n  [{provider}] {model_id}")

                    model_scores = []
                    for case in cases:
                        if cfg.dry_run:
                            log.info(f"    [DRY] {case['name']} — skipped")
                            continue

                        # Call the model
                        response = call_model(model_id, provider, case["prompt"], cfg)

                        if response["error"]:
                            log.warning(f"    x {case['name']}: {response['error'][:80]}")
                            result = {
                                "run_id": run_id, "agent": agent, "task_type": task_type,
                                "model_id": model_id, "provider": provider,
                                "case_name": case["name"], "difficulty": case.get("difficulty"),
                                "error": response["error"], "composite_score": 0.0,
                                "verdict": "fail", "bandit_reward": 0.0,
                                "latency_ms": response["latency_ms"], "cost_usd": 0.0,
                            }
                        else:
                            # Score with Opus
                            scores = score_with_opus(case["prompt"], response["output"], case.get("criteria", {}), cfg)
                            # Compute cost from registry rates if provider didn't return it
                            cost = response["cost_usd"] or (
                                (response["input_tokens"] * float(model["cost_input_per_1m"]) +
                                 response["output_tokens"] * float(model["cost_output_per_1m"])) / 1_000_000
                            )
                            result = {
                                "run_id": run_id, "agent": agent, "task_type": task_type,
                                "model_id": model_id, "provider": provider,
                                "case_name": case["name"], "difficulty": case.get("difficulty"),
                                "output_text": response["output"],
                                "latency_ms": response["latency_ms"],
                                "input_tokens": response["input_tokens"],
                                "output_tokens": response["output_tokens"],
                                "cost_usd": round(cost, 8),
                                "bandit_reward": 1.0 if scores["composite_score"] >= 0.75 else 0.0,
                                **scores,
                            }
                            model_scores.append(scores["composite_score"])
                            summary["total_cost_usd"] += cost
                            log.info(f"    + {case['name']}: {scores['composite_score']:.3f} [{scores['verdict']}]")

                        all_results.append(result)

                        # Write to D1 smoke_test_results
                        result_id = str(uuid.uuid4())
                        d1.execute("""
                          INSERT OR IGNORE INTO smoke_test_results
                            (id, run_id, case_id, model_id, output_text, latency_ms,
                             input_tokens, output_tokens, cost_usd, score_accuracy,
                             score_completeness, score_tone, score_criteria_met,
                             composite_score, opus_verdict, opus_notes, bandit_reward,
                             bandit_seeded, tested_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
                        """, [
                            result_id, run_id, case["name"], model_id,
                            result.get("output_text"), result.get("latency_ms"),
                            result.get("input_tokens"), result.get("output_tokens"),
                            result.get("cost_usd"),
                            result.get("score_accuracy"), result.get("score_completeness"),
                            result.get("score_tone"), result.get("score_criteria_met"),
                            result.get("composite_score"), result.get("verdict"),
                            result.get("notes"), result.get("bandit_reward"),
                            now_ts,
                        ])

                    # Update bandit params for this (agent, task_type, model_id)
                    if model_scores and not cfg.dry_run:
                        avg_score = sum(model_scores) / len(model_scores)
                        reward = 1.0 if avg_score >= 0.75 else 0.0
                        avg_lat = sum(r.get("latency_ms", 0) for r in all_results[-len(cases):]) / len(cases)
                        avg_cost = sum(r.get("cost_usd", 0) for r in all_results[-len(cases):]) / len(cases)

                        d1.execute("""
                          INSERT INTO model_bandit_params
                            (id, agent, task_type, model_id, alpha, beta, n_trials,
                             n_successes, n_failures, avg_latency_ms, avg_cost_usd,
                             avg_quality, last_reward, last_updated)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                          ON CONFLICT(agent, task_type, model_id) DO UPDATE SET
                            alpha = alpha + excluded.alpha - 1,
                            beta  = beta  + excluded.beta  - 1,
                            n_trials    = n_trials + 1,
                            n_successes = n_successes + excluded.n_successes,
                            n_failures  = n_failures  + excluded.n_failures,
                            avg_latency_ms = (avg_latency_ms * n_trials + excluded.avg_latency_ms) / (n_trials + 1),
                            avg_cost_usd   = (avg_cost_usd   * n_trials + excluded.avg_cost_usd)   / (n_trials + 1),
                            avg_quality    = (avg_quality    * n_trials + excluded.avg_quality)     / (n_trials + 1),
                            last_reward    = excluded.last_reward,
                            last_updated   = excluded.last_updated
                        """, [
                            str(uuid.uuid4()), agent, task_type, model_id,
                            1.0 + reward, 1.0 + (1.0 - reward),
                            1, int(reward), 1 - int(reward),
                            round(avg_lat, 1), round(avg_cost, 8),
                            round(avg_score, 4), reward,
                            int(datetime.now(timezone.utc).timestamp() * 1000),
                        ])

                # After all models run for this (agent, task_type), refresh routing table
                if not cfg.dry_run:
                    winner = refresh_routing_table(d1, agent, task_type, run_id, cfg)
                    if winner:
                        summary["routing_updates"].append({
                            "agent": agent, "task_type": task_type, "winner": winner
                        })
                    tested_pairs.add((agent, task_type))

        # 5. Close run record + save backup to R2
        d1.execute("""
          UPDATE smoke_test_runs SET
            status='completed', n_cases_complete=?, n_cases_passed=?,
            total_cost_usd=?, completed_at=?
          WHERE id=?
        """, [
            len(all_results),
            sum(1 for r in all_results if r.get("bandit_reward", 0) >= 1.0),
            round(summary["total_cost_usd"], 6),
            int(datetime.now(timezone.utc).timestamp() * 1000),
            run_id,
        ])

        # 6. Save full run backup to R2 — immutable reference
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/summary.json", {
            "summary": {k: v for k, v in summary.items() if k != "results"},
            "routing_table": summary["routing_updates"],
        })
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/full_results.json", {
            "run_id": run_id, "results": all_results,
        })
        log.info(f"\nBackup saved: smoke_tests/{date_str}/{run_id}/")

    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    summary["total_results"] = len(all_results)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Universal model smoke test runner")
    parser.add_argument("--provider",  help="Filter to specific provider (anthropic|openrouter|openai|cloudflare_workers_ai|ollama)")
    parser.add_argument("--agent",     help="Filter to specific agent (FORGE|HERALD|SENTINEL|etc)")
    parser.add_argument("--task-type", help="Filter to specific task_type")
    args = parser.parse_args()

    result = run_smoke_tests(
        provider_filter=args.provider,
        agent_filter=args.agent,
        task_type_filter=args.task_type,
    )

    print(f"\n{'='*60}")
    print(f"SMOKE TEST COMPLETE — Run ID: {result['run_id'][:8]}")
    print(f"{'='*60}")
    print(f"  Results:     {result['total_results']}")
    print(f"  Total cost:  ${result['total_cost_usd']:.4f}")
    print(f"  Dry run:     {result['dry_run']}")
    if result["routing_updates"]:
        print(f"\n  ROUTING TABLE UPDATES ({len(result['routing_updates'])}):")
        for u in result["routing_updates"]:
            print(f"    {u['agent']:15} {u['task_type']:25} -> {u['winner']}")
    if result["errors"]:
        print(f"\n  Errors: {result['errors']}")
