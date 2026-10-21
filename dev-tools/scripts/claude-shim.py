#!/usr/bin/env python3
"""Ollama `/api/chat` 모양의 로컬 서버. 요청을 이 머신의 Claude Code(`claude -p`, 구독)로 보낸다.

개발 중 실측(chat:eval 등)을 Anthropic API 키 없이 돌리기 위한 것이다. 제품 서버를
`LLM_PROVIDER=ollama OLLAMA_BASE_URL=http://127.0.0.1:11435 LLM_MODEL=haiku` 로 띄우면
서버 코드는 한 줄도 바꾸지 않고 Claude Code 의 모델로 답한다. production 에서는 쓰지 않는다.

    python3 dev-tools/scripts/claude-shim.py [--port 11435] [--log outputs/claude-shim.log]

- `messages` 의 system 은 `--system-prompt` 로 그대로 넘기고, 나머지 턴은 글 하나로 펴서 보낸다
  (`claude -p` 는 사용자 프롬프트 하나만 받는다). 도구는 전부 끈다(`--tools ""`. `--bare` 는 로그인 정보까지 건너뛰어 쓰지 않는다).
- 응답은 `stream` 값에 따라 한 줄(JSON) 또는 NDJSON(`done:false` 글 한 줄 + `done:true` 토큰 수)이다.
- 모델 이름은 그대로 `--model` 에 준다(haiku, sonnet, opus, 또는 전체 id).
- 프롬프트와 답의 본문은 로그에 적지 않는다. 적는 것은 시각, 모델, 지연, 토큰 수, 오류 종류뿐이다.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TURN_LABEL = {"user": "User", "assistant": "Assistant"}
EMPTY_CWD = tempfile.mkdtemp(prefix="claude-shim-")


def flatten(messages: list[dict]) -> tuple[str | None, str]:
    """system 글과, 나머지 턴을 편 사용자 프롬프트를 돌려준다."""
    system = "\n\n".join(m.get("content", "") for m in messages if m.get("role") == "system") or None
    turns = [m for m in messages if m.get("role") in TURN_LABEL]
    if not turns:
        return system, ""
    if len(turns) == 1 and turns[0]["role"] == "user":
        return system, turns[0].get("content", "")
    lines = ["<conversation>"]
    for m in turns:
        lines.append(f"<{m['role']}>\n{m.get('content', '')}\n</{m['role']}>")
    lines.append("</conversation>")
    lines.append(
        "Continue the conversation above as the assistant: write only the assistant's next "
        "message, with no preface, labels, or quotation marks."
    )
    return system, "\n".join(lines)


def ask_claude(model: str, system: str | None, prompt: str, max_tokens: int | None) -> tuple[str, dict]:
    cmd = [
        "claude", "-p", "--model", model, "--output-format", "json", "--tools", "",
        "--max-turns", "1",
    ]
    if system:
        cmd += ["--system-prompt", system]
    # 빈 디렉터리에서 돌려 이 레포의 CLAUDE.md 와 메모리가 프롬프트에 섞이지 않게 한다.
    # claude 프로세스가 드물게 비정상 종료한다(60여 번에 한 번). 한 번만 다시 시도한다.
    last_error = None
    for attempt in range(2):
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=300, cwd=EMPTY_CWD)
        if proc.returncode != 0:
            last_error = RuntimeError(f"claude exited {proc.returncode}")
            continue
        data = json.loads(proc.stdout)
        if data.get("is_error"):
            last_error = RuntimeError("claude returned is_error")
            continue
        break
    else:
        raise last_error
    text = data.get("result") or ""
    usage = data.get("usage") or {}
    if max_tokens and len(text) > max_tokens * 6:  # 대략의 상한. 글자 6개를 토큰 하나로 본다
        text = text[: max_tokens * 6]
    return text, {
        "prompt_eval_count": int(usage.get("input_tokens", 0))
        + int(usage.get("cache_read_input_tokens", 0))
        + int(usage.get("cache_creation_input_tokens", 0)),
        "eval_count": int(usage.get("output_tokens", 0)),
    }


class Handler(BaseHTTPRequestHandler):
    log_path: str | None = None

    def log_message(self, fmt, *args):  # 기본 접근 로그를 끈다(본문은 없지만 조용히)
        pass

    def _log(self, **fields):
        line = json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **fields})
        if self.log_path:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        else:
            print(line, file=sys.stderr, flush=True)

    def do_GET(self):
        if self.path in ("/", "/api/tags", "/api/version"):
            self._json(200, {"version": "claude-shim", "models": []})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/chat":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("content-length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "bad json"})
            return
        model = body.get("model") or "haiku"
        stream = bool(body.get("stream"))
        max_tokens = (body.get("options") or {}).get("num_predict")
        system, prompt = flatten(body.get("messages") or [])
        started = time.monotonic()
        try:
            text, usage = ask_claude(model, system, prompt, max_tokens)
        except Exception as e:  # noqa: BLE001 — 종류만 적는다
            self._log(model=model, ms=int((time.monotonic() - started) * 1000), error=type(e).__name__)
            self._json(500, {"error": "claude failed"})
            return
        ms = int((time.monotonic() - started) * 1000)
        self._log(model=model, ms=ms, stream=stream, **usage)
        now = datetime.now(timezone.utc).isoformat()
        if not stream:
            self._json(200, {"model": model, "created_at": now, "message": {"role": "assistant", "content": text}, "done": True, **usage})
            return
        self.send_response(200)
        self.send_header("content-type", "application/x-ndjson")
        self.end_headers()
        self._line({"model": model, "created_at": now, "message": {"role": "assistant", "content": text}, "done": False})
        self._line({"model": model, "created_at": now, "message": {"role": "assistant", "content": ""}, "done": True, "done_reason": "stop", **usage})

    def _line(self, obj):
        self.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())
        self.wfile.flush()

    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=11435)
    ap.add_argument("--log", help="JSON 줄 로그(본문 없음). 없으면 stderr")
    args = ap.parse_args()
    Handler.log_path = args.log
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"claude-shim: http://127.0.0.1:{args.port}/api/chat → claude -p (구독). Ctrl-C 로 멈춘다", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
