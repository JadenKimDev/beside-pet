import json
from pathlib import Path

import pytest

from decision import synth
from decision.claude_cli import ClaudeCli
from decision.schema import row_errors
from decision.server_prompt import load_reply_prompt


def persona(name: str, turns: tuple[str, ...]) -> synth.Persona:
    return synth.Persona(name, "지어낸 인물", "ko", "콩이", turns)


def fake_runner(argv: list[str]) -> str:
    prompt = argv[-1]
    if "JSON array of pairs" in prompt:
        pairs = [[f"지어낸 말 {i}-1", f"지어낸 말 {i}-2"] for i in range(20)]
        text = "```json\n" + json.dumps(pairs, ensure_ascii=False) + "\n```"
    else:
        text = f"답 {abs(hash((prompt, argv[argv.index('--system-prompt') + 1])))}"
    return json.dumps({"is_error": False, "result": text})


def test_base_contexts_hold_at_most_two_turns() -> None:
    contexts = synth.base_contexts(persona("p", ("a", "b", "c")))
    assert contexts == [(), ("a",), ("a", "b"), ("b", "c")]


def test_plans_spread_over_contexts_and_are_deterministic() -> None:
    p = persona("p", ("a", "b", "c"))
    plans = synth.plans_for(p, synth.base_contexts(p), 8)
    assert len(plans) == 8
    assert [pl.context for pl in plans[:4]] == [(), ("a",), ("a", "b"), ("b", "c")]
    assert all(pl.phase == "Intro" for pl in plans if not pl.context)
    assert all(pl.phase != "Intro" for pl in plans if pl.context)
    assert plans == synth.plans_for(p, synth.base_contexts(p), 8)
    assert len({pl.row_id() for pl in plans}) == 8


def test_reply_request_uses_server_prompt_and_variant_but_row_has_no_hint() -> None:
    prompt = load_reply_prompt()
    plan = synth.Plan(persona("p", ("a",)), ("a", "b"), "Deepen", "generic")
    request = synth.reply_request(plan, prompt)
    assert request.model == "haiku"
    assert prompt.guides["Deepen"] in request.system_prompt
    assert synth.VARIANTS["generic"] in request.system_prompt
    assert "User: a\nUser: b" in request.prompt
    intro = synth.reply_request(synth.Plan(plan.persona, (), "Intro", "plain"), prompt)
    assert prompt.seeds["Intro"] in intro.prompt


def test_synthesize_fills_short_personas_and_writes_valid_rows(tmp_path: Path) -> None:
    client = ClaudeCli(cache_dir=tmp_path, runner=fake_runner)
    personas = [persona("short", ("하나",)), persona("long", tuple(f"말{i}" for i in range(12)))]
    rows = synth.synthesize(personas, 40, client, load_reply_prompt())
    assert len(rows) == 40
    assert all(row_errors(row, labeled=False) == [] for row in rows)
    assert {row["source"] for row in rows} == {"synthetic-haiku"}
    assert all(row["id"].startswith(f"synth/{row['persona']}#") for row in rows)
    short = [row for row in rows if row["persona"] == "short"]
    assert any(t.startswith("지어낸 말") for row in short for t in row["state"]["user_turns"])
    assert all(len(row["state"]["user_turns"]) <= 2 for row in rows)
    assert all("For this reply only" not in json.dumps(row, ensure_ascii=False) for row in rows)
    assert synth.synthesize(personas, 0, client, load_reply_prompt()) == []


def test_parse_contexts_rejects_non_json() -> None:
    with pytest.raises(ValueError):
        synth.parse_contexts("없음")
