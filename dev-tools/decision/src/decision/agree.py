"""두 라벨 파일의 일치율, Cohen's kappa, 불일치 목록."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from decision.schema import label_of


def cohen_kappa(a: list[str], b: list[str]) -> float:
    if len(a) != len(b) or not a:
        raise ValueError("두 라벨 목록의 길이가 같고 비지 않아야 한다")
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b, strict=True)) / n
    count_a, count_b = Counter(a), Counter(b)
    expected = sum(count_a[k] * count_b[k] for k in count_a.keys() | count_b.keys()) / (n * n)
    if expected == 1.0:
        return 1.0 if observed == 1.0 else 0.0
    return (observed - expected) / (1 - expected)


@dataclass
class Agreement:
    matched: int
    agreement: float
    kappa: float
    disagreements: list[dict[str, Any]]
    only_a: list[str] = field(default_factory=list)
    only_b: list[str] = field(default_factory=list)
    unlabeled: list[str] = field(default_factory=list)


def compare(rows_a: list[dict[str, Any]], rows_b: list[dict[str, Any]]) -> Agreement:
    by_a = {row["id"]: row for row in rows_a}
    by_b = {row["id"]: row for row in rows_b}
    common = [row_id for row_id in by_a if row_id in by_b]
    labels_a: list[str] = []
    labels_b: list[str] = []
    disagreements: list[dict[str, Any]] = []
    unlabeled: list[str] = []
    for row_id in common:
        la, lb = label_of(by_a[row_id]), label_of(by_b[row_id])
        if la is None or lb is None:
            unlabeled.append(row_id)
            continue
        labels_a.append(la)
        labels_b.append(lb)
        if la != lb:
            disagreements.append({"id": row_id, "state": by_a[row_id]["state"], "a": la, "b": lb})
    if not labels_a:
        raise ValueError("id 로 맞춘 라벨 쌍이 없다")
    agreement = sum(x == y for x, y in zip(labels_a, labels_b, strict=True)) / len(labels_a)
    return Agreement(
        matched=len(labels_a),
        agreement=agreement,
        kappa=cohen_kappa(labels_a, labels_b),
        disagreements=disagreements,
        only_a=[row_id for row_id in by_a if row_id not in by_b],
        only_b=[row_id for row_id in by_b if row_id not in by_a],
        unlabeled=unlabeled,
    )
