"""
nexus_ops/config.py
Shared config, path resolution, and backup utilities.
All NEXUS scripts import from here. Nothing executes on import.

Usage:
    from nexus_ops.config import Config, D1Client, backup_d1, log

Environment variables required (set in .env or shell):
    CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID,
    CF_R2_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY, VPS_TUNNEL_URL, VPS_TUNNEL_SECRET
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────
# PATH RESOLUTION
# ─────────────────────────────────────────────────────────────
SCRIPTS_DIR  = Path(__file__).parent.parent.resolve()
PROJECT_ROOT = SCRIPTS_DIR.parent.resolve()
LOGS_DIR     = SCRIPTS_DIR / "logs"
BACKUP_DIR   = SCRIPTS_DIR / "backups" / "local"

LOGS_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Load .env — checks scripts/ first, then project root, then CWD
for _env_path in [SCRIPTS_DIR / ".env", PROJECT_ROOT / ".env", Path(".env")]:
    if _env_path.exists():
        load_dotenv(_env_path, override=False)
        break


# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────
def get_logger(name: str) -> logging.Logger:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = LOGS_DIR / today / f"{name}.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    return logger


log = get_logger("nexus_ops")


# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
class Config:
    def __init__(self) -> None:
        self.cf_account_id  = self._req("CF_ACCOUNT_ID")
        self.cf_api_token   = self._req("CF_API_TOKEN")
        self.cf_d1_db_id    = self._req("CF_D1_DATABASE_ID")
        self.cf_r2_bucket   = self._req("CF_R2_BUCKET")
        self.supabase_url   = self._req("SUPABASE_URL")
        self.supabase_key   = self._req("SUPABASE_SERVICE_ROLE_KEY")
        self.anthropic_key  = self._req("ANTHROPIC_API_KEY")
        self.vps_tunnel_url = os.getenv("VPS_TUNNEL_URL", "")
        self.vps_secret     = os.getenv("VPS_TUNNEL_SECRET", "")
        self.dry_run        = os.getenv("DRY_RUN", "false").lower() == "true"

    @staticmethod
    def _req(key: str) -> str:
        val = os.getenv(key)
        if not val:
            raise EnvironmentError(f"Required env var {key!r} is not set. Check .env file.")
        return val


# ─────────────────────────────────────────────────────────────
# D1 CLIENT
# ─────────────────────────────────────────────────────────────
class D1Client:
    BASE = "https://api.cloudflare.com/client/v4"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._client = httpx.Client(
            headers={"Authorization": f"Bearer {cfg.cf_api_token}", "Content-Type": "application/json"},
            timeout=60.0,
        )

    def query(self, sql: str, params: Optional[List[Any]] = None) -> Dict:
        url = f"{self.BASE}/accounts/{self.cfg.cf_account_id}/d1/database/{self.cfg.cf_d1_db_id}/query"
        payload = {"sql": sql}
        if params:
            payload["params"] = params
        resp = self._client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"D1 query failed: {data.get('errors', data)}")
        return data

    def query_rows(self, sql: str, params: Optional[List[Any]] = None) -> List[Dict]:
        data = self.query(sql, params)
        results = data.get("result", [])
        if not results:
            return []
        return results[0].get("results", [])

    def execute(self, sql: str, params: Optional[List[Any]] = None) -> int:
        if self.cfg.dry_run:
            log.info(f"[DRY RUN] Would execute: {sql[:120]}...")
            return 0
        data = self.query(sql, params)
        return data.get("result", [{}])[0].get("meta", {}).get("rows_written", 0)

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ─────────────────────────────────────────────────────────────
# R2 CLIENT
# ─────────────────────────────────────────────────────────────
class R2Client:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.endpoint = f"https://{cfg.cf_account_id}.r2.cloudflarestorage.com"

    def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        if self.cfg.dry_run:
            log.info(f"[DRY RUN] Would upload {len(data)} bytes to R2:{key}")
            return key
        url = f"{self.endpoint}/{self.cfg.cf_r2_bucket}/{key}"
        resp = httpx.put(
            url, content=data,
            headers={"Authorization": f"Bearer {self.cfg.cf_api_token}", "Content-Type": content_type},
            timeout=120.0,
        )
        resp.raise_for_status()
        return key

    def upload_json(self, key: str, obj: Any) -> str:
        return self.upload_bytes(key, json.dumps(obj, indent=2).encode(), "application/json")

    def close(self) -> None:
        pass

    def __enter__(self):          # ← fix: was missing
        return self

    def __exit__(self, *_):       # ← fix: was missing
        self.close()


# ─────────────────────────────────────────────────────────────
# BACKUP UTILITY
# ─────────────────────────────────────────────────────────────
def backup_d1(d1: D1Client, r2: R2Client, tables: List[str], label: str = "manual") -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    backup_name = f"{ts}_{label}"
    local_dir = BACKUP_DIR / backup_name
    local_dir.mkdir(parents=True, exist_ok=True)
    r2_prefix = f"backups/d1/{backup_name}"
    manifest = {"timestamp": ts, "label": label, "tables": {}}
    total_rows = 0

    for table in tables:
        try:
            rows = d1.query_rows(f"SELECT * FROM {table}")
            table_data = {"rows": rows, "count": len(rows)}
            manifest["tables"][table] = {"count": len(rows), "status": "ok"}
            total_rows += len(rows)
            (local_dir / f"{table}.json").write_text(json.dumps(table_data, indent=2))
            r2.upload_json(f"{r2_prefix}/{table}.json", table_data)
            log.debug(f"  backed up {table}: {len(rows)} rows")
        except Exception as e:
            manifest["tables"][table] = {"status": "error", "error": str(e)}
            log.warning(f"  backup failed for {table}: {e}")

    manifest["total_rows"] = total_rows
    (local_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    r2.upload_json(f"{r2_prefix}/manifest.json", manifest)
    log.info(f"Backup complete -> {local_dir} | {total_rows} rows across {len(tables)} tables")
    return local_dir


# ─────────────────────────────────────────────────────────────
# SUPABASE CLIENT
# ─────────────────────────────────────────────────────────────
class SupabaseClient:
    def __init__(self, cfg: Config) -> None:
        self.url = cfg.supabase_url.rstrip("/")
        self._client = httpx.Client(
            headers={
                "apikey": cfg.supabase_key,
                "Authorization": f"Bearer {cfg.supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=30.0,
        )

    def upsert(self, table: str, rows: List[Dict], on_conflict: str = "id") -> None:
        if not rows:
            return
        resp = self._client.post(
            f"{self.url}/rest/v1/{table}",
            json=rows,
            headers={**self._client.headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": on_conflict},
        )
        resp.raise_for_status()

    def rpc(self, fn: str, params: Dict) -> Any:
        resp = self._client.post(f"{self.url}/rest/v1/rpc/{fn}", json=params)
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ─────────────────────────────────────────────────────────────
# ANTHROPIC CLIENT
# ─────────────────────────────────────────────────────────────
class AnthropicClient:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._client = httpx.Client(
            headers={
                "x-api-key": cfg.anthropic_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

    def complete(self, model: str, prompt: str, system: str = "", max_tokens: int = 1024) -> Dict:
        body: Dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            body["system"] = system
        resp = self._client.post("https://api.anthropic.com/v1/messages", json=body)
        resp.raise_for_status()
        return resp.json()

    def complete_text(self, model: str, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        data = self.complete(model, prompt, system, max_tokens)
        return data["content"][0]["text"]

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        rates = {
            "claude-haiku-4-5-20251001": (1.00, 5.00),
            "claude-sonnet-4-6":         (3.00, 15.00),
            "claude-opus-4-7":           (5.00, 25.00),
        }
        r = rates.get(model, (3.00, 15.00))
        return (input_tokens * r[0] + output_tokens * r[1]) / 1_000_000

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ─────────────────────────────────────────────────────────────
# CF WORKERS AI EMBEDDING
# Cost: $0.204 per M input tokens (NOT free — Workers AI paid tier)
# ─────────────────────────────────────────────────────────────
def generate_embedding(text: str, cfg: Config) -> List[float]:
    if not cfg.vps_tunnel_url:
        raise RuntimeError("VPS_TUNNEL_URL not set — cannot generate embeddings")
    resp = httpx.post(
        f"{cfg.vps_tunnel_url}/embed",
        json={"text": text[:2000]},
        headers={"x-secret": cfg.vps_secret},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]


# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────
BANDIT_TABLES = [
    "model_registry", "task_type_registry", "agent_registry",
    "model_bandit_params", "routing_decisions", "bandit_reward_log",
    "task_executions", "quality_assessments", "approval_gates",
    "cost_ledger", "artifact_registry",
]

TS_UPDATE_THRESHOLD = 5
