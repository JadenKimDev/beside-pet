import json
from pathlib import Path

from decision.schema import CRITERIA, INSTRUCTIONS, LABELS, make_row, row_errors
from decision.validate import main


def labeled(label: str = "question") -> dict:
    row = make_row("r#1", "fake-dog", ["콩이가 보고 싶어요."], "콩이는 어떤 아이였나요?")
    row["questions"]["kind"]["label"] = label
    return row


def test_question_strings_are_shared_and_cover_labels() -> None:
    row = make_row("r#1", "p", [], "안녕하세요")
    q = row["questions"]["kind"]
    assert q["type"] == "choice"
    assert q["instructions"] == INSTRUCTIONS and "`reply`" in INSTRUCTIONS
    assert set(q["criteria"]) == set(LABELS) == set(CRITERIA)
    assert "label" not in q


def test_candidate_without_label_passes_only_in_candidate_mode() -> None:
    row = make_row("r#1", "p", [], "안녕하세요")
    assert row_errors(row, labeled=False) == []
    assert row_errors(row, labeled=True) == ["label 이 없다"]
    row["questions"]["kind"]["label"] = ""
    assert row_errors(row, labeled=False) == []


def test_labeled_row_passes_and_unknown_label_fails() -> None:
    assert row_errors(labeled(), labeled=True) == []
    assert any("label" in e for e in row_errors(labeled("cliche"), labeled=True))
    assert any("label" in e for e in row_errors(labeled("cliche"), labeled=False))


def test_shape_errors() -> None:
    row = labeled()
    row["state"]["user_turns"] = ["a", "b", "c"]
    assert any("2개" in e for e in row_errors(row, labeled=True))
    row = labeled()
    row["state"]["reply"] = " "
    assert any("reply" in e for e in row_errors(row, labeled=True))
    row = labeled()
    row["questions"]["kind"]["criteria"] = {"generic_comfort": "x"}
    assert any("criteria" in e for e in row_errors(row, labeled=True))
    row = labeled()
    row["questions"]["kind"]["type"] = "score"
    assert any("choice" in e for e in row_errors(row, labeled=True))
    assert row_errors([], labeled=True) == ["줄이 객체가 아니다"]
    assert any("questions" in e for e in row_errors({"id": "x", "state": {"user_turns": [], "reply": "a"}}, labeled=False))


def write(path: Path, rows: list) -> Path:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return path


def test_cli_defaults_to_labeled_mode(tmp_path: Path) -> None:
    candidate = make_row("r#1", "p", [], "안녕하세요")
    path = write(tmp_path / "c.jsonl", [candidate])
    assert main([str(path)]) == 1
    assert main(["--labeled", str(path)]) == 1
    assert main(["--candidates", str(path)]) == 0
    assert main([str(write(tmp_path / "l.jsonl", [labeled()]))]) == 0


def test_cli_rejects_duplicate_ids_bad_json_and_empty(tmp_path: Path) -> None:
    assert main([str(write(tmp_path / "d.jsonl", [labeled(), labeled()]))]) == 1
    bad = tmp_path / "bad.jsonl"
    bad.write_text("{not json\n", encoding="utf-8")
    assert main([str(bad)]) == 1
    assert main([str(write(tmp_path / "e.jsonl", []))]) == 1
    assert main([str(tmp_path / "missing.jsonl")]) == 1
