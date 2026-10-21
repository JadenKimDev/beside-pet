"""이 머신의 Claude Code 를 `claude -p --model <모델> --output-format json` 으로 부르는 공용 헬퍼.

구독 세션으로 돌므로 Anthropic API 클라이언트를 쓰지 않는다. 결과는 (모델, 시스템 프롬프트, 프롬프트)의 해시로
outputs/decision/cache/<해시>.json 에 남기고, 있으면 다시 부르지 않는다. 동시 실행은 최대 MAX_PARALLEL 이다.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from decision.paths import CACHE_DIR

MAX_PARALLEL = 4
TIMEOUT_S = 180


@dataclass(frozen=True)
class Request:
    prompt: str
    model: str = "haiku"
    system_prompt: str | None = None

    def key(self) -> str:
        payload = json.dumps([self.model, self.system_prompt, self.prompt], ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Response:
    text: str
    latency_ms: int
    cached: bool


# argv 를 받아 표준 출력을 돌려주는 함수. 테스트가 흉내 낸 것을 끼운다.
Runner = Callable[[list[str]], str]


def command(request: Request) -> list[str]:
    argv = [
        "claude", "-p", "--model", request.model, "--output-format", "json",
        "--tools", "", "--no-session-persistence",
    ]
    if request.system_prompt is not None:
        argv += ["--system-prompt", request.system_prompt]
    return [*argv, request.prompt]


def subprocess_runner(argv: list[str]) -> str:
    # 레포 밖의 빈 디렉터리에서 돌려 레포의 CLAUDE.md 가 프롬프트에 섞이지 않게 한다.
    with tempfile.TemporaryDirectory(prefix="decision-claude-") as cwd:
        done = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT_S, check=False)
    if done.returncode != 0:
        raise RuntimeError(f"claude 가 {done.returncode} 로 끝났다: {done.stderr.strip()[:300]}")
    return done.stdout


def parse_output(stdout: str) -> str:
    data = json.loads(stdout)
    if data.get("is_error") or not isinstance(data.get("result"), str):
        raise RuntimeError(f"claude 의 결과가 오류다: {str(data.get('result'))[:300]}")
    return data["result"].strip()


class ClaudeCli:
    def __init__(self, cache_dir: Path = CACHE_DIR, runner: Runner = subprocess_runner) -> None:
        self.cache_dir = cache_dir
        self.runner = runner

    def ask(self, request: Request) -> Response:
        path = self.cache_dir / f"{request.key()}.json"
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            return Response(text=cached["text"], latency_ms=cached["latency_ms"], cached=True)
        started = time.monotonic()
        text = parse_output(self.runner(command(request)))
        latency_ms = round((time.monotonic() - started) * 1000)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        record = {"model": request.model, "text": text, "latency_ms": latency_ms}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        return Response(text=text, latency_ms=latency_ms, cached=False)

    def ask_many(self, requests: Sequence[Request], parallel: int = MAX_PARALLEL) -> list[Response | Exception]:
        """차례를 지켜 돌려준다. 실패한 요청은 그 자리에 예외를 둔다(다른 요청은 계속한다)."""

        def one(request: Request) -> Response | Exception:
            try:
                return self.ask(request)
            except Exception as error:  # noqa: BLE001 - 한 요청의 실패가 전체를 멈추지 않게 한다
                return error

        with ThreadPoolExecutor(max_workers=min(parallel, MAX_PARALLEL)) as pool:
            return list(pool.map(one, requests))
