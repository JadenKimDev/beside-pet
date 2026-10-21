import json
import subprocess
import sys
from pathlib import Path

import pytest

from decision import train
from decision.schema import CRITERIA, INSTRUCTIONS, make_row


def _labeled(row_id: str, persona: str, label: str) -> dict:
    row = make_row(row_id, persona, ["지어낸 말"], f"지어낸 답 {row_id}")
    row["questions"]["kind"]["label"] = label
    return row


def test_torch_and_laya_are_not_imported_by_module():
    # 테스트는 모델 없이 돈다: 모듈을 불러오는 것만으로 torch, laya 를 읽지 않는다(다른 테스트와 섞이지 않게 따로 띄운다).
    code = "import sys, decision.train; print(int('torch' in sys.modules), int('laya' in sys.modules))"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True).stdout.split()
    assert out == ["0", "0"]


def test_select_rows_keeps_only_given_personas_and_drops_crisis():
    rows = [
        _labeled("a#1", "dog", "generic_comfort"),
        _labeled("a#2", "dog", "crisis_fixed"),
        _labeled("b#1", "cat", "question"),
        _labeled("c#1", "bird", "specific_reflection"),
    ]
    chosen = train.select_rows(rows, ["dog", "bird"])
    assert [r["id"] for r in chosen] == ["a#1", "c#1"]


def test_select_rows_rejects_unlabeled_or_malformed_rows():
    unlabeled = make_row("a#1", "dog", [], "지어낸 답")
    with pytest.raises(ValueError, match="label"):
        train.select_rows([unlabeled], ["dog"])
    bad = _labeled("a#2", "dog", "generic_comfort")
    bad["questions"]["kind"]["criteria"] = {"x": "y"}
    with pytest.raises(ValueError, match="criteria"):
        train.select_rows([bad], ["dog"])


def test_to_laya_row_moves_label_to_expected_and_keeps_question_for_inference():
    row = _labeled("a#1", "dog", "question")
    out = train.to_laya_row(row)
    assert out["expected"] == {"kind": "question"}
    assert out["state"] == row["state"]
    question = out["questions"]["kind"]
    assert "label" not in question
    assert question == {"type": "choice", "instructions": INSTRUCTIONS, "criteria": CRITERIA}
    assert "persona" not in out and "source" not in out
    # 원본 줄은 바뀌지 않는다.
    assert row["questions"]["kind"]["label"] == "question"


def test_read_split_refuses_persona_on_both_sides(tmp_path: Path):
    path = tmp_path / "split.json"
    path.write_text(json.dumps({"train_personas": ["dog", "cat"], "eval_personas": ["cat"]}), encoding="utf-8")
    with pytest.raises(ValueError, match="cat"):
        train.read_split(path)
    path.write_text(json.dumps({"train_personas": ["dog"]}), encoding="utf-8")
    with pytest.raises(ValueError, match="eval_personas"):
        train.read_split(path)


def test_choice_temperature_prefers_option_bucket():
    cfg = {"temperature": [1.3, 1.0, 1.0], "temperature_by_options": {"choice:3-5": 1.7, "choice:2": 0.9}}
    assert train.choice_temperature(cfg, 4) == 1.7
    assert train.choice_temperature(cfg, 2) == 0.9
    assert train.choice_temperature(cfg, 7) == 1.3
    assert train.choice_temperature({"temperature": [1.1, 1.0, 1.0]}, 4) == 1.1


def test_write_calibration_shape(tmp_path: Path):
    cfg = {"temperature": [1.2, 1.0, 1.0], "temperature_by_options": {"choice:3-5": 1.4}}
    payload = train.calibration_payload(
        cfg, base="convaiinnovations/laya-multilingual", trained_at="2026-10-21T12:00:00+09:00",
        n_options=4, calibration_items=96,
    )
    path = train.write_calibration(tmp_path / "model", payload)
    assert path == tmp_path / "model" / "calibration.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["temperature"] == 1.4
    # laya.load 가 rl_agent_config.json 의 온도를 이미 적용하므로 판정기는 다시 적용하지 않는다(S2 와 합의).
    assert data["applied_in_checkpoint"] is True
    assert data["question_id"] == "kind"
    assert data["base"] == "convaiinnovations/laya-multilingual"
    assert data["trained_at"] == "2026-10-21T12:00:00+09:00"
    assert data["calibration_items"] == 96
    assert data["laya_temperature"] == [1.2, 1.0, 1.0]
    assert data["laya_temperature_by_options"] == {"choice:3-5": 1.4}


def test_default_out_is_under_data_models():
    import datetime as dt

    out = train.default_out("2nugu/laya-ko", dt.date(2026, 10, 21))
    assert out == train.MODELS_DIR / "laya-cliche-2026-10-21-ko"
    assert train.default_out("convaiinnovations/laya-multilingual", dt.date(2026, 10, 21)).name == (
        "laya-cliche-2026-10-21-multilingual"
    )


def test_parse_args_refuses_out_in_data_outside_models():
    with pytest.raises(SystemExit):
        train.parse_args(["--base", "2nugu/laya-ko", "--out", str(train.DATA_DIR / "laya-x")])
    args = train.parse_args(["--base", "2nugu/laya-ko"])
    assert (args.micro_batch, args.grad_accum, args.epochs) == (1, 8, 4)


def test_format_report_marks_non_adoptable_base():
    info = {
        "name": "laya-cliche-2026-10-21-ko", "base": "2nugu/laya-ko", "out": "data/models/x", "trained_at": "t",
        "device": "mps", "labels": "l", "split": "s", "train_rows": 10, "train_items": 8, "calibration_items": 2,
        "eval_rows": 3, "epochs": 1, "micro_batch": 1, "grad_accum": 8, "loss": "rlcd", "shuffle_options": ["choice"],
        "seconds": 12.0, "epoch_loss": [0.5], "n_options": 4, "temperature": 1.2, "laya_temperature": [1.2, 1, 1],
        "train_accuracy": 0.75, "eval_before": {"accuracy": 0.5, "ece": 0.1}, "eval_after": {"accuracy": 0.6, "ece": 0.05},
        "eval_mode": "held_out",
    }
    text = train.format_report(info)
    assert "채택 후보 아님" in text
    assert "75.0%" in text and "60.0%" in text
    info["base"] = "convaiinnovations/laya-multilingual"
    assert "채택 후보 아님" not in train.format_report(info)
