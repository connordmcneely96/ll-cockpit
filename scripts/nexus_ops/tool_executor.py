#!/usr/bin/env python3
"""
nexus_ops/tool_executor.py
Enables Anthropic models (Haiku/Sonnet/Opus) to use bash and Python tools
inside the NEXUS architecture.

ARCHITECTURE:
  Claude API (tool_use) -> CF Worker -> VPS tunnel -> FastAPI executor -> subprocess
  All executions logged to artifact_registry + cost_ledger.

ANTHROPIC MODEL ASSIGNMENTS:
  Haiku  -> pre-checks, validates inputs, lightweight tasks
  Sonnet -> primary tool-use agent (code execution, data analysis)
  Opus   -> approves tool calls before execution when gate_required=True

Usage:
  python -m nexus_ops.tool_executor --test bash --cmd "echo hello"
  python -m nexus_ops.tool_executor --test python --code "print(1+1)"
  python -m nexus_ops.tool_executor --dump-server   # print VPS FastAPI service code
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from nexus_ops.config import Config, D1Client, R2Client, AnthropicClient, get_logger

log = get_logger("tool_executor")

# ─────────────────────────────────────────────────────────────
# TOOL DEFINITIONS FOR CLAUDE API
# Pass in the `tools` parameter of Anthropic API calls.
# ─────────────────────────────────────────────────────────────
BASH_TOOL = {
    "name": "bash_execute",
    "description": "Execute a bash command on the NEXUS VPS (Hetzner Ubuntu 24). Commands run as nexus-agent user (no sudo). Timeout 60s. Output capped at 8000 chars.",
    "input_schema": {
        "type": "object",
        "properties": {
            "command":     {"type": "string", "description": "The bash command to execute"},
            "working_dir": {"type": "string", "description": "Working directory", "default": "/home/nexus-agent"},
            "timeout":     {"type": "integer", "description": "Timeout in seconds (max 60)", "default": 30},
            "reason":      {"type": "string", "description": "Why you're running this command (audit log)"},
        },
        "required": ["command", "reason"],
    },
}

PYTHON_TOOL = {
    "name": "python_execute",
    "description": "Execute a Python 3.12 script on the NEXUS VPS. Available: httpx, anthropic, supabase, pandas, numpy, scipy. Timeout 120s.",
    "input_schema": {
        "type": "object",
        "properties": {
            "code":    {"type": "string", "description": "Python code to execute"},
            "timeout": {"type": "integer", "description": "Timeout in seconds (max 120)", "default": 60},
            "reason":  {"type": "string", "description": "Why you're running this code (audit log)"},
            "dry_run": {"type": "boolean", "description": "Validate syntax only", "default": False},
        },
        "required": ["code", "reason"],
    },
}

READ_FILE_TOOL = {
    "name": "read_file",
    "description": "Read a file from VPS filesystem or R2. Path formats: /absolute/path or r2://bucket/key",
    "input_schema": {
        "type": "object",
        "properties": {
            "path":      {"type": "string", "description": "File path or r2://bucket/key"},
            "max_chars": {"type": "integer", "description": "Max chars to return", "default": 8000},
        },
        "required": ["path"],
    },
}

WRITE_FILE_TOOL = {
    "name": "write_file",
    "description": "Write content to VPS or R2. Always registers in artifact_registry. Requires execution_id for accountability.",
    "input_schema": {
        "type": "object",
        "properties": {
            "path":          {"type": "string", "description": "File path or r2://bucket/key"},
            "content":       {"type": "string", "description": "File content to write"},
            "artifact_type": {"type": "string", "description": "code|config|migration|report|data"},
            "execution_id":  {"type": "string", "description": "Parent task_executions.id"},
        },
        "required": ["path", "content", "artifact_type", "execution_id"],
    },
}

# Tool sets per agent — scope by role, not by trust
TOOL_SETS = {
    "FORGE":          [BASH_TOOL, PYTHON_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL],
    "BUILDER":        [BASH_TOOL, PYTHON_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL],
    "ATLAS":          [PYTHON_TOOL, READ_FILE_TOOL],
    "SENTINEL":       [PYTHON_TOOL, READ_FILE_TOOL],
    "META_COGNITION": [PYTHON_TOOL, READ_FILE_TOOL, WRITE_FILE_TOOL],
    "ANCHOR":         [PYTHON_TOOL, READ_FILE_TOOL],
    "ORACLE":         [BASH_TOOL, PYTHON_TOOL, READ_FILE_TOOL],
    "default":        [READ_FILE_TOOL],
}

# VPS FastAPI service — print with --dump-server flag
VPS_FASTAPI_SERVER = '''#!/usr/bin/env python3
"""
VPS executor service. Deploy to Hetzner VPS.
File: /home/nexus-agent/executor/server.py
Start: pm2 start "uvicorn server:app --host 0.0.0.0 --port 8765" --name nexus-executor

Add to cloudflared config.yml:
  - hostname: executor.yourdomain.com
    service: http://localhost:8765

Protect via Cloudflare Access: email policy (Connor only)
"""
import os, subprocess, tempfile, time
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

app = FastAPI()
SECRET = os.environ["EXECUTOR_SECRET"]

def verify(x_secret: str = Header(...)):
    if x_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

class BashRequest(BaseModel):
    command: str; working_dir: str = "/home/nexus-agent"; timeout: int = 30; reason: str

class PythonRequest(BaseModel):
    code: str; timeout: int = 60; reason: str; dry_run: bool = False

class EmbedRequest(BaseModel):
    text: str

@app.post("/execute/bash")
def execute_bash(req: BashRequest, x_secret: str = Header(...)):
    verify(x_secret)
    req.timeout = min(req.timeout, 60)
    start = time.monotonic()
    try:
        result = subprocess.run(req.command, shell=True, capture_output=True, text=True,
                                timeout=req.timeout, cwd=req.working_dir, user="nexus-agent")
        return {"stdout": result.stdout[-8000:], "stderr": result.stderr[-2000:],
                "exit_code": result.returncode, "latency_ms": int((time.monotonic()-start)*1000)}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "TIMEOUT", "exit_code": 124, "latency_ms": req.timeout*1000}

@app.post("/execute/python")
def execute_python(req: PythonRequest, x_secret: str = Header(...)):
    verify(x_secret)
    req.timeout = min(req.timeout, 120)
    if req.dry_run:
        try:
            compile(req.code, "<string>", "exec")
            return {"stdout": "Syntax OK", "stderr": "", "exit_code": 0, "dry_run": True}
        except SyntaxError as e:
            return {"stdout": "", "stderr": str(e), "exit_code": 1, "dry_run": True}
    start = time.monotonic()
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(req.code); fname = f.name
    try:
        result = subprocess.run(["python3", fname], capture_output=True, text=True,
                                timeout=req.timeout, user="nexus-agent",
                                env={**os.environ, "DRY_RUN": "false"})
        return {"stdout": result.stdout[-8000:], "stderr": result.stderr[-2000:],
                "exit_code": result.returncode, "latency_ms": int((time.monotonic()-start)*1000)}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "TIMEOUT", "exit_code": 124}
    finally:
        os.unlink(fname)

@app.post("/embed")
def embed_text(req: EmbedRequest, x_secret: str = Header(...)):
    verify(x_secret)
    import httpx as _httpx
    resp = _httpx.post(
        f"https://api.cloudflare.com/client/v4/accounts/{os.environ[\'CF_ACCOUNT_ID\']}/ai/run/@cf/baai/bge-large-en-v1.5",
        headers={"Authorization": f"Bearer {os.environ[\'CF_API_TOKEN\']}"},
        json={"text": [req.text[:2000]]},
    )
    return {"embedding": resp.json()["result"]["data"][0]}

@app.get("/health")
def health():
    return {"status": "ok", "service": "nexus-executor"}
'''


# ─────────────────────────────────────────────────────────────
# TOOL CALL DISPATCHER (Python-side)
# In production: CF Worker dispatches via VPS tunnel.
# This class is for Python script testing and the daily_rollup.
# ─────────────────────────────────────────────────────────────
class ToolExecutor:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._client = httpx.Client(headers={"x-secret": cfg.vps_secret}, timeout=150.0)

    def bash(self, command: str, reason: str, working_dir: str = "/home/nexus-agent", timeout: int = 30) -> Dict:
        resp = self._client.post(f"{self.cfg.vps_tunnel_url}/execute/bash",
                                 json={"command": command, "working_dir": working_dir, "timeout": timeout, "reason": reason})
        resp.raise_for_status()
        return resp.json()

    def python(self, code: str, reason: str, timeout: int = 60, dry_run: bool = False) -> Dict:
        resp = self._client.post(f"{self.cfg.vps_tunnel_url}/execute/python",
                                 json={"code": code, "timeout": timeout, "reason": reason, "dry_run": dry_run})
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self._client.close()


# ─────────────────────────────────────────────────────────────
# AGENTIC LOOP WITH TOOL USE
# Pattern used by every NEXUS agent when given tools.
# ─────────────────────────────────────────────────────────────
def run_agent_with_tools(
    agent_name: str,
    task_prompt: str,
    model: str = "claude-sonnet-4-6",
    gate_model: str = "claude-opus-4-7",
    gate_required: bool = False,
    max_iterations: int = 8,
    execution_id: Optional[str] = None,
) -> Dict:
    """
    Run a Claude agent with tool use enabled.
    Flow: [Opus gate?] -> Sonnet agentic loop -> VPS tool dispatch -> results logged
    """
    cfg = Config()
    executor = ToolExecutor(cfg)
    claude   = AnthropicClient(cfg)
    exec_id  = execution_id or str(uuid.uuid4())
    tools    = TOOL_SETS.get(agent_name, TOOL_SETS["default"])

    result = {"execution_id": exec_id, "agent": agent_name, "model": model,
              "tool_calls": [], "final_response": "", "total_cost": 0.0,
              "iterations": 0, "gate_approved": None}

    # Optional Opus gate
    if gate_required:
        log.info(f"  Opus gate reviewing for {agent_name}...")
        gate_resp = claude.complete_text(
            model=gate_model,
            prompt=f"Review this task for the {agent_name} agent. Reply APPROVED or REJECTED + one sentence.\n\n{task_prompt}",
            system="You are the NEXUS quality gate. Reject unsafe, ambiguous, or out-of-scope requests.",
            max_tokens=256,
        )
        approved = "APPROVED" in gate_resp.upper()
        result["gate_approved"] = approved
        if not approved:
            result["final_response"] = f"Gate rejected: {gate_resp}"
            log.warning(f"  Opus gate REJECTED: {gate_resp}")
            return result
        log.info(f"  Opus gate APPROVED")

    # Agentic tool-use loop
    import anthropic as _ant
    client = _ant.Anthropic(api_key=cfg.anthropic_key)
    messages = [{"role": "user", "content": task_prompt}]

    for iteration in range(max_iterations):
        result["iterations"] = iteration + 1
        response = client.messages.create(model=model, max_tokens=4096, tools=tools, messages=messages)

        cost = claude.estimate_cost(model, response.usage.input_tokens, response.usage.output_tokens)
        result["total_cost"] += cost

        if response.stop_reason == "end_turn":
            result["final_response"] = response.content[0].text if response.content else ""
            break

        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            result["final_response"] = response.content[0].text if response.content else ""
            break

        messages.append({"role": "assistant", "content": response.content})
        tool_results = []

        for tc in tool_use_blocks:
            ti = tc.input
            log.info(f"    [{iteration+1}] {tc.name}: {ti.get('reason','')}")
            try:
                if tc.name == "bash_execute" and not cfg.dry_run:
                    res = executor.bash(ti["command"], ti["reason"], ti.get("working_dir","/home/nexus-agent"), ti.get("timeout",30))
                    content = json.dumps(res)
                elif tc.name == "python_execute" and not cfg.dry_run:
                    res = executor.python(ti["code"], ti["reason"], ti.get("timeout",60), ti.get("dry_run",False))
                    content = json.dumps(res)
                elif cfg.dry_run:
                    content = json.dumps({"stdout": "[DRY RUN]", "exit_code": 0})
                else:
                    content = json.dumps({"error": f"Unknown tool: {tc.name}"})
                result["tool_calls"].append({"tool": tc.name, "input": ti, "output": content[:500], "iteration": iteration+1})
            except Exception as e:
                content = json.dumps({"error": str(e)})
                log.error(f"    Tool {tc.name} failed: {e}")
            tool_results.append({"type": "tool_result", "tool_use_id": tc.id, "content": content})

        messages.append({"role": "user", "content": tool_results})

    executor.close()
    claude.close()
    log.info(f"  Done: {result['iterations']} iterations, ${result['total_cost']:.6f}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NEXUS tool executor")
    parser.add_argument("--test",  choices=["bash","python","agent"])
    parser.add_argument("--cmd",   help="Bash command to test")
    parser.add_argument("--code",  help="Python code to test")
    parser.add_argument("--agent", default="FORGE")
    parser.add_argument("--prompt", help="Task prompt for agent test")
    parser.add_argument("--dump-server", action="store_true", help="Print the VPS FastAPI server code")
    args = parser.parse_args()

    if args.dump_server:
        print(VPS_FASTAPI_SERVER)
        sys.exit(0)

    cfg = Config()
    executor = ToolExecutor(cfg)

    if args.test == "bash":
        result = executor.bash(args.cmd or "echo 'hello from NEXUS VPS'", reason="CLI test")
        print(json.dumps(result, indent=2))
    elif args.test == "python":
        result = executor.python(args.code or "import sys; print(f'Python {sys.version}')", reason="CLI test")
        print(json.dumps(result, indent=2))
    elif args.test == "agent":
        result = run_agent_with_tools(agent_name=args.agent, task_prompt=args.prompt or "List files in current directory.", model="claude-sonnet-4-6")
        print(json.dumps({k: v for k,v in result.items() if k != "tool_calls"}, indent=2))
        print(f"\nTool calls ({len(result['tool_calls'])}):")
        for tc in result["tool_calls"]:
            print(f"  [{tc['iteration']}] {tc['tool']}: {tc['input'].get('reason','')}")

    executor.close()
