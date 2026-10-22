// 턴 추적(#37)의 표시. 서버가 sandbox 에서만 턴 분석에 `trace` 를 채운다(production 과 옛 서버에는 칸이 없다).
// 턴 표에는 블록 이름·길이와 화법 결정 한 줄만 두고, 시스템 프롬프트 전문은 `<인물>.trace.md` 에 따로 둔다.
// 모두 순수 함수다. 칸이 빠지거나 모양이 조금 달라도 던지지 않는다.

import type { TurnTrace } from "./client.ts";
import type { RunResult } from "./runner.ts";

/** 턴 k(1부터)의 추적. 분석 항목은 사용자 턴마다 하나라 순서로 맞춘다. 없으면 undefined. */
export function traceOf(run: RunResult, index: number): TurnTrace | undefined {
  const trace = run.analysis.analyses[index - 1]?.trace;
  return trace === null || typeof trace !== "object" ? undefined : trace;
}

export function hasTrace(run: RunResult): boolean {
  return run.turns.some((turn) => traceOf(run, turn.index) !== undefined);
}

/** `identity 320, pet 80, turn_style 140` 꼴. */
export function blocksText(trace: TurnTrace): string {
  const blocks = Array.isArray(trace.blocks) ? trace.blocks : [];
  return blocks.length === 0 ? "-" : blocks.map((block) => `${block.name} ${block.chars}`).join(", ");
}

/** 화법 결정 한 줄: `질문 forbid · 위로 쉼 · 어미 피함 "요" · 상투구 넘김 2 · 판정 줄 · 짧은 말 · 넘김 feelingGuess`. */
export function decisionText(trace: TurnTrace): string {
  const style = trace.turnStyle;
  if (style === undefined || style === null) return "-";
  const parts: string[] = [];
  if (style.questionPolicy !== undefined) parts.push(`질문 ${style.questionPolicy}`);
  if (style.reassureCooldown === true) parts.push("위로 쉼");
  if (typeof style.endingAvoid === "string" && style.endingAvoid !== "") parts.push(`어미 피함 "${style.endingAvoid}"`);
  if (Array.isArray(style.stockPassed) && style.stockPassed.length > 0)
    parts.push(`상투구 넘김 ${style.stockPassed.join(", ")}`);
  if (style.judgeLine === true) parts.push("판정 줄");
  if (style.shortRule === true) parts.push("짧은 말");
  if (Array.isArray(style.actionRule) && style.actionRule.length > 0) parts.push(`넘김 ${style.actionRule.join(", ")}`);
  return parts.length === 0 ? "-" : parts.join(" · ");
}

/** 턴 표의 추적 칸. 추적이 없는 턴은 `-`. */
export function traceCell(run: RunResult, index: number): string {
  const trace = traceOf(run, index);
  if (trace === undefined) return "-";
  const version = trace.promptVersion === undefined ? "" : `v${trace.promptVersion}\n`;
  return `${version}${blocksText(trace)}\n${decisionText(trace)}`;
}

/** 본문에 든 가장 긴 백틱 줄보다 긴 울타리. */
function fence(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(longest + 1);
}

/** 인물 하나의 추적 보고서. 추적이 하나도 없으면 null(파일을 쓰지 않는다). */
export function traceMarkdown(run: RunResult): string | null {
  if (!hasTrace(run)) return null;
  const lines = [
    `# ${run.persona.name} — 턴 추적`,
    "",
    `세션 ${run.sessionId}. 전사는 \`${run.persona.name}.md\` 에 있다. sandbox 서버의 턴 분석 \`trace\` 를 그대로 옮긴다.`,
  ];
  for (const turn of run.turns) {
    const trace = traceOf(run, turn.index);
    lines.push("", `## 턴 ${turn.index}`, "");
    if (trace === undefined) {
      lines.push("추적 없음");
      continue;
    }
    const prompt = typeof trace.systemPrompt === "string" ? trace.systemPrompt : "";
    const mark = fence(prompt);
    lines.push(
      `- 프롬프트 버전: ${trace.promptVersion ?? "-"}`,
      `- 블록: ${blocksText(trace)}`,
      `- 화법 결정: ${decisionText(trace)}`,
      "",
      "### 시스템 프롬프트",
      "",
      prompt === "" ? "없음" : `${mark}text\n${prompt}\n${mark}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
