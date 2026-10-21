import json
import threading
import time
from pathlib import Path

import pytest

from decision.claude_cli import MAX_PARALLEL, ClaudeCli, Request, command, parse_output


def ok(text: str) -> str:
    return json.dumps({"type": "result", "is_error": False, "result": f"  {text}\n"})


def test_command_uses_print_json_and_no_tools() -> None:
    argv = command(Request("안녕", model="opus", system_prompt="sys"))
    assert argv[:2] == ["claude", "-p"]
    assert argv[argv.index("--model") + 1] == "opus"
    assert argv[argv.index("--output-format") + 1] == "json"
    assert argv[argv.index("--tools") + 1] == ""
    assert argv[argv.index("--system-prompt") + 1] == "sys"
    assert argv[-1] == "안녕"
    assert "--system-prompt" not in command(Request("안녕"))


def test_parse_output_rejects_errors() -> None:
    assert parse_output(ok("답")) == "답"
    with pytest.raises(RuntimeError):
        parse_output(json.dumps({"is_error": True, "result": "rate limited"}))


def test_cache_reuses_result_and_key_depends_on_model_and_system(tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def runner(argv: list[str]) -> str:
        calls.append(argv)
        return ok(f"답{len(calls)}")

    client = ClaudeCli(cache_dir=tmp_path, runner=runner)
    first = client.ask(Request("질문"))
    again = client.ask(Request("질문"))
    assert (first.text, first.cached) == ("답1", False)
    assert (again.text, again.cached) == ("답1", True)
    assert len(calls) == 1
    assert client.ask(Request("질문", model="opus")).text == "답2"
    assert client.ask(Request("질문", system_prompt="x")).text == "답3"
    assert len(list(tmp_path.glob("*.json"))) == 3
    assert ClaudeCli(cache_dir=tmp_path, runner=runner).ask(Request("질문")).cached


def test_ask_many_keeps_order_caps_parallelism_and_isolates_failures(tmp_path: Path) -> None:
    lock = threading.Lock()
    active = peak = 0

    def runner(argv: list[str]) -> str:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.02)
        with lock:
            active -= 1
        if argv[-1] == "q3":
            raise RuntimeError("boom")
        return ok(argv[-1].upper())

    client = ClaudeCli(cache_dir=tmp_path, runner=runner)
    results = client.ask_many([Request(f"q{i}") for i in range(12)], parallel=10)
    assert peak <= MAX_PARALLEL
    assert isinstance(results[3], RuntimeError)
    assert [r.text for i, r in enumerate(results) if i != 3] == [f"Q{i}" for i in range(12) if i != 3]
    assert not (tmp_path / f"{Request('q3').key()}.json").exists()
