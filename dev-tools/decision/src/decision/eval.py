"""판정기를 같은 평가셋으로 잰다.

    python -m decision.eval --judge claude --model haiku [--judge laya --model 2nugu/laya-ko ...]

평가셋: data/labels/final.jsonl(--labels 로 바꿀 수 있다) 가운데 split.json 의 eval_personas 줄, crisis_fixed 는 뺀다.
줄마다 두 번 묻는다: 원래 차례의 criteria 와, 줄 id 로 시드를 둔 다른 차례(옵션 순서 민감도).
원 결과는 outputs/decision/<날짜>/<judge>-<model>.jsonl(같은 판정기+모델은 덮어쓴다), 보고서
outputs/decision/<날짜>/report.md 는 그 날짜 디렉터리의 원 결과 파일 전부에서 다시 만든다(판정기를 따로 돌려도
행이 쌓인다). 지표: 정확도, 출처별 정확도, 라벨별 F1, 매크로 F1, ECE(확률을 주는 판정기만), 지연 p50·p95,
옵션 순서 민감도(차례를 바꿨을 때 답이 바뀐 줄의 비율).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from decision.jsonl import read_jsonl, write_jsonl
from decision.judges import DEFAULT_MODELS, JUDGES, Judge, JudgeUnavailable, Judgment, make_judge
from decision.paths import DATA_DIR, REPO_ROOT, SPLIT_PATH
from decision.schema import LABELS, QUESTION_ID, SOURCES, label_of, row_errors

LABELS_PATH = DATA_DIR / "labels" / "final.jsonl"
OUTPUT_DIR = REPO_ROOT / "outputs" / "decision"
EXCLUDED = "crisis_fixed"
# 평가하는 라벨(F1 을 내는 라벨). crisis_fixed 는 평가셋에서 빠진다.
EVAL_LABELS: tuple[str, ...] = tuple(label for label in LABELS if label != EXCLUDED)
SEED = 26
ECE_BINS = 10
REPORT_NAME = "report.md"


# ---- 평가셋


def eval_rows(rows: Sequence[dict[str, Any]], eval_personas: Sequence[str]) -> list[dict[str, Any]]:
    personas = set(eval_personas)
    chosen = []
    for row in rows:
        errors = row_errors(row, labeled=True)
        if errors:
            raise ValueError(f"{row.get('id')}: {'; '.join(errors)}")
        if row["persona"] in personas and label_of(row) != EXCLUDED:
            chosen.append(row)
    return chosen


def shuffled_order(row_id: str, labels: Sequence[str], seed: int = SEED) -> list[str]:
    """줄 id 로 시드를 둔, 원래와 다른 차례."""
    order = list(labels)
    if len(order) < 2:
        return order
    rng = random.Random(f"{seed}:{row_id}")
    while order == list(labels):
        rng.shuffle(order)
    return order


def with_order(row: dict[str, Any], order: Sequence[str]) -> dict[str, Any]:
    q = row["questions"][QUESTION_ID]
    criteria = {label: q["criteria"][label] for label in order}
    return {**row, "questions": {**row["questions"], QUESTION_ID: {**q, "criteria": criteria}}}


# ---- 돌리기


def run_judge(judge: Judge, rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """원래 차례와 바꾼 차례를 한 번에 넘긴다(claude 판정기는 이 묶음을 병렬로 돈다)."""
    orders = [shuffled_order(row["id"], list(row["questions"][QUESTION_ID]["criteria"])) for row in rows]
    asked = [*rows, *(with_order(row, order) for row, order in zip(rows, orders, strict=True))]
    judgments = judge.judge_many(asked)
    first, second = judgments[: len(rows)], judgments[len(rows) :]
    return [result_record(judge, row, j, order, s) for row, j, order, s in zip(rows, first, orders, second, strict=True)]


def result_record(judge: Judge, row: dict[str, Any], j: Judgment, order: list[str], s: Judgment) -> dict[str, Any]:
    record: dict[str, Any] = {
        "judge": judge.name,
        "model": judge.model,
        "id": row["id"],
        "persona": row["persona"],
        "source": row["source"],
        "gold": label_of(row),
        "choice": j["choice"],
        "probabilities": j["probabilities"],
        "latency_ms": j["latency_ms"],
        "shuffled_order": order,
        "shuffled_choice": s["choice"],
    }
    errors = [e for e in (j.get("error"), s.get("error")) if e]
    if errors:
        record["error"] = " | ".join(errors)
    return record


# ---- 지표


def accuracy(records: Sequence[dict[str, Any]]) -> float | None:
    if not records:
        return None
    return sum(r["choice"] == r["gold"] for r in records) / len(records)


def f1_by_label(records: Sequence[dict[str, Any]], labels: Sequence[str] = EVAL_LABELS) -> dict[str, float]:
    scores = {}
    for label in labels:
        tp = sum(r["choice"] == label and r["gold"] == label for r in records)
        fp = sum(r["choice"] == label and r["gold"] != label for r in records)
        fn = sum(r["choice"] != label and r["gold"] == label for r in records)
        scores[label] = 0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn)
    return scores


def ece(records: Sequence[dict[str, Any]], bins: int = ECE_BINS) -> float | None:
    """확신(고른 라벨의 확률)을 같은 폭 구간으로 나눈 기대 보정 오차. 확률이 없는 줄이 있으면 None."""
    if not records or any(not r.get("probabilities") or r["choice"] is None for r in records):
        return None
    buckets: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for r in records:
        confidence = float(r["probabilities"].get(r["choice"], 0.0))
        index = min(int(confidence * bins), bins - 1)
        buckets[index].append((confidence, r["choice"] == r["gold"]))
    total = len(records)
    return sum(
        len(b) / total * abs(sum(c for c, _ in b) / len(b) - sum(ok for _, ok in b) / len(b)) for b in buckets if b
    )


def percentile(values: Sequence[float], q: float) -> float | None:
    """선형 보간 백분위(numpy 의 기본과 같다)."""
    if not values:
        return None
    ordered = sorted(values)
    position = q * (len(ordered) - 1)
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def order_sensitivity(records: Sequence[dict[str, Any]]) -> float | None:
    """두 차례 모두 답을 얻은 줄 가운데 답이 바뀐 줄의 비율."""
    pairs = [r for r in records if r["choice"] is not None and r["shuffled_choice"] is not None]
    if not pairs:
        return None
    return sum(r["choice"] != r["shuffled_choice"] for r in pairs) / len(pairs)


def summarize(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    latencies = [r["latency_ms"] for r in records if r["choice"] is not None]
    f1 = f1_by_label(records)
    return {
        "judge": records[0]["judge"] if records else "",
        "model": records[0]["model"] if records else "",
        "n": len(records),
        "accuracy": accuracy(records),
        "accuracy_by_source": {s: accuracy([r for r in records if r["source"] == s]) for s in SOURCES},
        "n_by_source": {s: sum(r["source"] == s for r in records) for s in SOURCES},
        "f1": f1,
        "macro_f1": sum(f1.values()) / len(f1) if f1 else None,
        "ece": ece(records),
        "p50_ms": percentile(latencies, 0.5),
        "p95_ms": percentile(latencies, 0.95),
        "order_sensitivity": order_sensitivity(records),
        "errors": sum(1 for r in records if r.get("error")),
    }


# ---- 쓰기


def slug(text: str) -> str:
    """파일 이름에 쓸 판정기·모델 이름. 로컬 디렉터리는 마지막 이름, 허브 id 의 / 는 --."""
    if not text:
        return "default"
    path = Path(text)
    if path.is_dir() or text.startswith(("data/", "./", "/")):
        text = path.name
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text.replace("/", "--")).strip("-") or "default"


def result_path(day_dir: Path, judge: str, model: str) -> Path:
    return day_dir / f"{slug(judge)}-{slug(model)}.jsonl"


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.1f}%"


def _num(value: float | None, digits: int = 3) -> str:
    return "—" if value is None else f"{value:.{digits}f}"


def _ms(value: float | None) -> str:
    return "—" if value is None else f"{value:.0f}"


def render_report(day: str, summaries: Sequence[dict[str, Any]]) -> str:
    lines = [f"# 상투성 판정기 평가 — {day}", ""]
    if summaries:
        base = max(summaries, key=lambda s: s["n"])
        n = base["n"]
        synthetic = base["n_by_source"].get("synthetic-haiku", 0)
        lines += [
            f"평가셋 {n}줄: " + ", ".join(f"{s} {base['n_by_source'].get(s, 0)}" for s in SOURCES)
            + f". 합성 재료의 비율 {_pct(synthetic / n if n else None)}. crisis_fixed 줄은 뺐다.",
            "",
        ]
    header = ["판정기", "모델", "n", "정확도", "출처별 정확도", *(f"F1 {label}" for label in EVAL_LABELS),
              "매크로 F1", "ECE", "지연 p50 (ms)", "지연 p95 (ms)", "순서 민감도", "오류"]
    lines += ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    for s in summaries:
        by_source = " / ".join(
            f"{source} {_pct(s['accuracy_by_source'][source])} (n={s['n_by_source'][source]})" for source in SOURCES
        )
        ece_cell = _num(s["ece"]) if s["ece"] is not None else "— (확률 없음)"
        cells = [s["judge"], s["model"] or "default", str(s["n"]), _pct(s["accuracy"]), by_source,
                 *(_num(s["f1"][label]) for label in EVAL_LABELS), _num(s["macro_f1"]), ece_cell,
                 _ms(s["p50_ms"]), _ms(s["p95_ms"]), _pct(s["order_sensitivity"]), str(s["errors"])]
        lines.append("| " + " | ".join(cells) + " |")
    lines += [
        "",
        "- 순서 민감도: criteria 의 차례를 줄 id 로 시드를 둔 다른 차례로 바꿔 다시 물었을 때 답이 바뀐 줄의 비율.",
        "- claude 판정기는 확률을 주지 않아 ECE 를 잴 수 없다. 지연은 캐시에 남은 첫 호출의 값이다(claude -p 의 프로세스 시작 포함).",
        "- 원 결과: 이 디렉터리의 `<판정기>-<모델>.jsonl`.",
        "",
    ]
    return "\n".join(lines)


def write_report(day_dir: Path) -> Path:
    """그 날짜 디렉터리의 원 결과 파일 전부로 보고서를 다시 쓴다."""
    summaries = []
    for path in sorted(day_dir.glob("*.jsonl")):
        records = read_jsonl(path)
        if records:
            summaries.append(summarize(records))
    report = day_dir / REPORT_NAME
    report.write_text(render_report(day_dir.name, summaries), encoding="utf-8")
    return report


def evaluate(judge: Judge, rows: Sequence[dict[str, Any]], day_dir: Path) -> dict[str, Any]:
    records = run_judge(judge, rows)
    write_jsonl(result_path(day_dir, judge.name, judge.model), records)
    write_report(day_dir)
    return summarize(records)


# ---- 명령


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="decision.eval", description=__doc__.splitlines()[0])
    parser.add_argument("--judge", action="append", choices=JUDGES, required=True, help="여러 번 줄 수 있다")
    parser.add_argument("--model", action="append", default=[], help="--judge 와 같은 차례로 짝짓는다")
    parser.add_argument("--labels", type=Path, default=LABELS_PATH, help="라벨 파일(기본 data/labels/final.jsonl)")
    parser.add_argument("--split", type=Path, default=SPLIT_PATH)
    parser.add_argument("--date", default=dt.date.today().isoformat(), help="보고서 날짜 디렉터리(기본 오늘)")
    parser.add_argument("--limit", type=int, default=None, help="평가셋의 앞 N줄만(시험용)")
    parser.add_argument("--calibration", type=Path, default=None, help="laya: 온도 보정 파일(제로샷 허브 모델용)")
    parser.add_argument("--systemone-url", default=None, help="기본 환경 변수 SYSTEMONE_URL")
    parser.add_argument("--systemone-key", default=None, help="기본 환경 변수 SYSTEMONE_KEY")
    args = parser.parse_args(argv)
    if args.model and len(args.model) != len(args.judge):
        parser.error("--model 은 주지 않거나 --judge 와 같은 수만큼 준다")
    return args


def _options(name: str, args: argparse.Namespace) -> dict[str, Any]:
    if name == "laya":
        return {"calibration": args.calibration}
    if name == "systemone":
        return {"url": args.systemone_url, "key": args.systemone_key}
    return {}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    split = json.loads(args.split.read_text(encoding="utf-8"))
    rows = eval_rows(read_jsonl(args.labels), split["eval_personas"])
    if args.limit is not None:
        rows = rows[: args.limit]
    if not rows:
        print("평가셋이 비었다", file=sys.stderr)
        return 1
    day_dir = OUTPUT_DIR / args.date
    models = args.model or [DEFAULT_MODELS[name] for name in args.judge]
    for name, model in zip(args.judge, models, strict=True):
        try:
            judge = make_judge(name, model, **_options(name, args))
        except JudgeUnavailable as reason:
            print(f"건너뜀: {reason}")
            continue
        print(f"{name} {model or 'default'}: {len(rows)}줄 × 2 차례")
        s = evaluate(judge, rows, day_dir)
        print(f"  정확도 {_pct(s['accuracy'])}, 순서 민감도 {_pct(s['order_sensitivity'])}, 오류 {s['errors']}")
    print(day_dir / REPORT_NAME)
    return 0


if __name__ == "__main__":
    sys.exit(main())
