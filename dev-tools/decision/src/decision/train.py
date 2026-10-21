"""Laya 파인튜닝: 라벨 파일의 학습 인물 줄로 Laya 를 학습하고 온도를 보정한다.

    python -m decision.train --base convaiinnovations/laya-multilingual
    python -m decision.train --base 2nugu/laya-ko --epochs 4

학습은 `laya.train.finetune`(laya 0.4.12, github.com/NandhaKishorM/laya, Apache-2.0)을 라이브러리로 부른다.
그 레포의 `notebooks/laya_finetune_typed_decisions_mps.py` 도 같은 함수를 부르는 얇은 감싸개라 복사해 온 코드는 없다.

데이터 형식(그 스크립트와 `laya.train.items_from_rows` 를 열어 맞춤): 한 줄 = `{"state", "questions", "expected"}`
또는 `{"state", "questions", "gold"}`. 우리 줄의 `questions.kind.label` 은 Laya 가 읽지 않으므로
`expected: {"kind": <라벨>}` 로 옮기고 질문에서는 뺀다. 질문의 네 옵션(`crisis_fixed` 포함)은 추론 때와 같게 둔다.

- 학습 줄: `data/labels/final.jsonl` 가운데 `data/split.json` 의 `train_personas` 인물이고 라벨이 `crisis_fixed` 가 아닌 것.
- 평가 인물 줄은 학습과 보정에 쓰지 않고 `finetune` 의 held-out 검증(`eval_data`)으로만 준다.
- 보정: `finetune` 이 학습 줄에서 `calib_frac` 만큼을 학습 전에 떼어 `fit_temperature_map` 으로 온도를 맞추고
  `<out>/rl_agent_config.json` 에 적는다. `laya.load(<out>)` 가 그 온도를 적용하므로 판정기는 다시 적용하지 않는다.
  `<out>/calibration.json` 은 그 값을 옮겨 적은 보고용 파일이고 `applied_in_checkpoint: true` 를 단다(S2 와 합의).
- 옵션 순서 섞기(`shuffle_options=("choice",)`)를 켠다. 수용 기준의 옵션 순서 민감도(10% 이하) 때문이다.

라이선스: Laya, laya-multilingual(mmBERT) 은 Apache-2.0. `2nugu/laya-ko` 는 가중치가 Apache-2.0 이지만 모델 카드가
학습 재료로 KLUE(CC BY-SA 4.0)와 AI-Hub 말뭉치를 밝히고 가중치가 그 파생인지는 밝히지 않는다. 그래서 채택 후보는
laya-multilingual 기반만이고, laya-ko 기반은 비교용으로만 잰다.

torch, laya 는 학습할 때만 불러온다(테스트는 모델 없이 돈다).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from decision.jsonl import read_jsonl, write_jsonl
from decision.paths import DATA_DIR, PROJECT_DIR, REPO_ROOT, SPLIT_PATH
from decision.schema import QUESTION_ID, label_of, row_errors

BASES: dict[str, str] = {
    "convaiinnovations/laya-multilingual": "multilingual",
    "2nugu/laya-ko": "ko",
}
# 채택 후보가 될 수 있는 기반(라이선스, 위 머리말).
ADOPTABLE_BASES: tuple[str, ...] = ("convaiinnovations/laya-multilingual",)
EXCLUDED_LABELS: tuple[str, ...] = ("crisis_fixed",)
LABELS_PATH = DATA_DIR / "labels" / "final.jsonl"
MODELS_DIR = DATA_DIR / "models"
REPORT_DIR = REPO_ROOT / "outputs" / "decision"


def short_name(base: str) -> str:
    return BASES.get(base) or base.rstrip("/").split("/")[-1].removeprefix("laya-")


def default_out(base: str, today: dt.date) -> Path:
    return MODELS_DIR / f"laya-cliche-{today.isoformat()}-{short_name(base)}"


def select_rows(rows: Iterable[dict[str, Any]], personas: Sequence[str]) -> list[dict[str, Any]]:
    """`personas` 의 라벨이 붙은 줄 가운데 제외 라벨이 아닌 것. 형식이 틀린 줄이 있으면 멈춘다."""
    wanted = set(personas)
    chosen = []
    for row in rows:
        errors = row_errors(row, labeled=True)
        if errors:
            raise ValueError(f"{row.get('id')!r}: {'; '.join(errors)}")
        if row.get("persona") in wanted and label_of(row) not in EXCLUDED_LABELS:
            chosen.append(row)
    return chosen


def to_laya_row(row: dict[str, Any]) -> dict[str, Any]:
    """우리 줄 → `laya.train` 의 `{state, questions, expected}` 줄."""
    question = {k: v for k, v in row["questions"][QUESTION_ID].items() if k != "label"}
    return {
        "id": row["id"],
        "state": row["state"],
        "questions": {QUESTION_ID: question},
        "expected": {QUESTION_ID: label_of(row)},
    }


def read_split(path: Path) -> dict[str, list[str]]:
    split = json.loads(path.read_text(encoding="utf-8"))
    for key in ("train_personas", "eval_personas"):
        if not isinstance(split.get(key), list):
            raise ValueError(f"{path}: {key} 가 없다")
    overlap = set(split["train_personas"]) & set(split["eval_personas"])
    if overlap:
        raise ValueError(f"{path}: 학습과 평가에 같은 인물이 있다: {', '.join(sorted(overlap))}")
    return split


def choice_temperature(cfg: dict[str, Any], n_options: int) -> float:
    """옵션이 n 개인 choice 질문에 Laya 가 실제로 적용하는 온도(`Agent` 와 같은 규칙: 옵션 수 칸이 있으면 그것)."""
    size = "2" if n_options <= 2 else "3-5" if n_options <= 5 else "6-10" if n_options <= 10 else "11+"
    by_options = cfg.get("temperature_by_options") or {}
    return float(by_options.get(f"choice:{size}", cfg["temperature"][0]))


def calibration_payload(cfg: dict[str, Any], *, base: str, trained_at: str, n_options: int, calibration_items: int) -> dict:
    return {
        "temperature": choice_temperature(cfg, n_options),
        "applied_in_checkpoint": True,
        "question_id": QUESTION_ID,
        "base": base,
        "trained_at": trained_at,
        "calibration_items": calibration_items,
        "laya_temperature": [float(t) for t in cfg["temperature"]],
        "laya_temperature_by_options": {k: float(v) for k, v in (cfg.get("temperature_by_options") or {}).items()},
    }


def write_calibration(out_dir: Path, payload: dict[str, Any]) -> Path:
    path = out_dir / "calibration.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _pct(value: Any) -> str:
    return "-" if value is None else f"{value * 100:.1f}%"


def format_report(info: dict[str, Any]) -> str:
    before, after = info.get("eval_before") or {}, info.get("eval_after") or {}
    lines = [
        f"# Laya 파인튜닝 {info['name']}",
        "",
        f"- 기반: `{info['base']}`" + ("" if info["base"] in ADOPTABLE_BASES else " (라이선스상 비교용, 채택 후보 아님)"),
        f"- 산출: `{info['out']}`",
        f"- 학습 시각: {info['trained_at']}, 장치 {info['device']}",
        f"- 라벨 파일: `{info['labels']}`, 분할: `{info['split']}`",
        f"- 줄 수: 학습 인물 {info['train_rows']}줄(학습 {info['train_items']}, 보정 {info['calibration_items']}), "
        f"평가 인물 {info['eval_rows']}줄, 제외 라벨 {', '.join(EXCLUDED_LABELS)}",
        f"- 설정: 에폭 {info['epochs']}, micro-batch {info['micro_batch']} × grad-accum {info['grad_accum']}, "
        f"loss {info['loss']}, 옵션 섞기 {', '.join(info['shuffle_options']) or '없음'}",
        f"- 시간: {info['seconds']:.0f}초",
        f"- 에폭별 평균 손실: {', '.join(f'{x:.4f}' for x in info['epoch_loss'])}",
        f"- 온도(choice {info['n_options']}옵션에 적용): {info['temperature']:.3f}"
        f" (laya temperature {[round(t, 3) for t in info['laya_temperature']]})",
        "",
        "| 지표 | 학습 줄(보정 온도) | 평가 인물 학습 전 | 평가 인물 학습 뒤 |",
        "|---|---|---|---|",
        f"| 정확도 | {_pct(info.get('train_accuracy'))} | {_pct(before.get('accuracy'))} | {_pct(after.get('accuracy'))} |",
        f"| ECE | - | {_pct(before.get('ece'))} | {_pct(after.get('ece'))} |",
        "",
        f"평가 인물 줄은 학습과 보정에 쓰지 않았다(`{info.get('eval_mode')}`). 판정기 비교의 정본은 `decision:eval` 의 보고서다.",
    ]
    return "\n".join(lines) + "\n"


def _train_accuracy(out_dir: Path, rows_path: Path, device: str, max_len: int, head_max_len: int) -> float | None:
    """저장된 모델과 보정 온도로 학습 줄의 정확도를 잰다."""
    from laya import train as lt

    model, tok, cfg = lt.load_checkpoint(str(out_dir))
    dev = lt.resolve_device(device)
    model.to(dev).eval()
    items, _ = lt.items_from_rows(tok, lt.read_jsonl(str(rows_path)), max_len, head_max_len)
    if not items:
        return None
    records = lt.calibration_records(model, tok, items, dev, max_len, head_max_len, parallel=lt.uses_parallel_layout(cfg))
    return lt.evaluate_records(records, cfg.get("temperature"), cfg.get("temperature_by_options"))["accuracy"]


def run(args: argparse.Namespace) -> dict[str, Any]:
    os.environ.setdefault("USE_TF", "0")
    today = dt.date.today()
    out_dir = Path(args.out) if args.out else default_out(args.base, today)
    name = out_dir.name
    report_path = Path(args.report) if args.report else REPORT_DIR / today.isoformat() / f"train-{name}.md"

    rows = read_jsonl(Path(args.labels))
    split = read_split(Path(args.split))
    train_rows = select_rows(rows, split["train_personas"])
    eval_rows = select_rows(rows, split["eval_personas"])
    if not train_rows:
        raise ValueError("학습 줄이 없다")

    data_dir = out_dir / "data"
    train_path, eval_path = data_dir / "train.jsonl", data_dir / "eval.jsonl"
    write_jsonl(train_path, (to_laya_row(r) for r in train_rows))
    write_jsonl(eval_path, (to_laya_row(r) for r in eval_rows))

    import torch
    from laya.train import TrainConfig, finetune, resolve_device

    torch.set_float32_matmul_precision("high")
    config = TrainConfig(
        epochs=args.epochs,
        micro_batch=args.micro_batch,
        grad_accum=args.grad_accum,
        calib_frac=args.calib_frac,
        seed=26,
        max_len=1024,
        head_max_len=256,
        gradient_checkpointing=not args.no_checkpointing,
        amp=False,
        shuffle_options=("choice",),
        eval_data=str(eval_path) if eval_rows else None,
    )
    started = time.monotonic()
    summary = finetune(data=str(train_path), model_dir=args.base, output_dir=str(out_dir), config=config, device=args.device)
    seconds = time.monotonic() - started

    cfg = json.loads((out_dir / "rl_agent_config.json").read_text(encoding="utf-8"))
    n_options = len(train_rows[0]["questions"][QUESTION_ID]["criteria"])
    trained_at = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    write_calibration(
        out_dir,
        calibration_payload(cfg, base=args.base, trained_at=trained_at, n_options=n_options,
                            calibration_items=summary["calibration_items"]),
    )
    report = summary["train_report"]
    info = {
        "name": name, "base": args.base, "out": _rel(out_dir), "trained_at": trained_at,
        "device": str(resolve_device(args.device)), "labels": _rel(Path(args.labels)), "split": _rel(Path(args.split)),
        "train_rows": len(train_rows), "train_items": summary["train_items"],
        "calibration_items": summary["calibration_items"], "eval_rows": len(eval_rows),
        "epochs": args.epochs, "micro_batch": args.micro_batch, "grad_accum": args.grad_accum,
        "loss": config.loss, "shuffle_options": list(config.shuffle_options), "seconds": seconds,
        "epoch_loss": summary["epoch_loss"], "n_options": n_options,
        "temperature": choice_temperature(cfg, n_options), "laya_temperature": cfg["temperature"],
        "train_accuracy": _train_accuracy(out_dir, train_path, args.device, 1024, 256),
        "eval_before": report.get("before"), "eval_after": report.get("after"), "eval_mode": report.get("eval_mode"),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(format_report(info), encoding="utf-8")
    print(f"모델 {_rel(out_dir)}, 보고서 {_rel(report_path)}, {seconds:.0f}초")
    return info


def _rel(path: Path) -> str:
    path = path.resolve()
    for root in (PROJECT_DIR, REPO_ROOT):
        if path.is_relative_to(root):
            return str(path.relative_to(root))
    return str(path)


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="decision.train", description="Laya 를 라벨 파일로 파인튜닝한다")
    parser.add_argument("--base", required=True, help="기반 모델(허브 id 또는 로컬 디렉터리). 예: " + ", ".join(BASES))
    parser.add_argument("--out", help="산출 디렉터리. 기본 data/models/laya-cliche-<날짜>-<기반 짧은 이름>")
    parser.add_argument("--labels", default=str(LABELS_PATH))
    parser.add_argument("--split", default=str(SPLIT_PATH))
    parser.add_argument("--report", help="학습 수치 보고서. 기본 outputs/decision/<날짜>/train-<이름>.md")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--micro-batch", type=int, default=1)
    # 조사의 출발점은 32 였지만 학습 줄이 400 안팎이면 4 에폭에 52 번만 갱신한다. laya 문서(#963)가 작은
    # 데이터에서 갱신이 모자라 머리가 사전 분포로 무너진 사례를 들어, 기본을 8(약 200 번)로 둔다.
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--calib-frac", type=float, default=0.2, help="학습 줄에서 보정용으로 떼는 몫(laya 기본 0.1)")
    parser.add_argument("--device", choices=["auto", "mps", "cpu"], default="auto")
    parser.add_argument("--no-checkpointing", action="store_true")
    args = parser.parse_args(argv)
    if args.out and Path(args.out).resolve().is_relative_to(DATA_DIR.resolve()):
        if not Path(args.out).resolve().is_relative_to(MODELS_DIR.resolve()):
            parser.error("data/ 아래에 둘 때는 data/models/ 아래여야 한다(모델 파일은 레포에 넣지 않는다)")
    return args


def main(argv: list[str] | None = None) -> int:
    run(parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
