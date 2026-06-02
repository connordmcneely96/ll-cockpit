#!/usr/bin/env python3
"""
nexus_ops/smoke_test_runner.py
Universal model smoke test harness — optimized for PaaS model routing.

v5.1 Changes (on top of v5):
- POST-SLOT PRUNE: after every slot completes, bandit_params is pruned to top 5
  by alpha. This is the definitive fix for alpha dilution — the pool stays at
  max 5 competitors permanently, not just during testing.
- Combined with the slot cap (5 veterans + 2 new entrants = 7 tested per run),
  this guarantees convergence math always works against a 5-model pool.
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

SCORER_MODEL = "claude-sonnet-4-6"
SCORE_RETRY_ATTEMPTS = 3
SCORE_RETRY_BASE_DELAY = 5

QUALITY_FLOOR = 0.75
MAX_COST_CEILING = 12.0
MAX_LAT_CEILING = 300.0

MAX_SLOT_VETERANS = 5
MAX_NEW_ENTRANTS  = 2
MAX_SLOT_SIZE     = 5   # hard pool size — prune to this after every slot

TASK_TIERS = {
    "intent_classify":      1,
    "json_extract":         1,
    "qa_precheck":          1,
    "caption_short":        1,
    "strategic_decide":     2,
    "content_write":        2,
    "outreach_personalize": 2,
    "social_intel":         2,
    "research_summarize":   2,
    "genesis_score_gap":    2,
    "vision_check":         2,
    "qa_review":            3,
    "code_generate":        3,
    "code_complex":         3,
    "engineering_calc":     3,
    "long_doc_ingest":      3,
}

TIER_WEIGHTS = {
    1: (0.55, 0.25, 0.20),
    2: (0.65, 0.25, 0.10),
    3: (0.75, 0.25, 0.00),
}

TIER_LAT_HARD_CAP = {
    1: 15.0,
    2: 60.0,
    3: 999.0,
}

SCORER_SYSTEM = """You are a strict QA evaluator for an AI agent platform serving mechanical engineering and digital services clients.
Output ONLY valid JSON — no preamble, no markdown:
{"score_accuracy":0.0-1.0,"score_completeness":0.0-1.0,"score_tone":0.0-1.0,"score_criteria_met":0.0-1.0,"composite_score":0.0-1.0,"verdict":"pass"|"fail"|"conditional","notes":"one sentence"}
0.90+=production-ready. 0.80-0.89=good. 0.70-0.79=acceptable. below 0.70=fail.
Penalize: wrong units/missing safety factors for engineering; TODO/broken logic for code; generic language for content."""

TEST_CASES: Dict[str, Dict[str, List[Dict]]] = {

    "NEXUS": {
        "intent_classify": [
            {
                "name": "route_engineering_question", "difficulty": "medium",
                "prompt": "You are NEXUS, the AI orchestrator for Leadership Legacy Digital. Classify and route incoming requests. DO NOT answer engineering questions yourself.\n\nAgents: FORGE (code), BUILDER (UI), HERALD (content), SCOUT (outreach), INTAKE (proposals), ATLAS (engineering specialist — API 610, ASME, FMEA, pump calculations, rotating equipment), SENTINEL (QA), ANCHOR (analytics), ORACLE (research)\n\nRequest: What is the maximum allowable working pressure for a carbon steel pump casing at 300F per API 610?\n\nRoute to ATLAS for this engineering question. State why ATLAS handles API 610 engineering queries and what context to pass. Use ATLAS, engineering, and API 610 explicitly.",
                "criteria": {"must_include": ["ATLAS", "engineering", "API 610"]}
            },
            {
                "name": "route_proposal_request", "difficulty": "medium",
                "prompt": "You are NEXUS, the AI orchestrator for Leadership Legacy Digital. Classify and route incoming requests. DO NOT write the proposal yourself.\n\nAgents: FORGE (code), HERALD (content), SCOUT (outreach), INTAKE (client proposals/onboarding/scope extraction), ATLAS (engineering/FMEA), SENTINEL (QA), ANCHOR (analytics), ORACLE (research)\n\nRequest: A refinery contacted us. They need FMEA documentation for 12 centrifugal pumps. Can you put together a proposal?\n\nRoute to INTAKE to handle this proposal. State why INTAKE owns proposals and what FMEA and pump count context to pass. Use INTAKE, proposal, and FMEA explicitly.",
                "criteria": {"must_include": ["INTAKE", "proposal", "FMEA"]}
            },
        ],
        "strategic_decide": [
            {
                "name": "product_vertical_decision", "difficulty": "hard",
                "prompt": "We have $8K MRR, 3 active engineering clients, and 40hrs/week capacity. Should we launch an FMEA SaaS product now, or focus on growing the agency revenue first? Our ME background is the moat.",
                "criteria": {"must_include": ["revenue", "capacity", "risk", "moat"]}
            },
        ],
    },

    "FORGE": {
        "code_generate": [
            {
                "name": "cf_worker_router", "difficulty": "medium",
                "prompt": "Write a Cloudflare Worker using Hono that routes POST /api/agent/run to the correct agent handler based on task_type.\n\nStack: Hono v4, TypeScript strict, CF Workers\nAgents: NEXUS, SCOUT, INTAKE, FORGE, ATLAS, HERALD, SENTINEL, ANCHOR, ORACLE\nEnv: DB (D1Database), ROUTER_URL (string)\nTask map: code_generate/code_complex->FORGE | content_write->HERALD | intent_classify->NEXUS | json_extract->INTAKE | engineering_calc->ATLAS | qa_review->SENTINEL | research_summarize->ORACLE\n\nRequirements: TypeScript interfaces, validate body (400 if missing), map task_type to agent, forward to ROUTER_URL+/agents/{agent}/run, 404 for unknown, 500 on fetch error.",
                "criteria": {"must_include": ["Hono", "task_type", "TypeScript", "404", "400", "interface"], "must_not_include": ["TODO", "placeholder"]}
            },
            {
                "name": "thompson_sampling_function", "difficulty": "hard",
                "prompt": "Write a TypeScript function implementing Thompson Sampling: given array of {model_id, alpha, beta}, sample each model's Beta distribution, return the model_id with highest sample. Use Box-Muller method for Beta sampling (CF Workers only has Math.random()).",
                "criteria": {"must_include": ["alpha", "beta", "sample", "return", "TypeScript"], "must_not_include": ["TODO"]}
            },
        ],
        "code_complex": [
            {
                "name": "multi_agent_orchestration", "difficulty": "hard",
                "prompt": "Write TypeScript orchestration for NEXUS handling an FMEA request: classify intent -> call INTAKE for scope -> call ATLAS for engineering context -> call FORGE for template -> compile unified response. Handle failures at each step.",
                "criteria": {"must_include": ["INTAKE", "ATLAS", "FORGE", "error", "Promise", "async"]}
            },
        ],
    },

    "HERALD": {
        "content_write": [
            {
                "name": "case_study_pump_manufacturer", "difficulty": "medium",
                "prompt": "Write opening 2 paragraphs of a case study: Leadership Legacy Digital helped Cascade Pump & Valve (45-person pump manufacturer) reduce API 610 compliance documentation from 3 weeks to 4 days using AI agents. Connor Pattern, ME, led the implementation.",
                "criteria": {"must_include": ["Cascade", "API 610", "3 weeks", "4 days", "Connor"]}
            },
            {
                "name": "email_sequence_cold_outreach", "difficulty": "hard",
                "prompt": "Write 3-email cold outreach sequence to Engineering Directors at mid-size pump manufacturers. Pain: FMEA docs slow/inconsistent/compliance risk. Solution: AI agents cut time 60%. 100 words each, no fluff.",
                "criteria": {"must_include": ["FMEA", "documentation", "compliance"], "must_not_include": ["I hope this email finds you"]}
            },
        ],
        "caption_short": [
            {
                "name": "linkedin_build_update", "difficulty": "easy",
                "prompt": "LinkedIn post (150 words max): Thompson Sampling model router first smoke test — Haiku won intent classification at 84% quality, Sonnet won code generation at 91%. Founder, engineer voice.",
                "criteria": {"must_include": ["Thompson", "Haiku", "Sonnet", "quality"]}
            },
        ],
    },

    "INTAKE": {
        "json_extract": [
            {
                "name": "fmea_project_scope", "difficulty": "medium",
                "prompt": "Extract structured JSON: 'Hi Connor, we operate a hydrocracker unit with 28 centrifugal pumps needing FMEA documentation for API 610 compliance audit in Q3. Some RPN scores done but inconsistent. Budget ~$18K. Need in 6 weeks. Contact: Mike Torres, Reliability Engineer.'",
                "criteria": {"must_include": ["pumps", "budget", "timeline", "contact", "compliance"]}
            },
        ],
    },

    "SENTINEL": {
        "qa_precheck": [
            {
                "name": "content_accuracy_check", "difficulty": "easy",
                "prompt": "Safe to send to refinery engineering team? 'Our AI achieves 100% accuracy on FMEA documentation, eliminates all human error. Guaranteed compliance with API 610, ASME, and all industry standards.'",
                "criteria": {"must_include": ["misleading", "accuracy", "claim", "liability"], "must_not_include": ["looks good", "seems fine"]}
            },
        ],
        "qa_review": [
            {
                "name": "fmea_output_review", "difficulty": "hard",
                "prompt": "Review AI-generated FMEA entry: Failure Mode 'Seal leakage', Effect 'Process fluid release', S=8, O=4, D=6, RPN=192. Action: 'Monitor for leaks quarterly.' Acceptable for API 682 compliant FMEA at a refinery?",
                "criteria": {"must_include": ["RPN", "API 682", "detection", "action", "frequency"]}
            },
            {
                "name": "code_pr_review", "difficulty": "hard",
                "prompt": "Review before merging: `export async function routeToModel(taskType: string) { const models = await db.query('SELECT * FROM model_bandit_params'); const winner = models[0]; return callModel(winner.model_id); }` Thompson Sampling router for production.",
                "criteria": {"must_include": ["sampling", "alpha", "beta", "filter", "error handling"]}
            },
        ],
    },

    "ATLAS": {
        "engineering_calc": [
            {
                "name": "npsh_calculation", "difficulty": "hard",
                "prompt": "Calculate NPSHa: atmospheric suction (14.7 psia), liquid level 8ft above pump, friction loss 2.5ft, water at 180F (VP=7.51 psia, density=60.6 lb/ft3). Show formula, units, compare to NPSHr=12ft.",
                "criteria": {"must_include": ["NPSHa", "vapor pressure", "formula", "ft", "psia"]}
            },
            {
                "name": "shaft_critical_speed", "difficulty": "hard",
                "prompt": "First critical speed: L=30in between bearings, shaft OD=1.75in solid steel (E=30e6 psi, density=0.283 lb/in3), impeller weight=15 lbs at midspan. Use Rayleigh method. Above or below 3560 RPM?",
                "criteria": {"must_include": ["critical speed", "RPM", "Rayleigh", "formula", "3560"]}
            },
        ],
        "long_doc_ingest": [
            {
                "name": "fmea_methodology_summary", "difficulty": "medium",
                "prompt": "Summarize FMEA methodology for rotating equipment per IEC 60812 and API RP 581: steps, RPN calculation and interpretation, typical centrifugal pump failure modes, RPN-based prioritization limitations.",
                "criteria": {"must_include": ["RPN", "severity", "occurrence", "detection", "failure mode", "centrifugal pump"]}
            },
        ],
    },

    "SCOUT": {
        "outreach_personalize": [
            {
                "name": "upwork_proposal", "difficulty": "hard",
                "prompt": "Upwork proposal for: 'Need AI developer to automate FMEA docs for pump fleet. 35 pumps, API 610 service, RPN scoring and action tracking. Budget $15K-$25K.' Write as Connor Pattern, ME and AI developer. 200 words max.",
                "criteria": {"must_include": ["mechanical engineer", "FMEA", "RPN", "API 610", "approach"]}
            },
        ],
        "social_intel": [
            {
                "name": "fmea_pain_point_research", "difficulty": "medium",
                "prompt": "Top 5 pain points reliability engineers discuss about FMEA documentation in process industries (2024-2025)? What makes it slow, inconsistent, or non-compliant? Cite refining, petrochemical, power gen. Format as content/outreach insights.",
                "criteria": {"must_include": ["documentation", "inconsistent", "compliance", "reliability engineer"]}
            },
        ],
    },

    "ORACLE": {
        "research_summarize": [
            {
                "name": "ai_engineering_adoption", "difficulty": "medium",
                "prompt": "Synthesize AI adoption in mechanical engineering and predictive maintenance as of 2025: leading companies, proven use cases, typical ROI, where resistance exists. Executive briefing for a founder choosing a vertical.",
                "criteria": {"must_include": ["predictive maintenance", "ROI", "adoption", "resistance"]}
            },
        ],
        "genesis_score_gap": [
            {
                "name": "fmea_saas_opportunity", "difficulty": "hard",
                "prompt": "Score 1-10 with reasoning: AI-powered FMEA documentation SaaS for process industries. Dimensions: (1) Market size (2) Competition density (3) Willingness to pay (4) Founder ME moat (5) Time to first revenue (6) Scalability. Recommend: launch now, wait, or skip.",
                "criteria": {"must_include": ["market size", "competition", "willingness", "moat", "revenue", "scale"]}
            },
        ],
    },

    "ANCHOR": {
        "research_summarize": [
            {
                "name": "llm_cost_optimization", "difficulty": "medium",
                "prompt": "Optimal LLM cost structure at $10K MRR: Haiku for classification, Sonnet for primary, Opus for gates. Average 500 input + 800 output tokens/task, ~500 tasks/day. What % of revenue = LLM costs? Optimization path? At what scale does it break?",
                "criteria": {"must_include": ["cost", "tokens", "percentage", "optimization", "Haiku", "Sonnet"]}
            },
        ],
    },

    "BUILDER": {
        "vision_check": [
            {
                "name": "ui_layout_assessment", "difficulty": "medium",
                "prompt": "Describe a well-designed Cockpit routing intelligence dashboard: shows winning model per agent/task_type, convergence status, win rates as bars, cost per model, run smoke test button. Layout, color coding, data hierarchy for a founder checking daily.",
                "criteria": {"must_include": ["layout", "color", "hierarchy", "win rate", "convergence"]}
            },
        ],
        "code_generate": [
            {
                "name": "cockpit_routing_panel", "difficulty": "hard",
                "prompt": "React TypeScript component for Routing Intelligence panel: fetch from /api/routing/standings, table with agent/task_type rows, colored badge (green=converged, yellow=provisional), win rate progress bar, n_trials, refresh button. Tailwind only.",
                "criteria": {"must_include": ["useState", "useEffect", "fetch", "TypeScript", "badge", "progress"], "must_not_include": ["TODO"]}
            },
        ],
    },
}

TEST_CASES["META_COGNITION"] = {
    "qa_review": [
        {
            "name": "prompt_quality_analysis", "difficulty": "hard",
            "prompt": "Analyze and rewrite this agent system prompt:\n\nCURRENT: 'You are HERALD, the content agent. Write good content for Connor's business. Make LinkedIn posts, emails, and other content. Be professional and helpful. Write about engineering and AI topics. Help Connor grow his business.'\n\nContext: HERALD serves a ME building AI tools for process industries. Quality score 0.62 over 20 tasks. Rewrite to score 0.85+.",
            "criteria": {"must_include": ["mechanical engineer", "FMEA", "API 610", "output schema"], "must_not_include": ["be helpful", "be professional"]}
        },
    ],
}


def call_model(model_id: str, provider: str, prompt: str, cfg: Config, timeout: int = 90) -> Dict[str, Any]:
    start = time.monotonic()
    try:
        if provider == "anthropic":
            claude = AnthropicClient(cfg)
            data = claude.complete(model=model_id, prompt=prompt, max_tokens=2048)
            claude.close()
            output = data["content"][0]["text"]
            usage = data.get("usage", {})
            in_tok, out_tok = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
            cost = claude.estimate_cost(model_id, in_tok, out_tok)

        elif provider in ("openrouter", "openai"):
            base = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
            api_key = os.getenv("OPENROUTER_API_KEY") if provider == "openrouter" else os.getenv("OPENAI_API_KEY", "")
            if not api_key or not api_key.strip():
                return {"output": None, "error": f"Missing API key for {provider}",
                        "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            resp = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key.strip()}",
                         "Content-Type": "application/json",
                         "HTTP-Referer": "https://ll-cockpit.connorpattern.workers.dev"},
                json={"model": model_id,
                      "messages": [{"role": "user", "content": prompt}],
                      "max_tokens": 2048},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                err_msg = data["error"].get("message", str(data["error"]))
                return {"output": None, "error": f"api_error: {err_msg[:150]}",
                        "latency_ms": int((time.monotonic() - start) * 1000),
                        "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            if not data.get("choices"):
                return {"output": None, "error": "no_choices_in_response",
                        "latency_ms": int((time.monotonic() - start) * 1000),
                        "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            choice = data["choices"][0]
            output = (choice.get("message") or {}).get("content") or ""
            if not output:
                return {"output": None, "error": "empty_content_in_choice",
                        "latency_ms": int((time.monotonic() - start) * 1000),
                        "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            usage = data.get("usage", {})
            in_tok, out_tok, cost = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), 0.0

        elif provider == "cloudflare_workers_ai":
            cf_model_map = {
                "cf-llama-3-3-70b": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                "cf-llama-4-scout": "@cf/meta/llama-4-scout-17b-16e-instruct",
            }
            cf_model = cf_model_map.get(model_id, model_id)
            resp = httpx.post(
                f"https://api.cloudflare.com/client/v4/accounts/{cfg.cf_account_id}/ai/run/{cf_model}",
                headers={"Authorization": f"Bearer {cfg.cf_api_token}"},
                json={"messages": [{"role": "user", "content": prompt}], "max_tokens": 2048},
                timeout=timeout,
            )
            resp.raise_for_status()
            result = resp.json().get("result", {})
            output = result.get("response", "") or result.get("answer", "")
            in_tok, out_tok, cost = 0, 0, 0.0

        elif provider == "ollama":
            ollama_model = model_id.replace("ollama/", "")
            base_url = f"{cfg.vps_tunnel_url}/ollama" if cfg.vps_tunnel_url else "http://localhost:11434"
            resp = httpx.post(
                f"{base_url}/api/generate",
                headers={"x-secret": cfg.vps_secret} if cfg.vps_tunnel_url else {},
                json={"model": ollama_model, "prompt": prompt, "stream": False},
                timeout=180,
            )
            resp.raise_for_status()
            data = resp.json()
            output = data.get("response", "")
            in_tok, out_tok, cost = data.get("prompt_eval_count", 0), data.get("eval_count", 0), 0.0

        else:
            return {"output": None, "error": f"Unknown provider: {provider}",
                    "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}

        return {"output": output, "error": None,
                "latency_ms": int((time.monotonic() - start) * 1000),
                "input_tokens": in_tok, "output_tokens": out_tok, "cost_usd": cost}

    except Exception as e:
        return {"output": None, "error": str(e),
                "latency_ms": int((time.monotonic() - start) * 1000),
                "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}


def compute_bandit_reward(
    composite_score: float,
    cost_input: float,
    cost_output: float,
    latency_ms: float,
    task_type: str,
) -> float:
    tier = TASK_TIERS.get(task_type, 2)
    lat_s = latency_ms / 1000.0
    if lat_s > TIER_LAT_HARD_CAP[tier]:
        return 0.0
    if composite_score < QUALITY_FLOOR:
        return 0.0
    qw, cw, lw = TIER_WEIGHTS[tier]
    cost_avg = (cost_input + cost_output * 2) / 3.0
    cost_eff = 1.0 - min(cost_avg / MAX_COST_CEILING, 1.0)
    lat_eff = (1.0 - min(lat_s / MAX_LAT_CEILING, 1.0)) if lw > 0 else 0.0
    return round(qw * composite_score + cw * cost_eff + lw * lat_eff, 4)


def score_with_sonnet(task_prompt: str, output: str, criteria: Dict, cfg: Config) -> Optional[Dict]:
    prompt = f"Task:\n{task_prompt[:1000]}\n\nResponse:\n{output[:4000]}\n\nCriteria:\n{json.dumps(criteria)}\n\nScore strictly. Output only JSON."
    for attempt in range(SCORE_RETRY_ATTEMPTS):
        try:
            claude = AnthropicClient(cfg)
            start = time.monotonic()
            raw = claude.complete_text(model=SCORER_MODEL, prompt=prompt, system=SCORER_SYSTEM, max_tokens=512)
            latency = int((time.monotonic() - start) * 1000)
            claude.close()
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()
            scores = json.loads(raw)
            scores["scoring_latency_ms"] = latency
            return scores
        except Exception as e:
            delay = SCORE_RETRY_BASE_DELAY * (2 ** attempt)
            if attempt < SCORE_RETRY_ATTEMPTS - 1:
                log.warning(f"Sonnet scoring attempt {attempt+1} failed: {e} — retrying in {delay}s")
                time.sleep(delay)
            else:
                log.error(f"Sonnet scoring failed after {SCORE_RETRY_ATTEMPTS} attempts: {e} — result SKIPPED")
                return None


def get_slot_competitors(
    d1: D1Client,
    agent: str,
    task_type: str,
    all_models: List[Dict],
) -> List[Dict]:
    """Top MAX_SLOT_VETERANS veterans + up to MAX_NEW_ENTRANTS new models per slot per run."""
    params = d1.query_rows(
        "SELECT model_id, alpha FROM model_bandit_params WHERE agent=? AND task_type=? ORDER BY alpha DESC",
        [agent, task_type],
    )
    ranked_ids = [r["model_id"] for r in params]
    param_set  = {r["model_id"] for r in params}
    veterans     = [m for m in all_models if m["model_id"] in param_set]
    new_entrants = [m for m in all_models if m["model_id"] not in param_set]
    id_to_rank   = {mid: i for i, mid in enumerate(ranked_ids)}
    veterans.sort(key=lambda m: id_to_rank.get(m["model_id"], 9999))
    n_new  = min(MAX_NEW_ENTRANTS, len(new_entrants))
    n_vets = min(MAX_SLOT_VETERANS, len(veterans))
    selected = veterans[:n_vets] + new_entrants[:n_new]
    skipped  = len(all_models) - len(selected)
    if skipped > 0:
        log.info(f"  Slot cap: {len(selected)}/{len(all_models)} models "
                 f"({n_vets} veterans + {n_new} new) — {skipped} benched")
    return selected


def prune_slot(d1: D1Client, agent: str, task_type: str) -> int:
    """
    Keep only top MAX_SLOT_SIZE models in bandit_params for this slot.
    Called after every slot completes — ensures convergence math always
    works against a tight pool regardless of how many models have ever run.
    Returns number of rows deleted.
    """
    d1.execute(
        """DELETE FROM model_bandit_params
           WHERE agent=? AND task_type=?
           AND model_id NOT IN (
             SELECT model_id FROM model_bandit_params
             WHERE agent=? AND task_type=?
             ORDER BY alpha DESC, avg_quality DESC
             LIMIT ?
           )""",
        [agent, task_type, agent, task_type, MAX_SLOT_SIZE],
    )
    return MAX_SLOT_SIZE


def refresh_routing_table(d1: D1Client, agent: str, task_type: str, run_id: str) -> Optional[str]:
    rows = d1.query_rows(
        """SELECT model_id, alpha, beta, n_trials, n_successes,
                 CAST(n_successes AS REAL) / NULLIF(n_trials, 0) as win_rate, avg_quality
           FROM model_bandit_params
           WHERE agent=? AND task_type=? AND n_trials > 0
           ORDER BY alpha DESC, avg_quality DESC""",
        [agent, task_type],
    )
    if not rows:
        return None
    winner = rows[0]
    runner_up = rows[1] if len(rows) > 1 else None
    total_alpha = sum(float(r["alpha"]) for r in rows)
    conv_pct = round((float(winner["alpha"]) / total_alpha) * 100, 1) if total_alpha > 0 else 0.0
    status = "converged" if conv_pct >= 60 and winner["n_trials"] >= 5 else "provisional"
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    d1.execute(
        """INSERT INTO agent_model_routing
            (id, agent, task_type, winning_model, win_rate, n_trials, convergence_pct,
             runner_up_model, runner_up_rate, derived_from_run_id, last_test_date, status, promoted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(agent, task_type) DO UPDATE SET
             winning_model=excluded.winning_model, win_rate=excluded.win_rate,
             n_trials=excluded.n_trials, convergence_pct=excluded.convergence_pct,
             runner_up_model=excluded.runner_up_model, runner_up_rate=excluded.runner_up_rate,
             derived_from_run_id=excluded.derived_from_run_id, last_test_date=excluded.last_test_date,
             status=excluded.status, promoted_at=excluded.promoted_at""",
        [str(uuid.uuid4()), agent, task_type,
         winner["model_id"], round(float(winner.get("win_rate") or 0), 3),
         winner["n_trials"], conv_pct,
         runner_up["model_id"] if runner_up else None,
         round(float(runner_up.get("win_rate") or 0), 3) if runner_up else None,
         run_id, datetime.now(timezone.utc).date().isoformat(), status, now_ts],
    )
    log.info(f"  routing [{agent}/{task_type}] -> {winner['model_id']} ({status}, conv={conv_pct:.0f}%)")
    return winner["model_id"]


def run_smoke_tests(provider_filter=None, agent_filter=None, task_type_filter=None) -> Dict:
    cfg = Config()
    run_id = str(uuid.uuid4())
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    summary = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "scorer": SCORER_MODEL,
        "reward_fn": "v4: quality+cost+latency, task-tier aware",
        "slot_cap": f"{MAX_SLOT_VETERANS}+{MAX_NEW_ENTRANTS} tested, {MAX_SLOT_SIZE} kept",
        "filters": {"provider": provider_filter, "agent": agent_filter, "task_type": task_type_filter},
        "routing_updates": [], "total_cost_usd": 0.0, "dry_run": cfg.dry_run,
        "errors": [], "scoring_skipped": 0,
    }

    with D1Client(cfg) as d1, R2Client(cfg) as r2:
        backup_d1(d1, r2, ["model_bandit_params", "agent_model_routing", "smoke_test_results"],
                  f"pre_smoke_{run_id[:8]}")

        sql, params = "WHERE active=1", []
        if provider_filter:
            sql += " AND provider=?"
            params.append(provider_filter)
        models = d1.query_rows(
            f"SELECT model_id, provider, display_name, cost_input_per_1m, cost_output_per_1m FROM model_registry {sql}",
            params,
        )
        log.info(f"Loaded {len(models)} active models | Scorer: {SCORER_MODEL} | "
                 f"Slot: test {MAX_SLOT_VETERANS}+{MAX_NEW_ENTRANTS}, keep top {MAX_SLOT_SIZE}")

        total_cases = sum(
            len(cases)
            for ag, tasks in TEST_CASES.items() if (not agent_filter or ag == agent_filter)
            for tt, cases in tasks.items() if (not task_type_filter or tt == task_type_filter)
        ) * min(len(models), MAX_SLOT_VETERANS + MAX_NEW_ENTRANTS)

        d1.execute(
            "INSERT OR IGNORE INTO smoke_test_runs (id, suite_id, trigger, triggered_by, status, models_under_test, n_cases_planned, started_at) VALUES (?,?,?,?,?,?,?,?)",
            [run_id, "universal", "manual", "connor", "running",
             ",".join(m["model_id"] for m in models), total_cases, now_ts],
        )

        all_results = []
        for agent, task_map in TEST_CASES.items():
            if agent_filter and agent != agent_filter:
                continue
            for task_type, cases in task_map.items():
                if task_type_filter and task_type != task_type_filter:
                    continue
                tier = TASK_TIERS.get(task_type, 2)
                slot_models = get_slot_competitors(d1, agent, task_type, models) if not cfg.dry_run else models
                log.info(f"\n{'='*60}\nAGENT: {agent} | TASK: {task_type} (Tier {tier}) | "
                         f"{len(cases)} cases x {len(slot_models)} models\n{'='*60}")

                for model in slot_models:
                    model_id, provider = model["model_id"], model["provider"]
                    cost_in  = float(model.get("cost_input_per_1m") or 0)
                    cost_out = float(model.get("cost_output_per_1m") or 0)
                    log.info(f"\n  [{provider}] {model_id} (${cost_in:.3f}/${cost_out:.3f} per MTok)")
                    model_rewards, model_results_batch = [], []

                    for case in cases:
                        if cfg.dry_run:
                            log.info(f"    [DRY] {case['name']} — skipped")
                            continue

                        response = call_model(model_id, provider, case["prompt"], cfg)

                        if response["error"] or not response.get("output"):
                            err_msg = response.get("error") or "null_output"
                            log.warning(f"    x {case['name']}: {str(err_msg)[:100]}")
                            all_results.append({
                                "run_id": run_id, "agent": agent, "task_type": task_type,
                                "model_id": model_id, "case_name": case["name"],
                                "error": err_msg, "composite_score": 0.0, "bandit_reward": 0.0,
                            })
                            result_id = str(uuid.uuid4())
                            d1.execute(
                                """INSERT OR IGNORE INTO smoke_test_results
                                   (id, run_id, case_id, model_id, agent, task_type, latency_ms, cost_usd,
                                    composite_score, opus_verdict, opus_notes, bandit_reward, bandit_seeded, tested_at)
                                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)""",
                                [result_id, run_id, case["name"], model_id, agent, task_type,
                                 response.get("latency_ms"), 0.0, 0.0, "fail", err_msg, 0.0, now_ts],
                            )
                            continue

                        scores = score_with_sonnet(case["prompt"], response["output"], case.get("criteria", {}), cfg)
                        if scores is None:
                            summary["scoring_skipped"] += 1
                            log.warning(f"    SKIP {case['name']} — scoring failed, excluded from bandit")
                            continue

                        actual_cost = response["cost_usd"] or (
                            (response["input_tokens"] * cost_in + response["output_tokens"] * cost_out) / 1_000_000
                        )
                        bandit_reward = compute_bandit_reward(
                            scores["composite_score"], cost_in, cost_out,
                            response["latency_ms"], task_type,
                        )

                        result = {
                            "run_id": run_id, "agent": agent, "task_type": task_type,
                            "model_id": model_id, "provider": provider,
                            "case_name": case["name"], "difficulty": case.get("difficulty"),
                            "output_text": response["output"], "latency_ms": response["latency_ms"],
                            "input_tokens": response["input_tokens"], "output_tokens": response["output_tokens"],
                            "cost_usd": round(actual_cost, 8),
                            "bandit_reward": bandit_reward, **scores,
                        }
                        model_rewards.append(bandit_reward)
                        model_results_batch.append(result)
                        summary["total_cost_usd"] += actual_cost

                        lat_flag = " ⚠LAT" if response["latency_ms"] > TIER_LAT_HARD_CAP[tier] * 1000 else ""
                        log.info(f"    + {case['name']:36} q={scores['composite_score']:.3f} "
                                 f"r={bandit_reward:.3f} {response['latency_ms']}ms{lat_flag}")

                        all_results.append(result)
                        result_id = str(uuid.uuid4())
                        d1.execute(
                            """INSERT OR IGNORE INTO smoke_test_results
                               (id, run_id, case_id, model_id, agent, task_type, output_text, latency_ms,
                                input_tokens, output_tokens, cost_usd, score_accuracy, score_completeness,
                                score_tone, score_criteria_met, composite_score, opus_verdict, opus_notes,
                                bandit_reward, bandit_seeded, tested_at)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)""",
                            [result_id, run_id, case["name"], model_id, agent, task_type,
                             result.get("output_text", "")[:8000], result.get("latency_ms"),
                             result.get("input_tokens"), result.get("output_tokens"), result.get("cost_usd"),
                             result.get("score_accuracy"), result.get("score_completeness"),
                             result.get("score_tone"), result.get("score_criteria_met"),
                             result.get("composite_score"), result.get("verdict"),
                             result.get("notes"), bandit_reward, now_ts],
                        )

                    if model_rewards and not cfg.dry_run:
                        avg_reward  = sum(model_rewards) / len(model_rewards)
                        valid_lat   = [r.get("latency_ms", 0) for r in model_results_batch if r.get("latency_ms")]
                        valid_cost  = [r.get("cost_usd", 0)   for r in model_results_batch if r.get("cost_usd")]
                        avg_quality = sum(r.get("composite_score", 0) for r in model_results_batch) / len(model_results_batch)
                        n_wins      = sum(1 for r in model_results_batch if r.get("bandit_reward", 0) > 0)
                        n_losses    = len(model_rewards) - n_wins
                        d1.execute(
                            """INSERT INTO model_bandit_params
                               (id, agent, task_type, model_id, alpha, beta, n_trials, n_successes, n_failures,
                                avg_latency_ms, avg_cost_usd, avg_quality, last_reward, last_updated)
                               VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?)
                               ON CONFLICT(agent, task_type, model_id) DO UPDATE SET
                                 alpha=alpha+?,
                                 beta=beta+?,
                                 n_trials=n_trials+1,
                                 n_successes=n_successes+?,
                                 n_failures=n_failures+?,
                                 avg_latency_ms=(avg_latency_ms*n_trials+excluded.avg_latency_ms)/(n_trials+1),
                                 avg_cost_usd=(avg_cost_usd*n_trials+excluded.avg_cost_usd)/(n_trials+1),
                                 avg_quality=(avg_quality*n_trials+excluded.avg_quality)/(n_trials+1),
                                 last_reward=excluded.last_reward, last_updated=excluded.last_updated""",
                            [str(uuid.uuid4()), agent, task_type, model_id,
                             1.0 + avg_reward, 1.0 + (1.0 - avg_reward),
                             n_wins, n_losses,
                             round(sum(valid_lat)  / len(valid_lat)  if valid_lat  else 0, 1),
                             round(sum(valid_cost) / len(valid_cost) if valid_cost else 0, 8),
                             round(avg_quality, 4), avg_reward,
                             int(datetime.now(timezone.utc).timestamp() * 1000),
                             avg_reward, (1.0 - avg_reward), n_wins, n_losses],
                        )

                if not cfg.dry_run:
                    # POST-SLOT PRUNE — hard cap pool at MAX_SLOT_SIZE (5)
                    # This is the definitive fix for alpha dilution.
                    # New entrant models may have entered this run — prune back to top 5
                    # so convergence math always works against a 5-model pool, not 7+.
                    prune_slot(d1, agent, task_type)

                    winner = refresh_routing_table(d1, agent, task_type, run_id)
                    if winner:
                        summary["routing_updates"].append({"agent": agent, "task_type": task_type, "winner": winner})

        d1.execute(
            "UPDATE smoke_test_runs SET status='completed', n_cases_complete=?, n_cases_passed=?, total_cost_usd=?, completed_at=? WHERE id=?",
            [len(all_results), sum(1 for r in all_results if r.get("bandit_reward", 0) > 0),
             round(summary["total_cost_usd"], 6),
             int(datetime.now(timezone.utc).timestamp() * 1000), run_id],
        )

        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/summary.json",
                       {"run_id": run_id, "scorer": SCORER_MODEL, "reward_fn": "v4",
                        "slot_cap": f"{MAX_SLOT_VETERANS+MAX_NEW_ENTRANTS} tested / {MAX_SLOT_SIZE} kept",
                        "filters": summary["filters"], "total_cost_usd": summary["total_cost_usd"],
                        "routing_updates": summary["routing_updates"],
                        "total_results": len(all_results), "scoring_skipped": summary["scoring_skipped"]})
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/full_results.json",
                       {"run_id": run_id, "results": all_results})
        log.info(f"\nR2 backup: smoke_tests/{date_str}/{run_id}/")

    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    summary["total_results"] = len(all_results)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider",  help="anthropic|openrouter|openai|cloudflare_workers_ai|ollama")
    parser.add_argument("--agent",     help="agent name or blank for all")
    parser.add_argument("--task-type", help="task type or blank for all")
    args = parser.parse_args()
    result = run_smoke_tests(
        provider_filter=args.provider,
        agent_filter=args.agent,
        task_type_filter=args.task_type,
    )
    print(f"\n{'='*60}\nSMOKE TEST COMPLETE — Run ID: {result['run_id'][:8]}\n{'='*60}")
    print(f"  Scorer:      {SCORER_MODEL}")
    print(f"  Reward fn:   v4 (quality+cost+latency, task-tier aware)")
    print(f"  Slot config: test {MAX_SLOT_VETERANS}+{MAX_NEW_ENTRANTS}, keep top {MAX_SLOT_SIZE}")
    print(f"  Results:     {result['total_results']}")
    print(f"  Cost:        ${result['total_cost_usd']:.4f}")
    print(f"  DryRun:      {result['dry_run']}")
    print(f"  Skipped:     {result['scoring_skipped']}")
    if result["routing_updates"]:
        print(f"\n  ROUTING TABLE UPDATES ({len(result['routing_updates'])}):")
        for u in result["routing_updates"]:
            print(f"    {u['agent']:20} {u['task_type']:25} -> {u['winner']}")
