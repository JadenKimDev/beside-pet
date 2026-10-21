"""고정된 자리. 재료 경로는 인자로 바꿀 수 없다(실제 사용자 세션을 재료로 쓰지 않는 선)."""

from __future__ import annotations

from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]  # dev-tools/decision
REPO_ROOT = PROJECT_DIR.parents[1]
MATERIAL_DIR = REPO_ROOT / "outputs" / "chat-eval"
DATA_DIR = PROJECT_DIR / "data"
CANDIDATES_PATH = DATA_DIR / "candidates.jsonl"
SPLIT_PATH = DATA_DIR / "split.json"
CACHE_DIR = REPO_ROOT / "outputs" / "decision" / "cache"
PERSONA_DIR = REPO_ROOT / "dev-tools" / "chat-eval" / "personas"
REPLY_PROMPT_PATH = REPO_ROOT / "apps" / "server" / "src" / "support" / "prompt" / "reply.rs"
