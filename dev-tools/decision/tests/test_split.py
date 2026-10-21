import json
from pathlib import Path

import pytest

from decision import split


def chat(**counts: int) -> split.Counts:
    return {p: {"chat-eval": n} for p, n in counts.items()}


def test_eval_is_closest_to_twenty_percent_and_disjoint() -> None:
    counts = chat(a=100, b=60, c=20, d=12, e=8)
    result = split.split(counts)
    assert set(result["train_personas"]).isdisjoint(result["eval_personas"])
    assert set(result["train_personas"]) | set(result["eval_personas"]) == set(counts)
    assert result["eval_personas"] == ["c", "d", "e"]


def test_eval_needs_thirty_chat_eval_rows_when_possible() -> None:
    counts = {
        "a": {"chat-eval": 5, "synthetic-haiku": 50},
        "b": {"chat-eval": 30, "synthetic-haiku": 40},
        "c": {"chat-eval": 40, "synthetic-haiku": 50},
        "d": {"chat-eval": 75, "synthetic-haiku": 80},
    }
    eval_personas = split.choose_eval(counts)
    assert sum(counts[p]["chat-eval"] for p in eval_personas) >= 30
    assert eval_personas == ["b"]


def test_both_sources_stay_proportional() -> None:
    counts = {
        "only-chat": {"chat-eval": 40},
        "only-synth": {"synthetic-haiku": 40},
        "mixed": {"chat-eval": 20, "synthetic-haiku": 20},
        "big": {"chat-eval": 140, "synthetic-haiku": 140},
    }
    # 전체: chat 200, synth 200 → 목표 40, 40. mixed 하나(20, 20)는 30 미만이라 탈락, only-chat+only-synth 가 맞다.
    assert split.choose_eval(counts) == ["only-chat", "only-synth"]


def test_falls_back_when_no_combo_has_enough_chat_rows() -> None:
    assert split.choose_eval(chat(a=4, b=4, c=2)) in (["c"], ["a"], ["b"])


def test_split_is_deterministic_and_never_takes_everyone() -> None:
    counts = chat(a=1, b=1, c=1, d=1, e=1)
    first = split.split(counts)
    assert first == split.split(counts)
    assert len(first["eval_personas"]) == 1
    assert split.split(chat(a=100, b=1))["train_personas"]


def test_greedy_path_for_many_personas() -> None:
    counts = chat(**{f"p{i:02d}": 10 for i in range(20)})
    result = split.split(counts)
    assert sum(counts[p]["chat-eval"] for p in result["eval_personas"]) == 40
    assert result == split.split(counts)


def test_needs_two_personas() -> None:
    with pytest.raises(ValueError):
        split.split(chat(a=3))


def test_count_rows_by_persona_and_source() -> None:
    rows = [{"persona": "a", "source": "chat-eval"}, {"persona": "a", "source": "synthetic-haiku"},
            {"persona": "a", "source": "chat-eval"}]
    assert split.count_rows(rows) == {"a": {"chat-eval": 2, "synthetic-haiku": 1}}


def test_cli_writes_split(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, material: Path) -> None:
    from decision.extract import extract_candidates
    from decision.jsonl import write_jsonl

    candidates = tmp_path / "candidates.jsonl"
    write_jsonl(candidates, extract_candidates(material))
    out = tmp_path / "split.json"
    monkeypatch.setattr(split, "CANDIDATES_PATH", candidates)
    monkeypatch.setattr(split, "SPLIT_PATH", out)
    monkeypatch.setattr(split, "PROJECT_DIR", tmp_path)
    assert split.main([]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert sorted(data) == ["eval_personas", "train_personas"]
    assert sorted(data["eval_personas"] + data["train_personas"]) == ["fake-bird", "fake-dog"]


def test_format_split_is_valid_json_and_wraps_long_lists() -> None:
    short = {"train_personas": ["a", "b"], "eval_personas": ["c"]}
    assert split.format_split(short) == '{\n  "train_personas": ["a", "b"],\n  "eval_personas": ["c"]\n}\n'
    long = {"train_personas": [f"persona-{i:02d}" for i in range(12)], "eval_personas": ["c"]}
    text = split.format_split(long)
    assert json.loads(text) == long
    assert '    "persona-00",\n' in text
