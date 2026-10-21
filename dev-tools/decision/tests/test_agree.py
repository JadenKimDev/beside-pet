import json
from pathlib import Path

import pytest

from decision import label
from decision.agree import cohen_kappa, compare
from decision.jsonl import write_jsonl
from decision.schema import make_row


def test_kappa_known_values() -> None:
    assert cohen_kappa(["x", "y", "x", "y"], ["x", "y", "x", "y"]) == 1.0
    # 관측 0.5, 기대 0.5 → 0
    assert cohen_kappa(["x", "x", "y", "y"], ["x", "y", "x", "y"]) == 0.0
    # 교과서 예: 20/5/10/15 표 → po=0.7, pe=0.5 → 0.4
    a = ["y"] * 25 + ["n"] * 25
    b = ["y"] * 20 + ["n"] * 5 + ["y"] * 10 + ["n"] * 15
    assert cohen_kappa(a, b) == pytest.approx(0.4)
    assert cohen_kappa(["x", "x"], ["x", "x"]) == 1.0
    with pytest.raises(ValueError):
        cohen_kappa([], [])


def rows(labels: dict[str, str | None]) -> list[dict]:
    out = []
    for row_id, value in labels.items():
        row = make_row(row_id, "p", ["말"], f"답 {row_id}")
        if value is not None:
            row["questions"]["kind"]["label"] = value
        out.append(row)
    return out


def test_compare_matches_by_id_and_lists_disagreements() -> None:
    a = rows({"1": "question", "2": "generic_comfort", "3": "question", "4": None, "only-a": "question"})
    b = list(reversed(rows({"1": "question", "2": "specific_reflection", "3": "question", "4": "question"})))
    result = compare(a, b)
    assert result.matched == 3
    assert result.agreement == pytest.approx(2 / 3)
    assert result.disagreements == [
        {"id": "2", "state": {"user_turns": ["말"], "reply": "답 2"}, "a": "generic_comfort", "b": "specific_reflection"}
    ]
    assert result.only_a == ["only-a"] and result.only_b == [] and result.unlabeled == ["4"]


def test_agree_cli_writes_disagreements_next_to_a(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    labels = tmp_path / "labels"
    write_jsonl(labels / "a.jsonl", rows({"1": "question", "2": "generic_comfort"}))
    write_jsonl(labels / "b.jsonl", rows({"1": "question", "2": "question"}))
    assert label.main(["--agree", str(labels / "a.jsonl"), str(labels / "b.jsonl")]) == 0
    out = capsys.readouterr().out
    assert "일치율\t0.500" in out and "kappa\t0.000" in out
    lines = (labels / "disagreements.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["id"] for line in lines] == ["2"]
