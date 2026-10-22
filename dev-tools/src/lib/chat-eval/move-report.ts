// 동작 수치(#37)를 실행 결과에서 구해 보고서 조각으로 만든다. 검사 자체는 `moves.ts` 에 있다.

import { percent, table } from "./markdown.ts";
import {
  greetingOverlap,
  greetingOverlapText,
  lengthSpread,
  lengthSpreadText,
  MOVE_IDS,
  type MoveId,
  moveRates,
  movesIn,
} from "./moves.ts";
import { petNamesOf } from "./persona.ts";
import type { RunResult, TurnRecord } from "./runner.ts";

/** 이 수준부터 위기 턴이다. 위기 턴의 답은 고정 안내라 동작과 길이 수치에서 뺀다. */
const CRISIS_LEVEL = 3;

/** 모델이 쓴 답의 턴(위기 턴 제외). */
function modelTurns(run: RunResult): TurnRecord[] {
  return run.turns.filter((turn) => turn.supportLevel < CRISIS_LEVEL);
}

/** 감정 추정·뜻 부여·허락의 담긴 턴 비율(0~1, `any` 는 셋 중 하나라도). 위기 턴은 뺀다. */
export function runMoveRates(run: RunResult) {
  return moveRates(modelTurns(run));
}

/** 답 길이의 평균과 표준편차. 위기 턴은 뺀다. */
export function runLengthSpread(run: RunResult) {
  return lengthSpread(modelTurns(run).map((turn) => turn.answer));
}

/** 인물 전부를 합친, 셋 중 하나라도 담긴 턴 수와 전체 턴 수(위기 턴과 빈 답 제외). `12/21 (57%)` 꼴. */
export function movesTotalText(runs: RunResult[]): string | null {
  const turns = runs.flatMap(modelTurns).filter((turn) => turn.answer.trim() !== "");
  if (turns.length === 0) return null;
  const hit = turns.filter((turn) => movesIn(turn.answer, turn.user).length > 0).length;
  return `${hit}/${turns.length} (${percent(hit / turns.length)})`;
}

const MOVE_LABEL: Record<MoveId, string> = { feelingGuess: "추정", meaningGiven: "뜻", permission: "허락" };

/** 턴 하나의 동작 칸: `추정·허락` 꼴, 없으면 `-`. */
export function moveCell(turn: TurnRecord): string {
  const found = movesIn(turn.answer, turn.user);
  return found.length === 0 ? "-" : found.map((id) => MOVE_LABEL[id]).join("·");
}

/** 인물들의 첫 인사에서 가장 많은 인물이 공유한 문장. */
export function runsGreetingOverlap(runs: RunResult[]) {
  return greetingOverlap(
    runs.map((run) => ({ name: run.persona.name, greeting: run.greeting, petNames: petNamesOf(run.persona) })),
  );
}

export function moveSection(run: RunResult): string[] {
  const rates = runMoveRates(run);
  return [
    "## 동작과 길이",
    "",
    "위기 턴(고정 안내)은 뺀다. 동작 패턴은 서버의 `turn_style.rs` 와 같은 문자열이다.",
    "",
    ...table(
      ["칸", "값"],
      [
        ...MOVE_IDS.map((id) => [`${id} (${MOVE_LABEL[id]})`, percent(rates[id])]),
        ["셋 중 하나라도", percent(rates.any)],
        ["lengthVariance (답 글자 수, 표준편차)", lengthSpreadText(runLengthSpread(run))],
      ],
    ),
  ];
}

/** 인물 간 첫 인사의 같은 문장. 기준이 있으면 `기준 → 지금`. */
export function greetingSection(runs: RunResult[], baselineRuns: RunResult[] | null): string[] {
  const now = runsGreetingOverlap(runs);
  const before = baselineRuns === null ? null : runsGreetingOverlap(baselineRuns);
  const text =
    baselineRuns === null ? greetingOverlapText(now) : `${greetingOverlapText(before)} → ${greetingOverlapText(now)}`;
  const lines = [
    "## 첫 인사 겹침 (greetingOverlap)",
    "",
    `가장 많은 인물이 공유한 첫 인사 문장(반려동물 이름은 자리 표시로 바꾸고, 글자 3-gram 다이스 0.8 이상을 같은 문장으로 본다. 인사 한 마디(8자 미만)는 뺀다): ${text}`,
  ];
  if (now !== null && now.shared > 1) lines.push("", `- 문장: ${now.sentence}`, `- 인물: ${now.names.join(", ")}`);
  return lines;
}
