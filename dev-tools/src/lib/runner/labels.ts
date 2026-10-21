// 이슈 라벨 바꾸기의 계획. 러너가 쓰는 라벨이 레포에 아직 없으면 먼저 만든다.
// gh 를 부르는 일은 CLI(`pnpm issue:label`)가 하고, 여기서는 무엇을 만들고 붙이고 뗄지만 정한다.

/** 러너가 쓰는 라벨과 새로 만들 때의 색, 설명. 목록에 없는 라벨도 만들 수 있다(회색, 설명 없음). */
export const KNOWN_LABELS: Record<string, { color: string; description: string }> = {
  "run:implement": { color: "1d76db", description: "이 Mac 의 러너가 PRD 를 구현한다" },
  "run:again": { color: "5319e7", description: "같은 워크트리에서 러너를 한 번 더 돌린다" },
  "run:blocked": { color: "b60205", description: "러너가 막혀 사람이 이어 해야 한다" },
  "review:ready": { color: "0e8a16", description: "러너가 끝냈다. 댓글을 보고 닫는다" },
};

export interface LabelPlan {
  /** 레포에 없어 먼저 만들 라벨. */
  create: { name: string; color: string; description: string }[];
  add: string[];
  /** 레포에 있는 것만 뗀다. 없는 라벨을 떼라고 하면 gh 가 실패한다. */
  remove: string[];
}

/** `"a,b, c"` 를 낱낱으로. 빈 칸과 겹침은 뺀다. */
export function splitLabels(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  ];
}

export function planLabels(existing: readonly string[], add: readonly string[], remove: readonly string[]): LabelPlan {
  const both = add.filter((name) => remove.includes(name));
  if (both.length > 0) {
    throw new Error(`같은 라벨을 붙이고 뗄 수 없습니다: ${both.join(", ")}`);
  }
  const have = new Set(existing);
  return {
    create: add
      .filter((name) => !have.has(name))
      .map((name) => ({ name, ...(KNOWN_LABELS[name] ?? { color: "ededed", description: "" }) })),
    add: [...add],
    remove: remove.filter((name) => have.has(name)),
  };
}
