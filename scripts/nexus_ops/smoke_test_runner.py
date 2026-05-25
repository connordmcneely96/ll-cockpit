#!/usr/bin/env python3
"""
nexus_ops/smoke_test_runner.py
Universal model smoke test harness.

Tests EVERY model in model_registry against every (agent, task_type) combination.
Nothing is hardcoded. Winners are empirically derived.
Results seed model_bandit_params and refresh agent_model_routing.

All test cases are grounded in real platform scenarios:
- NEXUS AI agent platform (Cloudflare Workers, D1, R2, Hono, React)
- Mechanical engineering verticals (API 610/682, ASME, FMEA, pump systems)
- Digital services (outreach, content, proposals, client delivery)
- Business operations (revenue, analytics, market intelligence)

Providers: anthropic | openrouter | openai | cloudflare_workers_ai | ollama

Usage:
    python -m nexus_ops.smoke_test_runner                         # all models, all tasks
    python -m nexus_ops.smoke_test_runner --provider anthropic    # one provider
    python -m nexus_ops.smoke_test_runner --agent FORGE           # one agent
    python -m nexus_ops.smoke_test_runner --task-type code_generate
    DRY_RUN=true python -m nexus_ops.smoke_test_runner            # preview, no writes
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
# Consistent judge across all providers and all runs.
# ─────────────────────────────────────────────────────────────
SCORER_MODEL = "claude-opus-4-7"

SCORER_SYSTEM = """
You are a strict QA evaluator for an AI agent platform serving mechanical engineering and digital services clients.
You receive: a task prompt, an AI model response, and evaluation criteria.
Output ONLY valid JSON — no preamble, no markdown fences:
{
  "score_accuracy":     0.0-1.0,
  "score_completeness": 0.0-1.0,
  "score_tone":         0.0-1.0,
  "score_criteria_met": 0.0-1.0,
  "composite_score":    0.0-1.0,
  "verdict":            "pass" | "fail" | "conditional",
  "notes":              "one sentence explaining what passed or failed"
}
Scoring guide:
- 0.90+ = production-ready, no changes needed
- 0.80-0.89 = good, minor improvements possible
- 0.70-0.79 = acceptable, notable gaps
- 0.60-0.69 = conditional pass, significant issues
- below 0.60 = fail

For engineering content: penalize heavily for wrong units, missing safety factors, or invented standards.
For code: penalize for TODO placeholders, missing error handling, or non-functional logic.
For content: penalize for generic language that ignores the ME/platform context.
"""

# ─────────────────────────────────────────────────────────────
# COMPREHENSIVE TEST CASES
# Organized by (agent, task_type) — real platform scenarios only.
# Every case maps to a real workflow that will run in production.
# ─────────────────────────────────────────────────────────────
TEST_CASES: Dict[str, Dict[str, List[Dict]]] = {

    # ──────────────────────────────────────────────────────────
    # NEXUS — Master orchestrator, intent classification, strategic decisions
    # ──────────────────────────────────────────────────────────
    "NEXUS": {
        "intent_classify": [
            {
                "name": "route_build_request",
                "difficulty": "easy",
                "prompt": "I need a landing page for my pump testing company. Clean design, show our API 610 compliance services.",
                "criteria": {"must_include": ["BUILDER", "HERALD", "design", "build"], "must_not_include": ["I cannot", "I am unable"]}
            },
            {
                "name": "route_engineering_question",
                "difficulty": "medium",
                "prompt": "What's the maximum allowable working pressure for a carbon steel pump casing at 300°F per API 610?",
                "criteria": {"must_include": ["ATLAS", "engineering", "API 610"]}
            },
            {
                "name": "route_proposal_request",
                "difficulty": "medium",
                "prompt": "A refinery contacted us. They need FMEA documentation for 12 centrifugal pumps. Can you put together a proposal?",
                "criteria": {"must_include": ["INTAKE", "proposal", "FMEA"]}
            },
            {
                "name": "route_ambiguous_growth",
                "difficulty": "hard",
                "prompt": "We need to grow faster. What should we focus on this week?",
                "criteria": {"must_include": ["clarif", "revenue", "priorit"], "must_not_include": ["I cannot help"]}
            },
            {
                "name": "route_content_request",
                "difficulty": "easy",
                "prompt": "Write me 3 LinkedIn posts about how AI is changing mechanical engineering documentation.",
                "criteria": {"must_include": ["HERALD", "content", "LinkedIn"]}
            },
        ],
        "strategic_decide": [
            {
                "name": "product_vertical_decision",
                "difficulty": "hard",
                "prompt": "We have $8K MRR, 3 active engineering clients, and 40hrs/week capacity. Should we launch an FMEA SaaS product now, or focus on growing the agency revenue first? Our ME background is the moat.",
                "criteria": {"must_include": ["revenue", "capacity", "risk", "moat"], "tone": "structured decision framework"}
            },
            {
                "name": "pricing_strategy",
                "difficulty": "hard",
                "prompt": "A mid-size pump manufacturer wants to license our AI FMEA tool for their internal team of 8 engineers. What pricing model and range should we propose? We currently charge $5K setup + $500/mo for agencies.",
                "criteria": {"must_include": ["pricing", "value", "per seat", "license"], "must_not_include": ["I don't know"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # FORGE — Full-stack engineer: CF Workers, D1, React, TypeScript
    # ──────────────────────────────────────────────────────────
    "FORGE": {
        "code_generate": [
            {
                "name": "cf_worker_router",
                "difficulty": "medium",
                "prompt": "Write a Cloudflare Worker using Hono that routes POST /api/agent/run to one of 12 agent handlers based on a 'task_type' field in the JSON body. Include proper TypeScript types and a 404 fallback.",
                "criteria": {"must_include": ["Hono", "task_type", "TypeScript", "404"], "must_not_include": ["TODO", "placeholder"]}
            },
            {
                "name": "d1_query_complex",
                "difficulty": "medium",
                "prompt": "Write a Cloudflare D1 SQL query: for each agent, show the top-performing model (highest avg composite_score) over the last 30 days, including win rate and total cost. Use model_bandit_params and smoke_test_results tables.",
                "criteria": {"must_include": ["SELECT", "model_bandit_params", "GROUP BY", "ORDER BY", "AVG"]}
            },
            {
                "name": "react_dashboard_component",
                "difficulty": "medium",
                "prompt": "Write a React TypeScript component for a routing intelligence dashboard. It should display a table of agent/task_type rows, with columns: current winning model, win rate (as a progress bar), n_trials, and status badge (converged/provisional). No external UI libraries.",
                "criteria": {"must_include": ["useState", "TypeScript", "interface", "win_rate"], "must_not_include": ["TODO"]}
            },
            {
                "name": "thompson_sampling_function",
                "difficulty": "hard",
                "prompt": "Write a TypeScript function that implements Thompson Sampling model selection. Given an array of {model_id, alpha, beta} objects, sample from each model's Beta distribution and return the model_id with the highest sample. Include the Beta distribution sampling logic using the Box-Muller method as a fallback since Math.random() is all we have in CF Workers.",
                "criteria": {"must_include": ["alpha", "beta", "sample", "return", "TypeScript"], "must_not_include": ["TODO"]}
            },
            {
                "name": "api_endpoint_with_auth",
                "difficulty": "medium",
                "prompt": "Write a Cloudflare Worker endpoint POST /api/smoke-test/run that: verifies a bearer token from env.API_SECRET, validates the request body has provider and agent fields, calls a downstream service, and returns structured JSON with run_id and status. Include error handling.",
                "criteria": {"must_include": ["bearer", "env", "error", "run_id", "TypeScript"]}
            },
            {
                "name": "supabase_vector_search",
                "difficulty": "hard",
                "prompt": "Write a Python function that takes a query string, generates a 1024-dim embedding via an HTTP call to a local endpoint, then queries Supabase's semantic_task_index table using pgvector cosine similarity to find the top 5 most similar past task executions. Return structured results.",
                "criteria": {"must_include": ["embedding", "cosine", "supabase", "similarity", "SELECT"], "must_not_include": ["TODO"]}
            },
        ],
        "code_complex": [
            {
                "name": "bandit_updater_architecture",
                "difficulty": "hard",
                "prompt": "Design the architecture for a Thompson Sampling model router update system. It needs to: receive reward signals via Cloudflare Queue, batch updates per (agent, task_type, model_id) when 5 signals accumulate, update Beta distribution parameters in D1, and refresh the agent_model_routing table with the new empirical winner. Show the core TypeScript interfaces and update logic.",
                "criteria": {"must_include": ["alpha", "beta", "Queue", "D1", "interface", "UNIQUE"], "must_not_include": ["TODO"]}
            },
            {
                "name": "multi_agent_orchestration",
                "difficulty": "hard",
                "prompt": "Write the TypeScript orchestration logic for NEXUS receiving an FMEA documentation request: it should classify intent, call INTAKE for scope extraction, call ATLAS for engineering domain context, call FORGE for any template generation, and compile results into a unified response. Handle failures at each step gracefully.",
                "criteria": {"must_include": ["INTAKE", "ATLAS", "FORGE", "error", "Promise", "async"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # HERALD — Content, copy, brand voice for ME + platform verticals
    # ──────────────────────────────────────────────────────────
    "HERALD": {
        "content_write": [
            {
                "name": "linkedin_fmea_hook",
                "difficulty": "easy",
                "prompt": "Write 3 LinkedIn post hooks for a mechanical engineer who built an AI system that cuts FMEA documentation time by 60%. Each hook under 25 words. Make them specific to process industries, not generic AI content.",
                "criteria": {"must_include": ["FMEA", "engineer"], "tone": "specific, punchy, not generic", "must_not_include": ["game-changer", "revolutionize", "unlock"]}
            },
            {
                "name": "case_study_pump_manufacturer",
                "difficulty": "medium",
                "prompt": "Write the opening 2 paragraphs of a case study: Leadership Legacy Digital helped Cascade Pump & Valve (a 45-person pump manufacturer) reduce their API 610 compliance documentation time from 3 weeks to 4 days using AI agents. Connor Pattern, a mechanical engineer, led the implementation.",
                "criteria": {"must_include": ["Cascade", "API 610", "3 weeks", "4 days", "Connor"], "tone": "professional case study, specific numbers"}
            },
            {
                "name": "youtube_script_intro",
                "difficulty": "medium",
                "prompt": "Write the first 60 seconds of a YouTube script: a mechanical engineer shows how he built an AI agent that automatically generates FMEA worksheets from pump datasheets. Target audience: process engineers at refineries and chemical plants. Hook + problem statement + credibility.",
                "criteria": {"must_include": ["FMEA", "pump", "engineer", "datasheet"], "tone": "direct, credible, not salesy"}
            },
            {
                "name": "upwork_profile_bio",
                "difficulty": "medium",
                "prompt": "Write an Upwork profile bio for Connor Pattern: mechanical engineer (10+ years in rotating equipment), founder of Leadership Legacy Digital, building AI agent systems for engineering documentation, FMEA automation, and API 610 compliance. $150/hr target rate. 250 words max.",
                "criteria": {"must_include": ["mechanical engineer", "FMEA", "API 610", "AI"], "tone": "credible, specific, value-focused"}
            },
            {
                "name": "email_sequence_cold_outreach",
                "difficulty": "hard",
                "prompt": "Write a 3-email cold outreach sequence targeting Engineering Directors at mid-size pump manufacturers (50-500 employees). Pain point: FMEA documentation is slow, inconsistent, and creates compliance risk. Our solution: AI agents that cut documentation time by 60%. Emails should be 100 words each, no fluff.",
                "criteria": {"must_include": ["FMEA", "documentation", "compliance"], "tone": "direct, engineer-to-engineer, no corporate speak"}
            },
        ],
        "caption_short": [
            {
                "name": "x_post_product_launch",
                "difficulty": "easy",
                "prompt": "Write a tweet announcing: our AI agent now auto-generates FMEA worksheets from pump datasheets in 90 seconds. Built by a mechanical engineer. Max 280 chars. Include a specific stat and a clear what-it-does statement.",
                "criteria": {"must_include": ["FMEA", "90 seconds"], "max_length": 280, "must_not_include": ["game-changer"]}
            },
            {
                "name": "linkedin_build_update",
                "difficulty": "easy",
                "prompt": "Write a LinkedIn post (150 words max) showing a build update: the Thompson Sampling model router just ran its first smoke test — Haiku won for intent classification at 84% quality score, Sonnet won for code generation at 91%. Written by the founder, engineer voice.",
                "criteria": {"must_include": ["Thompson", "Haiku", "Sonnet", "quality score"], "tone": "founder build-in-public, technical but readable"}
            },
            {
                "name": "ig_reel_caption",
                "difficulty": "easy",
                "prompt": "Write an Instagram Reel caption for a 30-second screen recording showing an AI agent generating a full FMEA worksheet from a pump datasheet. 3 sentences max. Include relevant hashtags for process engineers.",
                "criteria": {"must_include": ["FMEA", "AI", "engineer", "#"], "tone": "concise, visual-first"}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # INTAKE — Client onboarding, scope extraction, proposal generation
    # ──────────────────────────────────────────────────────────
    "INTAKE": {
        "json_extract": [
            {
                "name": "fmea_project_scope",
                "difficulty": "medium",
                "prompt": "Extract structured JSON from this client inquiry: 'Hi Connor, we operate a hydrocracker unit with 28 centrifugal pumps that need FMEA documentation for our upcoming API 610 compliance audit in Q3. Our team has some RPN scores already done but the documentation is inconsistent. Budget is around $18K. We need this done in 6 weeks. Contact is Mike Torres, Reliability Engineer.'",
                "criteria": {"must_include": ["pumps", "budget", "timeline", "contact", "compliance"]}
            },
            {
                "name": "website_build_scope",
                "difficulty": "easy",
                "prompt": "Extract structured JSON from: 'We need a new website for our pump repair shop. 6 pages: home, services (pump rebuild, alignment, balancing), about us, certifications (API 610, ISO 9001), photo gallery, contact form. We want it to look professional and rank for pump repair in Houston. Budget $4,500, need it in 4 weeks.'",
                "criteria": {"must_include": ["pages", "budget", "timeline", "services", "location"]}
            },
            {
                "name": "ai_tool_integration_scope",
                "difficulty": "hard",
                "prompt": "Extract structured JSON from this Upwork job post: 'Looking for an AI developer to build an automated FMEA report generator. Input: pump datasheet PDFs (we have 40+). Output: Excel FMEA worksheets with severity/occurrence/detection scores pre-filled based on failure mode library. Should integrate with our existing SharePoint. Timeline: 8 weeks. Budget: $25,000-$40,000. Must have mechanical engineering background.'",
                "criteria": {"must_include": ["input", "output", "budget", "timeline", "requirements", "SharePoint"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # SENTINEL — QA gate: pre-check (Haiku) and final review (Opus)
    # ──────────────────────────────────────────────────────────
    "SENTINEL": {
        "qa_precheck": [
            {
                "name": "code_bug_check",
                "difficulty": "easy",
                "prompt": "Quick sanity check: does this function have obvious issues? `function calculateRPN(severity: number, occurrence: number, detection: number) { return severity * occurrence * detection; }` — used in production FMEA system for API 610 compliance reports.",
                "criteria": {"must_include": ["validation", "zero", "range", "check"], "tone": "specific technical review, not generic"}
            },
            {
                "name": "content_accuracy_check",
                "difficulty": "easy",
                "prompt": "Quick check before sending to client: 'Our AI system achieves 100% accuracy on FMEA documentation and eliminates all human error. Guaranteed compliance with API 610, ASME, and all industry standards.' — Is this safe to send to a refinery's engineering team?",
                "criteria": {"must_include": ["misleading", "accuracy", "claim", "liability"], "must_not_include": ["looks good", "seems fine"]}
            },
            {
                "name": "sql_injection_check",
                "difficulty": "medium",
                "prompt": "Quick security check on this D1 query builder: `const query = 'SELECT * FROM agents WHERE agent_name = ' + userInput;` — used in the Cockpit API to look up agent details based on user-provided name.",
                "criteria": {"must_include": ["injection", "parameterized", "unsafe", "prepared"]}
            },
        ],
        "qa_review": [
            {
                "name": "fmea_output_review",
                "difficulty": "hard",
                "prompt": "Review this AI-generated FMEA entry for a centrifugal pump mechanical seal: Failure Mode: 'Seal leakage', Effect: 'Process fluid release', Severity=8, Occurrence=4, Detection=6, RPN=192. Recommended Action: 'Monitor for leaks quarterly.' Is this acceptable for an API 682 compliant FMEA for a hydrocarbon service pump at a refinery?",
                "criteria": {"must_include": ["RPN", "API 682", "detection", "action", "frequency"], "tone": "engineering review, specific to standards"}
            },
            {
                "name": "proposal_review",
                "difficulty": "medium",
                "prompt": "Review this proposal section before sending to a pump manufacturer: 'We will use artificial intelligence to automatically complete your FMEA documentation. Our system has processed thousands of pumps and knows exactly what failure modes to assign. The AI will handle everything, no engineer review needed. Delivery in 2 weeks, guaranteed.' Flag any issues.",
                "criteria": {"must_include": ["engineer review", "liability", "overstatement", "guarantee"], "must_not_include": ["looks good"]}
            },
            {
                "name": "code_pr_review",
                "difficulty": "hard",
                "prompt": "Review this TypeScript before merging to production: `export async function routeToModel(taskType: string) { const models = await db.query('SELECT * FROM model_bandit_params'); const winner = models[0]; return callModel(winner.model_id); }` — This is the Thompson Sampling router for production agent calls.",
                "criteria": {"must_include": ["sampling", "alpha", "beta", "filter", "error handling"], "tone": "senior engineer code review"}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # ATLAS — Engineering domain: API 610/682, FMEA, calcs, specs
    # ──────────────────────────────────────────────────────────
    "ATLAS": {
        "engineering_calc": [
            {
                "name": "npsh_calculation",
                "difficulty": "hard",
                "prompt": "Calculate NPSHa for this pump installation: suction tank is at atmospheric pressure (14.7 psia), liquid level is 8 feet above pump centerline, suction line friction loss is 2.5 feet, fluid is water at 180°F (vapor pressure = 7.51 psia, density = 60.6 lb/ft³). Show formula, units, and whether this meets a pump with NPSHr = 12 feet.",
                "criteria": {"must_include": ["NPSHa", "vapor pressure", "formula", "ft", "psia"], "tone": "engineering calculation with units throughout"}
            },
            {
                "name": "api610_pressure_rating",
                "difficulty": "hard",
                "prompt": "What is the minimum casing pressure rating for a Group II centrifugal pump per API 610 12th edition operating at: suction pressure 50 psig, differential pressure 300 psig, maximum allowable working pressure calculation required. Also state the hydrostatic test pressure.",
                "criteria": {"must_include": ["MAWP", "test pressure", "API 610", "psig", "Group II"]}
            },
            {
                "name": "shaft_critical_speed",
                "difficulty": "hard",
                "prompt": "Estimate the first critical speed for a pump shaft: L=30 inches between bearings, shaft diameter=1.75 inches solid steel (E=30×10^6 psi, density=0.283 lb/in³), impeller weight=15 lbs at midspan. Use Rayleigh's method. State whether this is above or below the operating speed of 3560 RPM.",
                "criteria": {"must_include": ["critical speed", "RPM", "Rayleigh", "formula", "3560"]}
            },
        ],
        "long_doc_ingest": [
            {
                "name": "api610_summary",
                "difficulty": "medium",
                "prompt": "Summarize the key requirements for centrifugal pump nozzle loads per API 610 12th edition. Focus on: allowable nozzle forces and moments, pipe strain requirements, and the consequence of exceeding limits. Format for an engineer who needs to check vendor compliance.",
                "criteria": {"must_include": ["nozzle", "forces", "moments", "allowable", "API 610"]}
            },
            {
                "name": "fmea_methodology_summary",
                "difficulty": "medium",
                "prompt": "Summarize the FMEA methodology for rotating equipment per IEC 60812 and API RP 581. What are the key steps, how is RPN calculated and interpreted, what are typical failure modes for centrifugal pumps, and what are the limitations of RPN-based prioritization?",
                "criteria": {"must_include": ["RPN", "severity", "occurrence", "detection", "failure mode", "centrifugal pump"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # SCOUT — Lead intelligence, outreach, prospecting
    # ──────────────────────────────────────────────────────────
    "SCOUT": {
        "outreach_personalize": [
            {
                "name": "refinery_engineering_director",
                "difficulty": "medium",
                "prompt": "Write a 3-sentence cold email to Sarah Chen, Reliability Engineering Director at Gulf Coast Petrochemical (a 2,000-employee refinery in Texas City, TX). Their LinkedIn shows they recently posted about FMEA compliance challenges. We offer AI-powered FMEA documentation that cuts time by 60%. Engineer-to-engineer tone from Connor Pattern, ME.",
                "criteria": {"must_include": ["FMEA", "60%", "reliability", "engineer"], "tone": "direct, peer-to-peer, no corporate pitch language", "must_not_include": ["I hope this email finds you", "synergy", "leverage"]}
            },
            {
                "name": "pump_manufacturer_outreach",
                "difficulty": "medium",
                "prompt": "Write a cold LinkedIn connection message (300 char max) to the VP of Engineering at a mid-size pump OEM. Their company makes API 610 pumps for the oil and gas market. We build AI tools for engineering documentation. Connor is a mechanical engineer. Make it specific to their world, not generic AI pitch.",
                "criteria": {"must_include": ["API 610", "engineer"], "max_length": 300, "must_not_include": ["game-changer", "AI is the future"]}
            },
            {
                "name": "upwork_proposal",
                "difficulty": "hard",
                "prompt": "Write an Upwork proposal for this job post: 'Need AI developer to automate FMEA documentation for our pump fleet. 35 pumps, API 610 service, need RPN scoring and action tracking. Budget $15K-$25K.' Write as Connor Pattern, mechanical engineer and AI developer. 200 words max. Lead with engineering credibility, then technical approach.",
                "criteria": {"must_include": ["mechanical engineer", "FMEA", "RPN", "API 610", "approach"], "tone": "credible, specific, not template-sounding"}
            },
        ],
        "social_intel": [
            {
                "name": "fmea_pain_point_research",
                "difficulty": "medium",
                "prompt": "What are the top 5 pain points reliability engineers are discussing about FMEA documentation in process industries as of 2024-2025? Focus on what makes it slow, inconsistent, or non-compliant. Cite specific industries (refining, petrochemical, power gen). Format as insights we can use for content and outreach.",
                "criteria": {"must_include": ["documentation", "inconsistent", "compliance", "reliability engineer"]}
            },
            {
                "name": "competitor_landscape",
                "difficulty": "medium",
                "prompt": "What tools and vendors are currently serving the FMEA documentation automation market for process industries? Include: legacy CMMS systems, newer AI-powered tools, and any engineering consulting firms offering this as a service. What gaps exist that a mechanical engineer building AI agents could fill?",
                "criteria": {"must_include": ["CMMS", "gap", "market", "competitor"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # ORACLE — Market intelligence, research synthesis, GENESIS scoring
    # ──────────────────────────────────────────────────────────
    "ORACLE": {
        "research_summarize": [
            {
                "name": "ai_engineering_adoption",
                "difficulty": "medium",
                "prompt": "Synthesize the current state of AI adoption in mechanical engineering and predictive maintenance as of 2025. Cover: which companies are leading, what specific use cases are proven, what the typical ROI looks like, and where resistance still exists. Format as an executive briefing for a founder deciding which vertical to enter.",
                "criteria": {"must_include": ["predictive maintenance", "ROI", "adoption", "resistance"]}
            },
            {
                "name": "cloudflare_workers_capabilities",
                "difficulty": "medium",
                "prompt": "Summarize Cloudflare Workers AI capabilities as of 2025 relevant to building an AI agent platform. Cover: available models, pricing structure, D1 database limits, Queue capabilities, and how it compares to AWS Lambda + RDS for a bootstrapped founder. Be specific about limits that matter at small scale (<$100/mo).",
                "criteria": {"must_include": ["D1", "Workers AI", "Queue", "pricing", "limits"]}
            },
        ],
        "genesis_score_gap": [
            {
                "name": "fmea_saas_opportunity",
                "difficulty": "hard",
                "prompt": "Score this market opportunity on a 1-10 scale for each dimension, with reasoning: AI-powered FMEA documentation SaaS for process industries. Dimensions: (1) Market size, (2) Competition density, (3) Willingness to pay, (4) Founder ME moat advantage, (5) Time to first revenue, (6) Scalability. Recommend: launch now, wait, or skip.",
                "criteria": {"must_include": ["market size", "competition", "willingness", "moat", "revenue", "scale"]}
            },
            {
                "name": "api610_navigator_opportunity",
                "difficulty": "hard",
                "prompt": "Score this opportunity: an AI-powered API 610 standards navigator that lets engineers query the standard in plain English, get compliant answers with citations, and generate compliance checklists. Scored on: market size, competition, willingness to pay, founder ME moat, time to revenue, scalability. Should Connor build this as product 2?",
                "criteria": {"must_include": ["API 610", "market", "competition", "moat", "revenue"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # ANCHOR — Revenue analytics, cost tracking, platform performance
    # ──────────────────────────────────────────────────────────
    "ANCHOR": {
        "research_summarize": [
            {
                "name": "llm_cost_optimization",
                "difficulty": "medium",
                "prompt": "Analyze the optimal LLM cost structure for an AI agent platform at $10K MRR stage. We use Haiku for classification, Sonnet for primary tasks, Opus for quality gates. Average task generates 500 input + 800 output tokens. We run ~500 tasks/day. What % of revenue goes to LLM costs, what's the optimization path, and at what scale does it become problematic?",
                "criteria": {"must_include": ["cost", "tokens", "percentage", "optimization", "Haiku", "Sonnet"]}
            },
            {
                "name": "revenue_milestone_analysis",
                "difficulty": "medium",
                "prompt": "Build a path from $8K MRR to $25K MRR for an AI engineering documentation platform. What combination of: retainer clients, project work, and SaaS licenses gets us there? What are the key milestones, required hires (if any), and biggest risks? Timeframe: 6 months.",
                "criteria": {"must_include": ["MRR", "retainer", "milestone", "risk", "6 months"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # BUILDER — Cockpit UI, self-heal loop, frontend development
    # ──────────────────────────────────────────────────────────
    "BUILDER": {
        "vision_check": [
            {
                "name": "ui_layout_assessment",
                "difficulty": "medium",
                "prompt": "Describe what a well-designed routing intelligence dashboard should look like for the Cockpit. It needs to show: which model is winning per agent/task_type, convergence status, win rates as visual bars, cost per model, and a 'run smoke test' button. What layout, color coding, and data hierarchy would make this most usable for a founder checking it daily?",
                "criteria": {"must_include": ["layout", "color", "hierarchy", "win rate", "convergence"]}
            },
        ],
        "code_generate": [
            {
                "name": "cockpit_routing_panel",
                "difficulty": "hard",
                "prompt": "Write a React TypeScript component for the Routing Intelligence panel in the Cockpit. It should: fetch data from /api/routing/standings, display a table with agent/task_type rows, show winning model with a colored badge (green=converged, yellow=provisional), show win rate as a progress bar, show n_trials, and have a refresh button. Use Tailwind classes only.",
                "criteria": {"must_include": ["useState", "useEffect", "fetch", "TypeScript", "badge", "progress"], "must_not_include": ["TODO"]}
            },
            {
                "name": "self_heal_screenshot_check",
                "difficulty": "hard",
                "prompt": "Write a Cloudflare Worker that: takes a screenshot URL, calls CF Workers AI vision model to check if the Cockpit UI rendered correctly (no error pages, no broken layouts), returns a structured assessment with pass/fail and specific issues found. Include the Workers AI vision call with proper typing.",
                "criteria": {"must_include": ["Workers AI", "vision", "screenshot", "assessment", "TypeScript"]}
            },
        ],
    },

    # ──────────────────────────────────────────────────────────
    # META_COGNITION — Self-improvement: prompt rewrites, quality analysis
    # ──────────────────────────────────────────────────────────
    "META_COGNITION": [
        # Note: meta_cognition tests prompt_engineering task_type
        # Added inline as study_node since it's its own category
    ] if False else {},
}

# Add META_COGNITION separately since it has a different structure
TEST_CASES["META_COGNITION"] = {
    "qa_review": [
        {
            "name": "prompt_quality_analysis",
            "difficulty": "hard",
            "prompt": """Analyze this agent system prompt for quality issues and rewrite it to score higher:

CURRENT PROMPT: 'You are HERALD, the content agent. Write good content for Connor's business. Make LinkedIn posts, emails, and other content. Be professional and helpful. Write about engineering and AI topics. Help Connor grow his business.'

Context: HERALD serves a mechanical engineer building AI tools for the process industries. Quality score has been 0.62 over last 20 tasks. Rewrite the system prompt to be specific, action-oriented, and likely to score 0.85+.""",
            "criteria": {"must_include": ["mechanical engineer", "FMEA", "API 610", "specific", "output schema"], "must_not_include": ["be helpful", "be professional"]}
        },
        {
            "name": "routing_decision_audit",
            "difficulty": "hard",
            "prompt": "Audit this model routing decision: FORGE/code_generate has been routing to claude-sonnet-4-6 for 3 weeks (win_rate=0.84, n_trials=47). A new smoke test shows moonshotai/kimi-k2.6 scoring 0.89 on the same test cases with 40% lower cost. Should we switch the routing table? What criteria should govern the decision? What risks exist in switching mid-sprint?",
            "criteria": {"must_include": ["win_rate", "cost", "risk", "criteria", "n_trials"], "tone": "analytical, specific to Thompson Sampling context"}
        },
    ],
}


# ─────────────────────────────────────────────────────────────
# MULTI-PROVIDER API CALLER
# ─────────────────────────────────────────────────────────────
def call_model(model_id: str, provider: str, prompt: str, cfg: Config, timeout: int = 90) -> Dict[str, Any]:
    """Call any model regardless of provider. Returns {output, input_tokens, output_tokens, cost_usd, latency_ms, error}"""
    start = time.monotonic()

    try:
        if provider == "anthropic":
            claude = AnthropicClient(cfg)
            data = claude.complete(model=model_id, prompt=prompt, max_tokens=2048)
            claude.close()
            output = data["content"][0]["text"]
            usage = data.get("usage", {})
            in_tok = usage.get("input_tokens", 0)
            out_tok = usage.get("output_tokens", 0)
            cost = claude.estimate_cost(model_id, in_tok, out_tok)

        elif provider in ("openrouter", "openai"):
            base = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
            api_key = os.getenv("OPENROUTER_API_KEY") if provider == "openrouter" else os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                return {"output": None, "error": f"Missing API key for {provider} — add to .env", "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}
            resp = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "HTTP-Referer": "https://ll-cockpit.connorpattern.workers.dev"},
                json={"model": model_id, "messages": [{"role": "user", "content": prompt}], "max_tokens": 2048},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            output = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            in_tok = usage.get("prompt_tokens", 0)
            out_tok = usage.get("completion_tokens", 0)
            cost = 0.0

        elif provider == "cloudflare_workers_ai":
            # Map our internal cf- prefix IDs to actual CF model strings
            cf_model_map = {
                "cf-kimi-k2.6":     "@cf/moonshotai/kimi-k2.6",
                "cf-gemma-4-26b":   "@cf/google/gemma-4-26b-a4b-it",
                "cf-gpt-oss-120b":  "@cf/openai/gpt-oss-120b",
                "cf-gpt-oss-20b":   "@cf/openai/gpt-oss-20b",
                "cf-glm-4-7-flash": "@cf/zai-org/glm-4.7-flash",
                "cf-llama-4-scout": "@cf/meta/llama-4-scout-17b-16e-instruct",
                "cf-llama-3-3-70b": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
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
            in_tok = data.get("prompt_eval_count", 0)
            out_tok = data.get("eval_count", 0)
            cost = 0.0
        else:
            return {"output": None, "error": f"Unknown provider: {provider}", "latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}

        latency = int((time.monotonic() - start) * 1000)
        return {"output": output, "error": None, "latency_ms": latency, "input_tokens": in_tok, "output_tokens": out_tok, "cost_usd": cost}

    except Exception as e:
        return {"output": None, "error": str(e), "latency_ms": int((time.monotonic() - start) * 1000), "input_tokens": 0, "output_tokens": 0, "cost_usd": 0}


def score_with_opus(task_prompt: str, output: str, criteria: Dict, cfg: Config) -> Dict:
    """Always Opus. Always consistent. Never replaced."""
    prompt = f"Task:\n{task_prompt}\n\nResponse:\n{output[:4000]}\n\nCriteria:\n{json.dumps(criteria)}\n\nScore strictly. Output only JSON."
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
        log.warning(f"Opus scoring failed: {e}")
        return {"score_accuracy": 0.5, "score_completeness": 0.5, "score_tone": 0.5,
                "score_criteria_met": 0.5, "composite_score": 0.5,
                "verdict": "conditional", "notes": f"Scoring error: {e}", "scoring_latency_ms": 0}


def refresh_routing_table(d1: D1Client, agent: str, task_type: str, run_id: str) -> Optional[str]:
    """Compute empirical winner for (agent, task_type) and upsert into agent_model_routing."""
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
    total_alpha = sum(float(r["alpha"]) for r in rows)
    conv_pct = round((float(winner["alpha"]) / total_alpha) * 100, 1) if total_alpha > 0 else 0.0
    status = "converged" if conv_pct >= 60 and winner["n_trials"] >= 5 else "provisional"
    now_ts = int(datetime.now(timezone.utc).timestamp() * 1000)

    d1.execute("""
      INSERT INTO agent_model_routing
        (id, agent, task_type, winning_model, win_rate, n_trials, convergence_pct,
         runner_up_model, runner_up_rate, derived_from_run_id, last_test_date, status, promoted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(agent, task_type) DO UPDATE SET
        winning_model=excluded.winning_model, win_rate=excluded.win_rate,
        n_trials=excluded.n_trials, convergence_pct=excluded.convergence_pct,
        runner_up_model=excluded.runner_up_model, runner_up_rate=excluded.runner_up_rate,
        derived_from_run_id=excluded.derived_from_run_id, last_test_date=excluded.last_test_date,
        status=excluded.status, promoted_at=excluded.promoted_at
    """, [
        str(uuid.uuid4()), agent, task_type,
        winner["model_id"], round(float(winner.get("win_rate") or 0), 3),
        winner["n_trials"], conv_pct,
        runner_up["model_id"] if runner_up else None,
        round(float(runner_up.get("win_rate") or 0), 3) if runner_up else None,
        run_id, datetime.now(timezone.utc).date().isoformat(), status, now_ts,
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
        backup_d1(d1, r2, ["model_bandit_params", "agent_model_routing", "smoke_test_results"], f"pre_smoke_{run_id[:8]}")

        # Load all active models from D1 — nothing hardcoded
        model_filter_sql = "WHERE active=1"
        model_filter_params = []
        if provider_filter:
            model_filter_sql += " AND provider=?"
            model_filter_params.append(provider_filter)
        models = d1.query_rows(f"SELECT model_id, provider, display_name, cost_input_per_1m, cost_output_per_1m FROM model_registry {model_filter_sql}", model_filter_params)
        log.info(f"Loaded {len(models)} models from registry (provider: {provider_filter or 'all'})")

        total_cases = sum(
            len(cases)
            for ag, tasks in TEST_CASES.items() if (not agent_filter or ag == agent_filter)
            for tt, cases in tasks.items() if (not task_type_filter or tt == task_type_filter)
        ) * len(models)

        d1.execute(
            "INSERT OR IGNORE INTO smoke_test_runs (id, suite_id, trigger, triggered_by, status, models_under_test, n_cases_planned, started_at) VALUES (?,?,?,?,?,?,?,?)",
            [run_id, "universal", "manual", "connor", "running", ",".join(m["model_id"] for m in models), total_cases, now_ts]
        )

        all_results = []

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
                    model_results_batch = []

                    for case in cases:
                        if cfg.dry_run:
                            log.info(f"    [DRY] {case['name']} — skipped")
                            continue

                        response = call_model(model_id, provider, case["prompt"], cfg)

                        if response["error"]:
                            log.warning(f"    x {case['name']}: {response['error'][:100]}")
                            result = {
                                "run_id": run_id, "agent": agent, "task_type": task_type,
                                "model_id": model_id, "provider": provider,
                                "case_name": case["name"], "difficulty": case.get("difficulty"),
                                "error": response["error"], "composite_score": 0.0,
                                "verdict": "fail", "bandit_reward": 0.0,
                                "latency_ms": response["latency_ms"], "cost_usd": 0.0,
                            }
                        else:
                            scores = score_with_opus(case["prompt"], response["output"], case.get("criteria", {}), cfg)
                            in_rate = float(model.get("cost_input_per_1m") or 0)
                            out_rate = float(model.get("cost_output_per_1m") or 0)
                            cost = response["cost_usd"] or ((response["input_tokens"] * in_rate + response["output_tokens"] * out_rate) / 1_000_000)
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
                            model_results_batch.append(result)
                            summary["total_cost_usd"] += cost
                            log.info(f"    + {case['name']:40} score={scores['composite_score']:.3f} [{scores['verdict']}] {response['latency_ms']}ms")

                        all_results.append(result)

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
                            result.get("output_text", "")[:8000],
                            result.get("latency_ms"), result.get("input_tokens"),
                            result.get("output_tokens"), result.get("cost_usd"),
                            result.get("score_accuracy"), result.get("score_completeness"),
                            result.get("score_tone"), result.get("score_criteria_met"),
                            result.get("composite_score"), result.get("verdict"),
                            result.get("notes"), result.get("bandit_reward"), now_ts,
                        ])

                    # Update bandit params after all cases for this model
                    if model_scores and not cfg.dry_run:
                        avg_score = sum(model_scores) / len(model_scores)
                        reward = 1.0 if avg_score >= 0.75 else 0.0
                        valid_lat = [r.get("latency_ms", 0) for r in model_results_batch if r.get("latency_ms")]
                        valid_cost = [r.get("cost_usd", 0) for r in model_results_batch if r.get("cost_usd")]
                        avg_lat = sum(valid_lat) / len(valid_lat) if valid_lat else 0
                        avg_cost = sum(valid_cost) / len(valid_cost) if valid_cost else 0

                        d1.execute("""
                          INSERT INTO model_bandit_params
                            (id, agent, task_type, model_id, alpha, beta, n_trials,
                             n_successes, n_failures, avg_latency_ms, avg_cost_usd,
                             avg_quality, last_reward, last_updated)
                          VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?)
                          ON CONFLICT(agent, task_type, model_id) DO UPDATE SET
                            alpha=alpha+(excluded.alpha-1),
                            beta=beta+(excluded.beta-1),
                            n_trials=n_trials+1,
                            n_successes=n_successes+excluded.n_successes,
                            n_failures=n_failures+excluded.n_failures,
                            avg_latency_ms=(avg_latency_ms*n_trials+excluded.avg_latency_ms)/(n_trials+1),
                            avg_cost_usd=(avg_cost_usd*n_trials+excluded.avg_cost_usd)/(n_trials+1),
                            avg_quality=(avg_quality*n_trials+excluded.avg_quality)/(n_trials+1),
                            last_reward=excluded.last_reward,
                            last_updated=excluded.last_updated
                        """, [
                            str(uuid.uuid4()), agent, task_type, model_id,
                            1.0 + reward, 1.0 + (1.0 - reward),
                            int(reward), 1 - int(reward),
                            round(avg_lat, 1), round(avg_cost, 8),
                            round(avg_score, 4), reward,
                            int(datetime.now(timezone.utc).timestamp() * 1000),
                        ])

                # Refresh routing table after all models run for this (agent, task_type)
                if not cfg.dry_run:
                    winner = refresh_routing_table(d1, agent, task_type, run_id)
                    if winner:
                        summary["routing_updates"].append({"agent": agent, "task_type": task_type, "winner": winner})

        # Close run record
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

        # Save full run to R2 — immutable permanent record
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/summary.json", {
            "run_id": run_id, "filters": summary["filters"],
            "total_cost_usd": summary["total_cost_usd"],
            "routing_updates": summary["routing_updates"],
            "total_results": len(all_results),
        })
        r2.upload_json(f"smoke_tests/{date_str}/{run_id}/full_results.json", {
            "run_id": run_id, "results": all_results,
        })
        log.info(f"\nR2 backup: smoke_tests/{date_str}/{run_id}/")

    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    summary["total_results"] = len(all_results)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Universal model smoke test runner")
    parser.add_argument("--provider",  help="anthropic | openrouter | openai | cloudflare_workers_ai | ollama")
    parser.add_argument("--agent",     help="NEXUS | FORGE | HERALD | INTAKE | SENTINEL | ATLAS | SCOUT | ORACLE | ANCHOR | BUILDER | META_COGNITION")
    parser.add_argument("--task-type", help="code_generate | content_write | intent_classify | qa_review | etc")
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
            print(f"    {u['agent']:20} {u['task_type']:25} -> {u['winner']}")
    if result["errors"]:
        print(f"\n  Errors: {result['errors']}")
