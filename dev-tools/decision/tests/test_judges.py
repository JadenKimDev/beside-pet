import json
import math
import subprocess
import sys
from pathlib import Path

import pytest

from decision.claude_cli import ClaudeCli
from decision.judges import JudgeUnavailable, make_judge, question_of
from decision.judges.claude import SYSTEM_PROMPT, ClaudeJudge, parse_choice, render_prompt
from decision.judges.laya import LayaJudge, answer_judgment, apply_temperature, load_calibration
from decision.judges.systemone import SystemoneJudge
from decision.schema import CRITERIA, LABELS, make_row


def labeled(row_id: str, label: str, reply: str = "많이 힘드셨겠어요.") -> dict:
    row = make_row(row_id, "fake-dog", ["콩이가 산책을 좋아했어요."], reply)
    row["questions"]["kind"]["label"] = label
    return row


def ok(text: str) -> str:
    return json.dumps({"type": "result", "is_error": False, "result": text})


def test_laya_and_systemone_import_without_heavy_dependencies() -> None:
    # 새 프로세스에서 판정기 모듈만 들여, laya·torch·transformers 를 판정 전에 들이지 않는지 본다.
    code = (
        "import sys, decision.eval, decision.judges.laya, decision.judges.systemone;"
        "print(sorted(m for m in ('laya', 'torch', 'transformers') if m in sys.modules))"
    )
    done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert done.stdout.strip() == "[]"


def test_question_of_drops_label_and_keeps_order() -> None:
    row = labeled("a#1", "question")
    q = question_of(row)
    assert "label" not in q
    assert list(q["criteria"]) == list(CRITERIA)


def test_render_prompt_lists_options_in_row_order_and_turns() -> None:
    row = labeled("a#1", "question")
    q = question_of(row)
    q["criteria"] = dict(reversed(list(q["criteria"].items())))
    prompt = render_prompt({"user_turns": ["첫 말\n둘째 줄", "둘째 말"], "reply": "답"}, q)
    positions = [prompt.index(f"- {label}:") for label in q["criteria"]]
    assert positions == sorted(positions)
    assert "- 첫 말 둘째 줄\n- 둘째 말" in prompt
    assert prompt.rstrip().endswith("옵션의 이름 하나만 답하라.")
    assert "(없음)" in render_prompt({"user_turns": [], "reply": "답"}, question_of(row))


def test_parse_choice() -> None:
    assert parse_choice(" `question`.\n", LABELS) == "question"
    assert parse_choice("답: specific_reflection 입니다", LABELS) == "specific_reflection"
    assert parse_choice("question 또는 generic_comfort", LABELS) is None
    assert parse_choice("모르겠다", LABELS) is None


def test_claude_judge_uses_cli_with_model_and_shared_prompt(tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def runner(argv: list[str]) -> str:
        calls.append(argv)
        return ok("generic_comfort")

    judge = ClaudeJudge(model="opus", client=ClaudeCli(cache_dir=tmp_path, runner=runner))
    rows = [labeled("a#1", "question"), labeled("a#2", "question", reply="다른 답")]
    out = judge.judge_many(rows)
    assert [j["choice"] for j in out] == ["generic_comfort", "generic_comfort"]
    assert all(j["probabilities"] is None for j in out)
    argv = calls[0]
    assert argv[argv.index("--model") + 1] == "opus"
    assert argv[argv.index("--system-prompt") + 1] == SYSTEM_PROMPT
    # 같은 줄은 캐시에서 다시 읽는다
    judge.judge_many(rows)
    assert len(calls) == 2


def test_claude_judge_records_unreadable_answer(tmp_path: Path) -> None:
    judge = ClaudeJudge(client=ClaudeCli(cache_dir=tmp_path, runner=lambda argv: ok("잘 모르겠어요")))
    j = judge.judge(labeled("a#1", "question"))
    assert j["choice"] is None and "error" in j


def test_apply_temperature_keeps_argmax_and_flattens() -> None:
    p = {"a": 0.7, "b": 0.2, "c": 0.1}
    flat = apply_temperature(p, 2.0)
    assert math.isclose(sum(flat.values()), 1.0)
    assert max(flat, key=flat.get) == "a" and flat["a"] < 0.7
    assert apply_temperature(p, 1.0) == pytest.approx(p)


def test_calibration_applied_only_when_not_in_checkpoint(tmp_path: Path) -> None:
    model_dir = tmp_path / "laya-cliche"
    model_dir.mkdir()
    (model_dir / "calibration.json").write_text(json.dumps({"temperature": 1.7, "applied_in_checkpoint": True}))
    assert LayaJudge(model=str(model_dir), agent=object()).temperature is None
    external = tmp_path / "zero.json"
    external.write_text(json.dumps({"temperature": 2.0}))
    assert LayaJudge(model="2nugu/laya-ko", calibration=external, agent=object()).temperature == 2.0
    assert load_calibration("2nugu/laya-ko") is None


def test_laya_judge_with_fake_agent_applies_temperature(tmp_path: Path) -> None:
    class FakeAgent:
        def predict(self, state: dict, questions: dict) -> dict:
            assert set(questions) == {"kind"} and "label" not in questions["kind"]
            return {"answers": {"kind": {"choice": "question", "probabilities": {"question": 0.8, "generic_comfort": 0.2}}}}

    calibration = tmp_path / "c.json"
    calibration.write_text(json.dumps({"temperature": 2.0}))
    j = LayaJudge(model="x", calibration=calibration, agent=FakeAgent()).judge(labeled("a#1", "question"))
    assert j["choice"] == "question"
    assert j["probabilities"]["question"] == pytest.approx(apply_temperature({"question": 0.8, "generic_comfort": 0.2}, 2.0)["question"])


def test_answer_judgment_without_choice() -> None:
    j = answer_judgment({"answers": {}}, 5)
    assert j["choice"] is None and j["probabilities"] is None and "error" in j


def test_systemone_skips_without_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SYSTEMONE_URL", raising=False)
    with pytest.raises(JudgeUnavailable):
        make_judge("systemone", "")


def test_systemone_request_shape_with_fake_transport() -> None:
    seen: dict = {}

    def transport(url: str, body: bytes, headers: dict) -> dict:
        seen.update(url=url, body=json.loads(body), headers=headers)
        return {"model": "m", "answers": {"kind": {"choice": "generic_comfort", "probabilities": {"generic_comfort": 1.0}}}}

    judge = SystemoneJudge(url="http://127.0.0.1:9/", key="k", model="laya-ko", transport=transport)
    j = judge.judge(labeled("a#1", "generic_comfort"))
    assert seen["url"] == "http://127.0.0.1:9/v1/systemone"
    assert seen["headers"]["Authorization"] == "Bearer k"
    assert seen["body"]["model"] == "laya-ko" and "label" not in seen["body"]["questions"]["kind"]
    assert j["choice"] == "generic_comfort" and j["probabilities"] == {"generic_comfort": 1.0}
