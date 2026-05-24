#!/usr/bin/env python3
"""
nexus_ops/smoke_test_runner.py
Anthropic model smoke test harness.

Runs every registered smoke test suite against Haiku 4.5, Sonnet 4.6, Opus 4.7.
Opus scores every result. Seeds model_bandit_params with empirical priors.

Usage:
    python -m nexus_ops.smoke_test_runner                        # run all active suites
    python -m nexus_ops.smoke_test_runner --suite anthropic-core # run one suite
    python -m nexus_ops.smoke_test_runner --task-type code_generate  # one task type
    DRY_RUN=true python -m nexus_ops.smoke_test_runner           # preview only
"""

from __future__ import annotations

import argparse
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from nexus_ops.config import (
    Config, D1Client, R2Client, AnthropicClient, backup_d1, get_logger,
)

log = get_logger("smoke_test_runner")

MODELS = {
    "haiku":  "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
    "opus":   "claude-opus-4-7",
}

OPUS_SCORER_SYSTEM = """
You are a strict QA evaluator for an AI agent system.
You receive: a task prompt, an AI model response, and evaluation criteria.
You output ONLY valid JSON with this exact shape:
{
  "score_accuracy":     0.0-1.0,
  "score_completeness": 0.0-1.0,
  "score_tone":         0.0-1.0,
  "score_criteria_met": 0.0-1.0,
  "composite_score":    0.0-1.0,
  "verdict":            "pass" | "fail" | "conditional",
  "notes":              "one sentence explaining your verdict"
}
Be strict. 0.85+ = would send to a client. Below 0.70 = fail.
"""

BOOTSTRAP_CASES = {
    "intent_classify": [
        {"name": "simple_build",     "difficulty": "easy",   "prompt": "Build me a landing page for my gym", "criteria": {"must_include": ["build", "design", "web"]}},
        {"name": "ambiguous_intent", "difficulty": "medium", "prompt": "I need help with my business", "criteria": {"must_not_include": ["I cannot"]}},
        {"name": "engineering_ask",  "difficulty": "hard",   "prompt": "Analyze the hydraulic load on a centrifugal pump at 3500 RPM per API 610", "criteria": {"must_include": ["engineering", "technical"]}},
    ],
    "code_generate": [
        {"name": "react_component", "difficulty": "medium", "prompt": "Write a React TypeScript component for a data table with sorting and pagination", "criteria": {"must_include": ["useState", "TypeScript", "props"], "must_not_include": ["TODO"]}},
        {"name": "d1_query",        "difficulty": "medium", "prompt": "Write a Cloudflare D1 query to get the top 10 agents by average quality_score this week", "criteria": {"must_include": ["SELECT", "quality_score", "GROUP BY"]}},
        {"name": "edge_case_sql",   "difficulty": "hard",   "prompt": "Write a SQL migration to add Thompson Sampling beta distribution columns to an existing model_routing table without data loss", "criteria": {"must_include": ["ALTER TABLE", "DEFAULT", "ADD COLUMN"]}},
    ],
    "content_write": [
        {"name": "linkedin_hook",   "difficulty": "easy",   "prompt": "Write 3 LinkedIn post hooks for a mechanical engineer building AI tools", "criteria": {"must_include": ["engineer", "AI"]}},
        {"name": "case_study_lede", "difficulty": "medium", "prompt": "Write the opening paragraph of a case study: we helped a pump manufacturer reduce FMEA review time by 60% using AI", "criteria": {"must_include": ["pump", "FMEA", "60%"]}},
    ],
    "qa_review": [
        {"name": "code_qa",    "difficulty": "medium", "prompt": "Review this function: `def calc_rpn(s, o, d): return s*o*d` for a production FMEA system", "criteria": {"must_include": ["validation", "error", "type"]}},
        {"name": "content_qa", "difficulty": "easy",   "prompt": "Review: 'Our AI is 100% accurate and never makes mistakes.' for client-facing use", "criteria": {"must_include": ["misleading", "accuracy"], "must_not_include": ["looks good"]}},
    ],
    "json_extract": [
        {"name": "scope_extract", "difficulty": "easy", "prompt": "Extract structured JSON from: 'Build a 5-page website. Budget is $2,500. Timeline 3 weeks.'", "criteria": {"must_include": ["pages", "budget", "timeline"]}},
    ],
    "engineering_calc": [
        {"name": "pump_flow", "difficulty": "hard", "prompt": "Calculate the required impeller diameter for a centrifugal pump: Q=500 GPM, head=150ft, specific speed=1800, efficiency=0.75", "criteria": {"must_include": ["impeller", "diameter", "formula", "units"]}},
    ],
}


def score_with_opus(task_prompt: str, model_output: str, criteria: Dict, claude: AnthropicClient) -> Dict:
    scoring_prompt = f"Task prompt:\n{task_prompt}\n\nModel response:\n{model_output[:3000]}\n\nCriteria:\n{json.dumps(criteria, indent=2)}\n\nScore strictly. Output only the JSON schema."
    try:
        start = time.monotonic()
        raw = claude.complete_text(model=MODELS["opus"], prompt=scoring_prompt, system=OPUS_SCORER_SYSTEM, max_tokens=512)
        latency = int((time.monotonic() - start) * 1000)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        scores = json.loads(raw)
        scores["latency_ms"] = latency
        return scores
    except Exception as e:
        log.warning(f"Opus scoring failed: {e}")
        return {"score_accuracy": 0.5, "score_completeness": 0.5, "score_tone": 0.5, "score_criteria_met": 0.5, "composite_score": 0.5, "verdict": "conditional", "notes": f"Scoring error: {e}", "latency_ms": 0}


def run_one_case(task_type: str, case: Dict, models_to_test: List[str], claude: AnthropicClient, cfg: Config) -> List[Dict]:
    results = []
    prompt = case["prompt"]
    criteria = case.get("criteria", {})

    for model_key in models_to_test:
        model_id = MODELS[model_key]
        log.info(f"    {model_key:6} -> {case['name']}")
        try:
            start = time.monotonic()
            raw_data = claude.complete(model=model_id, prompt=prompt, max_tokens=1024)
            latency = int((time.monotonic() - start) * 1000)
            output = raw_data["content"][0]["text"]
            usage = raw_data.get("usage", {})
            in_tok = usage.get("input_tokens", 0)
            out_tok = usage.get("output_tokens", 0)
            cost = claude.estimate_cost(model_id, in_tok, out_tok)
            scores = score_with_opus(prompt, output, criteria, claude)
            results.append({"case_name": case["name"], "task_type": task_type, "difficulty": case.get("difficulty", "medium"), "model_id": model_id, "output_text": output, "latency_ms": latency, "input_tokens": in_tok, "output_tokens": out_tok, "cost_usd": round(cost, 8), **scores})
        except Exception as e:
            log.error(f"    x {model_key} failed: {e}")
            results.append({"case_name": case["name"], "task_type": task_type, "model_id": model_id, "error": str(e), "composite_score": 0.0, "verdict": "fail"})

    scored = [r for r in results if "error" not in r]
    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    for rank, r in enumerate(scored, 1):
        r["rank_in_case"] = rank
        r["bandit_reward"] = 1.0 if r["composite_score"] >= 0.75 else 0.0
    return results


def run_smoke_tests(suite_filter: Optional[str] = None, task_type_filter: Optional[str] = None, models_to_test: Optional[List[str]] = None) -> Dict:
    cfg = Config()
    if models_to_test is None:
        models_to_test = ["haiku", "sonnet", "opus"]

    summary = {"started_at": datetime.now(timezone.utc).isoformat(), "models_tested": [MODELS[m] for m in models_to_test], "results_by_task": {}, "winner_by_task": {}, "errors": [], "dry_run": cfg.dry_run}

    with D1Client(cfg) as d1, R2Client(cfg) as r2, AnthropicClient(cfg) as claude:
        backup_d1(d1, r2, ["model_bandit_params", "smoke_test_results"], "pre_smoke_test")
        run_id = str(uuid.uuid4())
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        d1.execute("INSERT OR IGNORE INTO smoke_test_runs (id, suite_id, trigger, triggered_by, status, models_under_test, n_cases_planned, started_at) VALUES (?,?,?,?,?,?,?,?)",
                   [run_id, suite_filter or "bootstrap", "manual", "connor", "running", ",".join(MODELS[m] for m in models_to_test), sum(len(v) for v in BOOTSTRAP_CASES.values()), now])

        all_results: List[Dict] = []
        task_types = [task_type_filter] if task_type_filter else list(BOOTSTRAP_CASES.keys())

        for task_type in task_types:
            cases = BOOTSTRAP_CASES.get(task_type, [])
            if not cases:
                continue
            log.info(f"\n-- {task_type} ({len(cases)} cases x {len(models_to_test)} models) --")
            task_results: List[Dict] = []
            for case in cases:
                results = run_one_case(task_type, case, models_to_test, claude, cfg)
                task_results.extend(results)
                all_results.extend(results)
                if not cfg.dry_run:
                    for r in results:
                        result_id = str(uuid.uuid4())
                        now2 = int(datetime.now(timezone.utc).timestamp() * 1000)
                        d1.execute("INSERT OR IGNORE INTO smoke_test_results (id, run_id, case_id, model_id, output_text, latency_ms, input_tokens, output_tokens, cost_usd, score_accuracy, score_completeness, score_tone, score_criteria_met, composite_score, opus_verdict, opus_notes, rank_in_case, bandit_reward, bandit_seeded, tested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)",
                                   [result_id, run_id, r.get("case_name",""), r["model_id"], r.get("output_text",""), r.get("latency_ms"), r.get("input_tokens"), r.get("output_tokens"), r.get("cost_usd"), r.get("score_accuracy"), r.get("score_completeness"), r.get("score_tone"), r.get("score_criteria_met"), r.get("composite_score"), r.get("verdict"), r.get("notes"), r.get("rank_in_case"), r.get("bandit_reward"), now2])

            by_model: Dict[str, List[float]] = {}
            for r in task_results:
                if "error" not in r and r.get("composite_score") is not None:
                    by_model.setdefault(r["model_id"], []).append(r["composite_score"])
            model_avgs = {m: sum(s)/len(s) for m, s in by_model.items() if s}
            winner = max(model_avgs, key=model_avgs.get) if model_avgs else "unknown"
            summary["results_by_task"][task_type] = model_avgs
            summary["winner_by_task"][task_type] = {"model": winner, "avg_score": round(model_avgs.get(winner, 0), 3)}
            log.info(f"  Winner: {winner} (avg={model_avgs.get(winner,0):.3f})")

        total_passed = sum(1 for r in all_results if r.get("bandit_reward", 0) >= 1.0)
        d1.execute("UPDATE smoke_test_runs SET status='completed', n_cases_complete=?, n_cases_passed=?, total_cost_usd=?, completed_at=?, results_summary_json=? WHERE id=?",
                   [len(all_results), total_passed, sum(r.get("cost_usd", 0) for r in all_results), int(datetime.now(timezone.utc).timestamp() * 1000), json.dumps(summary["winner_by_task"]), run_id])

    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    summary["total_cases"] = len(all_results)
    summary["total_passed"] = total_passed
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Anthropic model smoke test runner")
    parser.add_argument("--suite",     help="Filter to specific suite name")
    parser.add_argument("--task-type", help="Filter to specific task_type")
    parser.add_argument("--models",    nargs="+", choices=["haiku","sonnet","opus"], default=["haiku","sonnet","opus"])
    args = parser.parse_args()
    result = run_smoke_tests(suite_filter=args.suite, task_type_filter=args.task_type, models_to_test=args.models)
    print(f"\n=== SMOKE TEST SUMMARY ===")
    print(f"  Total: {result['total_cases']}  Passed: {result['total_passed']}  DryRun: {result['dry_run']}")
    for tt, w in result["winner_by_task"].items():
        print(f"    {tt:30} -> {w['model'].split('-')[1]:8} (score={w['avg_score']:.3f})")
