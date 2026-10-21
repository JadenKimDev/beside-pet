import inspect
from pathlib import Path

import pytest

from decision import label, paths
from decision.extract import extract_candidates
from decision.schema import row_errors


def test_one_row_per_companion_reply_with_two_prior_user_turns(material: Path) -> None:
    rows = extract_candidates(material)
    by_id = {row["id"]: row for row in rows}
    assert by_id["2026-01-01/fake-dog#0"]["state"] == {"user_turns": [], "reply": "안녕하세요, 곁에 있을게요."}
    assert by_id["2026-01-01/fake-dog#1"]["state"]["user_turns"] == ["콩이가 산책을 좋아했어요."]
    assert by_id["2026-01-01/fake-dog#3"]["state"] == {
        "user_turns": ["비 오는 날에도요.", "공원이요."],
        "reply": "공원에서의 콩이를 떠올리시는군요.",
    }
    assert {row["persona"] for row in rows} == {"fake-dog", "fake-bird"}
    assert all(row_errors(row, labeled=False) == [] for row in rows)


def test_duplicate_replies_are_kept_once_in_path_order(material: Path) -> None:
    rows = extract_candidates(material)
    replies = [row["state"]["reply"] for row in rows]
    assert len(replies) == len(set(replies)) == 5
    greeting = [row for row in rows if row["state"]["reply"] == "안녕하세요, 곁에 있을게요."]
    assert [row["id"] for row in greeting] == ["2026-01-01/fake-dog#0"]
    assert "model-x/2026-01-02/fake-bird#1" in {row["id"] for row in rows}


def test_ids_are_stable(material: Path) -> None:
    assert extract_candidates(material) == extract_candidates(material)


def test_material_is_fixed_to_chat_eval_outputs() -> None:
    assert paths.MATERIAL_DIR == paths.REPO_ROOT / "outputs" / "chat-eval"
    assert (paths.REPO_ROOT / "dev-tools" / "decision") == paths.PROJECT_DIR
    assert list(inspect.signature(label.write_candidates).parameters) == []


def test_cli_takes_no_material_path(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        label.main(["outputs/other"])
    with pytest.raises(SystemExit):
        label.main(["--material", "x"])
    capsys.readouterr()


def test_cli_writes_candidates_from_fixed_root(
    material: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "out" / "candidates.jsonl"
    monkeypatch.setattr(label, "MATERIAL_DIR", material)
    monkeypatch.setattr(label, "CANDIDATES_PATH", out)
    monkeypatch.setattr(label, "PROJECT_DIR", tmp_path)
    assert label.main([]) == 0
    assert len(out.read_text(encoding="utf-8").splitlines()) == 5
