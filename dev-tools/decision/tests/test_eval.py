import json
from pathlib import Path
from typing import Any

import pytest

from decision import eval as ev
from decision.judges import Judge, Judgment
from decision.schema import make_row


def labeled(row_id: str, persona: str, label: str, source: str = "chat-eval") -> dict:
    row = make_row(row_id, persona, [], f"답 {row_id}", source=source)
    row["questions"]["kind"]["label"] = label
    return row


def rec(gold: str, choice: str | None, *, shuffled: str | None = None, p: dict | None = None,
        latency: int = 10, source: str = "chat-eval") -> dict:
    return {"judge": "fake", "model": "m", "id": f"{gold}-{choice}", "persona": "x", "source": source, "gold": gold,
            "choice": choice, "probabilities": p, "latency_ms": latency, "shuffled_order": [],
            "shuffled_choice": choice if shuffled is None else shuffled}


class FirstOption(Judge):
    """criteria 의 첫 옵션을 고르는 판정기. 차례를 바꾸면 답이 바뀐다."""

    name = "fake"

    def __init__(self, model: str = "first") -> None:
        self.model = model

    def judge(self, row: dict[str, Any]) -> Judgment:
        first = next(iter(row["questions"]["kind"]["criteria"]))
        return {"choice": first, "probabilities": {first: 0.9}, "latency_ms": 7}


class Gold(Judge):
    """정답을 아는 판정기(확률 없음)."""

    name = "gold"
    model = "oracle"

    def judge(self, row: dict[str, Any]) -> Judgment:
        return {"choice": row["questions"]["kind"]["label"], "probabilities": None, "latency_ms": 3}


def test_eval_rows_keeps_eval_personas_and_drops_crisis() -> None:
    rows = [labeled("a", "p1", "question"), labeled("b", "p1", "crisis_fixed"), labeled("c", "p2", "question")]
    assert [r["id"] for r in ev.eval_rows(rows, ["p1"])] == ["a"]


def test_eval_rows_rejects_unlabeled() -> None:
    row = make_row("a", "p1", [], "답")
    with pytest.raises(ValueError):
        ev.eval_rows([row], ["p1"])


def test_shuffled_order_differs_and_is_stable() -> None:
    labels = ["a", "b", "c", "d"]
    order = ev.shuffled_order("x#1", labels)
    assert order != labels and sorted(order) == labels
    assert ev.shuffled_order("x#1", labels) == order


def test_accuracy_and_f1() -> None:
    records = [rec("question", "question"), rec("question", "generic_comfort"), rec("generic_comfort", "generic_comfort"),
               rec("specific_reflection", None)]
    assert ev.accuracy(records) == 0.5
    f1 = ev.f1_by_label(records)
    assert f1["question"] == pytest.approx(2 / 3)  # tp1 fp0 fn1
    assert f1["generic_comfort"] == pytest.approx(2 / 3)  # tp1 fp1 fn0
    assert f1["specific_reflection"] == 0.0


def test_ece() -> None:
    records = [rec("question", "question", p={"question": 0.95}), rec("question", "question", p={"question": 0.85}),
               rec("question", "generic_comfort", p={"generic_comfort": 0.85})]
    # 구간 0.9~1.0: 확신 0.95, 정답 1 → 0.05. 구간 0.8~0.9: 확신 0.85, 정답 0.5 → 0.35
    assert ev.ece(records) == pytest.approx(1 / 3 * 0.05 + 2 / 3 * 0.35)
    assert ev.ece([rec("question", "question")]) is None


def test_percentile_and_sensitivity() -> None:
    assert ev.percentile([1, 2, 3, 4], 0.5) == 2.5
    assert ev.percentile(list(range(1, 101)), 0.95) == pytest.approx(95.05)
    assert ev.percentile([], 0.5) is None
    records = [rec("question", "question", shuffled="generic_comfort"), rec("question", "question"),
               rec("question", None), rec("question", "question", shuffled="question")]
    assert ev.order_sensitivity(records) == pytest.approx(1 / 3)


def test_summary_by_source() -> None:
    records = [rec("question", "question"), rec("question", "generic_comfort", source="synthetic-haiku")]
    s = ev.summarize(records)
    assert s["accuracy_by_source"] == {"chat-eval": 1.0, "synthetic-haiku": 0.0}
    assert s["n_by_source"] == {"chat-eval": 1, "synthetic-haiku": 1}


def test_evaluate_writes_results_and_accumulates_report(tmp_path: Path) -> None:
    rows = [labeled("a#1", "p1", "question"), labeled("a#2", "p1", "generic_comfort", source="synthetic-haiku"),
            labeled("a#3", "p1", "specific_reflection", source="synthetic-haiku")]
    day = tmp_path / "2026-10-21"
    s = ev.evaluate(FirstOption(), rows, day)
    assert s["order_sensitivity"] == 1.0
    assert s["accuracy"] == pytest.approx(1 / 3)  # 첫 옵션은 generic_comfort
    lines = [json.loads(x) for x in (day / "fake-first.jsonl").read_text().splitlines()]
    assert [x["id"] for x in lines] == ["a#1", "a#2", "a#3"]
    assert all(x["shuffled_order"][0] == x["shuffled_choice"] for x in lines)

    ev.evaluate(Gold(), rows, day)
    ev.evaluate(FirstOption(), rows, day)  # 같은 판정기+모델은 덮어쓴다
    report = (day / "report.md").read_text()
    table = [line for line in report.splitlines() if line.startswith("| fake") or line.startswith("| gold")]
    assert len(table) == 2
    gold_row = next(line for line in table if line.startswith("| gold"))
    assert "100.0%" in gold_row and "— (확률 없음)" in gold_row and "0.0%" in gold_row
    assert "합성 재료의 비율 66.7%" in report
    assert "chat-eval 100.0% (n=1) / synthetic-haiku 100.0% (n=2)" in gold_row


def test_slug() -> None:
    assert ev.slug("2nugu/laya-ko") == "2nugu--laya-ko"
    assert ev.slug("data/models/laya-cliche-2026-10-21") == "laya-cliche-2026-10-21"
    assert ev.slug("haiku") == "haiku"


def test_main_with_fake_judge(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    labels = tmp_path / "final.jsonl"
    labels.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in
                                [labeled("a#1", "p1", "question"), labeled("b#1", "p2", "question")]) + "\n")
    split = tmp_path / "split.json"
    split.write_text(json.dumps({"train_personas": ["p2"], "eval_personas": ["p1"]}))
    monkeypatch.setattr(ev, "OUTPUT_DIR", tmp_path / "out")
    monkeypatch.setattr(ev, "make_judge", lambda name, model, **_: FirstOption(model))
    code = ev.main(["--judge", "claude", "--model", "haiku", "--labels", str(labels), "--split", str(split),
                    "--date", "2026-10-21"])
    assert code == 0
    lines = (tmp_path / "out" / "2026-10-21" / "fake-haiku.jsonl").read_text().splitlines()
    assert len(lines) == 1


def test_main_skips_systemone_without_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    labels = tmp_path / "final.jsonl"
    labels.write_text(json.dumps(labeled("a#1", "p1", "question"), ensure_ascii=False) + "\n")
    split = tmp_path / "split.json"
    split.write_text(json.dumps({"train_personas": [], "eval_personas": ["p1"]}))
    monkeypatch.setattr(ev, "OUTPUT_DIR", tmp_path / "out")
    monkeypatch.delenv("SYSTEMONE_URL", raising=False)
    assert ev.main(["--judge", "systemone", "--labels", str(labels), "--split", str(split)]) == 0
    assert "건너뜀" in capsys.readouterr().out
