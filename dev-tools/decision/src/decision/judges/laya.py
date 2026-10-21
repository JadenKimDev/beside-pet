"""laya 판정기: `laya.load(<모델>)` 로 choice 질문을 묻는다. 모델은 허브 id(`2nugu/laya-ko`,
`convaiinnovations/laya-multilingual`) 또는 로컬 디렉터리(`data/models/...`, decision.train 의 산출).

laya, torch, transformers 는 처음 판정할 때만 import 한다(테스트와 다른 판정기는 이 의존성 없이 돈다).
`USE_TF=0` 을 세운다(없으면 로드가 멈출 수 있다).

온도 보정: `calibration.json` = {"temperature": float, "applied_in_checkpoint": bool, ...}.
- 모델이 로컬 디렉터리이고 그 안에 calibration.json 이 있으면 읽는다. `--calibration <파일>` 로 다른 파일을 줄 수도 있다.
- applied_in_checkpoint 가 true 면 적용하지 않는다(파인튜닝 산출은 rl_agent_config.json 의 온도를 laya.load 가 이미
  적용한다. 두 번 적용하지 않는다). 값은 보고용으로만 남는다.
- 그 칸이 없거나 false 면 probabilities 를 p_i ← softmax(log p_i / T) 로 바꾼다(로짓/T 와 같다). choice 는 바뀌지 않는다.
"""

from __future__ import annotations

import json
import math
import os
import time
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from decision.judges import Judge, Judgment, question_of
from decision.schema import QUESTION_ID

CALIBRATION_FILE = "calibration.json"


def apply_temperature(probabilities: dict[str, float], temperature: float) -> dict[str, float]:
    if temperature <= 0:
        raise ValueError("temperature 는 0 보다 커야 한다")
    logs = {k: math.log(max(p, 1e-12)) / temperature for k, p in probabilities.items()}
    top = max(logs.values())
    exps = {k: math.exp(v - top) for k, v in logs.items()}
    total = sum(exps.values())
    return {k: v / total for k, v in exps.items()}


def load_calibration(model: str, calibration: Path | None = None) -> dict[str, Any] | None:
    path = calibration
    if path is None and Path(model).is_dir() and (Path(model) / CALIBRATION_FILE).is_file():
        path = Path(model) / CALIBRATION_FILE
    if path is None:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data.get("temperature"), int | float):
        raise ValueError(f"{path}: temperature 가 수가 아니다")
    return data


class LayaJudge(Judge):
    name = "laya"

    def __init__(self, model: str = "2nugu/laya-ko", calibration: Path | None = None, agent: Any = None) -> None:
        self.model = model
        self.calibration = load_calibration(model, calibration)
        self._agent = agent

    @property
    def temperature(self) -> float | None:
        """probabilities 에 이 판정기가 적용하는 온도. 체크포인트가 이미 적용했으면 None."""
        if self.calibration is None or self.calibration.get("applied_in_checkpoint"):
            return None
        return float(self.calibration["temperature"])

    def agent(self) -> Any:
        if self._agent is None:
            os.environ.setdefault("USE_TF", "0")
            import laya  # noqa: PLC0415 - 무거운 의존성은 실제로 판정할 때만 들인다

            self._agent = laya.load(self.model)
        return self._agent

    def judge_many(self, rows: Sequence[dict[str, Any]]) -> list[Judgment]:
        # 첫 추론은 장치 준비가 섞여 느리므로 한 번 돌려 버리고 잰다.
        if rows:
            self.agent().predict(rows[0]["state"], {QUESTION_ID: question_of(rows[0])})
        return super().judge_many(rows)

    def judge(self, row: dict[str, Any]) -> Judgment:
        agent = self.agent()
        started = time.perf_counter()
        result = agent.predict(row["state"], {QUESTION_ID: question_of(row)})
        latency_ms = round((time.perf_counter() - started) * 1000)
        return answer_judgment(result, latency_ms, self.temperature)


def answer_judgment(result: dict[str, Any], latency_ms: int, temperature: float | None = None) -> Judgment:
    """Laya·systemone 응답({"answers": {"kind": {"choice", "probabilities", ...}}})을 Judgment 로."""
    answer = (result.get("answers") or {}).get(QUESTION_ID) or {}
    probabilities = answer.get("probabilities")
    if isinstance(probabilities, dict):
        probabilities = {str(k): float(v) for k, v in probabilities.items()}
        if temperature is not None:
            probabilities = apply_temperature(probabilities, temperature)
    else:
        probabilities = None
    choice = answer.get("choice")
    judgment: Judgment = {"choice": choice if isinstance(choice, str) else None, "probabilities": probabilities,
                          "latency_ms": latency_ms}
    if judgment["choice"] is None:
        judgment["error"] = "응답에 choice 가 없다"
    return judgment
