"""systemone 판정기: HTTP `POST <SYSTEMONE_URL>/v1/systemone`(Jev, `laya serve`, `kev serve` 공통)에 묻는다.

요청 = {"state", "questions": {"kind": {type, instructions, criteria}}, "model"(주었을 때만)}, 키가 있으면
`Authorization: Bearer <키>`. 응답 = {"model", "answers": {"kind": {"choice", "probabilities", "confidence"}}, "usage"}.
주소와 키는 인자(--systemone-url, --systemone-key) 또는 환경 변수 SYSTEMONE_URL, SYSTEMONE_KEY 에서만 받는다.
주소가 없으면 건너뛴다(JudgeUnavailable). `.env` 는 읽지 않는다. 표준 라이브러리(urllib)만 쓴다.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from collections.abc import Callable
from typing import Any

from decision.judges import Judge, JudgeUnavailable, Judgment, question_of
from decision.judges.laya import answer_judgment
from decision.schema import QUESTION_ID

PATH = "/v1/systemone"
TIMEOUT_S = 60

# (url, body bytes, headers) → 응답 JSON. 테스트가 흉내 낸 것을 끼운다.
Transport = Callable[[str, bytes, dict[str, str]], dict[str, Any]]


def urllib_transport(url: str, body: bytes, headers: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310 - 주소는 운영자가 준다
        return json.loads(response.read().decode("utf-8"))


class SystemoneJudge(Judge):
    name = "systemone"

    def __init__(self, url: str, key: str | None = None, model: str = "", transport: Transport = urllib_transport) -> None:
        self.url = url.rstrip("/") + PATH if not url.rstrip("/").endswith(PATH) else url.rstrip("/")
        self.key = key
        self.model = model
        self.transport = transport

    @classmethod
    def from_env(cls, model: str = "", url: str | None = None, key: str | None = None, **options: Any) -> SystemoneJudge:
        url = url or os.environ.get("SYSTEMONE_URL")
        key = key or os.environ.get("SYSTEMONE_KEY")
        if not url:
            raise JudgeUnavailable("SYSTEMONE_URL(또는 --systemone-url)이 없어 systemone 판정기를 건너뛴다")
        return cls(url=url, key=key, model=model, **options)

    def body(self, row: dict[str, Any]) -> dict[str, Any]:
        body: dict[str, Any] = {"state": row["state"], "questions": {QUESTION_ID: question_of(row)}}
        if self.model:
            body["model"] = self.model
        return body

    def judge(self, row: dict[str, Any]) -> Judgment:
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        data = json.dumps(self.body(row), ensure_ascii=False).encode("utf-8")
        started = time.perf_counter()
        result = self.transport(self.url, data, headers)
        return answer_judgment(result, round((time.perf_counter() - started) * 1000))
