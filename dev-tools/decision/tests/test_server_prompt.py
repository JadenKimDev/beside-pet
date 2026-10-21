import pytest

from decision.server_prompt import load_reply_prompt, parse_reply_prompt


def test_reads_the_real_reply_prompt() -> None:
    prompt = load_reply_prompt()
    assert {"Intro", "Task", "Deepen", "Retry", "Closing"} <= set(prompt.guides)
    assert set(prompt.guides) == set(prompt.seeds)
    system = prompt.system(phase="Deepen", pet_name="콩이", language="ko")
    assert '"콩이"' in system and "Respond ONLY in Korean" in system
    assert prompt.guides["Deepen"] in system
    assert "{" not in system
    assert "English" in prompt.system(phase="Intro", pet_name="Milo", language="en")


def test_fails_loudly_when_shape_changes() -> None:
    with pytest.raises(ValueError):
        parse_reply_prompt("fn something_else() {}\n")
