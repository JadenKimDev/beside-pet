// 장기기억 실측(`pnpm chat:eval arc`)의 인자와 보고서.
//
// - 결과는 `outputs/chat-eval/<날짜>[-<라벨>]/arc-<이름>/` 에 세션마다 `s<번호>.md`·`s<번호>.run.json`,
//   그리고 `arc.md`·`arc.run.json` 으로 남긴다. 파일은 `outputs/` 아래에만 쓴다(`chatEvalDir` 이 막는다).
// - 마크다운을 만드는 함수는 순수하고, 파일을 쓰는 함수는 따로 둔다.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ArcProbeRow, ArcSessionRun, SavedArc } from "./arc-run.ts";
import { chatEvalDir, checkCounts, personaMarkdown, reachedTask, table } from "./report.ts";

export const ARC_USAGE = `사용법: pnpm chat:eval arc --arc <이름> [--stream] [--out-label <라벨>] [--reset-qa]

  --arc <이름>         dev-tools/chat-eval/arcs/<이름>.json 의 세션들을 차례로 돌리고, 세션마다 sandbox DB 의 시각을
                       마지막 세션이 오늘이 되도록 과거로 민다(DATABASE_URL 은 127.0.0.1:5433 만)
  --stream             스트림 경로로 받는다
  --out-label <라벨>   결과 폴더를 outputs/chat-eval/<오늘>-<라벨>/ 로 둔다
  --reset-qa           시작 전에 QA 계정 본인의 세션을 서버의 삭제 API 로 모두 지운다. 남은 세션이 있는데
                       이 옵션이 없으면 시작하지 않는다(재개가 남은 세션을 집는다)

결과: outputs/chat-eval/<오늘>[-<라벨>]/arc-<이름>/s<번호>.md, s<번호>.run.json, arc.md, arc.run.json`;

export type ArcArgs = { arc: string; stream: boolean; outLabel: string | null; resetQa: boolean };

const LABEL = /^[A-Za-z0-9._-]+$/;

/** `chat:eval arc ...` 의 인자(첫 낱말 `arc` 를 포함). `--help` 면 null. 틀리면 사용법을 담아 던진다. */
export function parseArcArgs(args: string[]): ArcArgs | null {
  const [command, ...rest] = args;
  if (command !== "arc") throw new Error(`모르는 하위 명령입니다: ${command}\n${ARC_USAGE}`);
  if (rest.includes("--help") || rest.includes("-h")) return null;
  const fail = (reason: string): never => {
    throw new Error(`${reason}\n${ARC_USAGE}`);
  };
  const values: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "--arc" || arg === "--out-label") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) fail(`${arg} 에 값이 없습니다`);
      values[arg] = value as string;
    } else if (arg !== "--stream" && arg !== "--reset-qa") {
      fail(`모르는 인자입니다: ${arg}`);
    }
  }
  const arc = values["--arc"];
  if (arc === undefined) return fail("--arc <이름> 이 없습니다");
  const outLabel = values["--out-label"] ?? null;
  if (outLabel !== null && !LABEL.test(outLabel)) fail(`--out-label 은 영문, 숫자, . _ - 만 씁니다: ${outLabel}`);
  return { arc, stream: rest.includes("--stream"), outLabel, resetQa: rest.includes("--reset-qa") };
}

/** 결과 폴더. `outputs/chat-eval/<날짜>[-<라벨>]/arc-<이름>`. */
export function arcDir(root: string, date: string, outLabel: string | null, name: string, env = process.env): string {
  const dated = chatEvalDir(root, date, env);
  return join(outLabel === null ? dated : `${dated}-${outLabel}`, `arc-${name}`);
}

// ── arc.md ──

function quote(text: string | null, max = 80): string {
  if (text === null) return "-";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const flagCount = (run: ArcSessionRun): number => Object.values(checkCounts(run)).reduce((a, b) => a + b, 0);

/** 위기 기대와 실제 닫힘이 어긋나면 그 문구. */
export function crisisMismatch(run: ArcSessionRun): string | null {
  if (run.expectCrisis && run.closedBy !== "crisis") return `위기 기대인데 closedBy ${run.closedBy}`;
  if (!run.expectCrisis && run.closedBy === "crisis") return "위기 없음 기대인데 위기로 닫힘";
  return null;
}

function sessionTable(sessions: ArcSessionRun[]): string[] {
  return table(
    ["#", "라벨", "dayOffset", "밀린 날짜", "턴", "closedBy", "도달 과제", "검사 표시", "세션"],
    sessions.map((run) => [
      run.index,
      run.label,
      run.dayOffset,
      `${run.shiftedDate} (${run.shiftDays}일)`,
      run.turns.length,
      `${run.closedBy}${run.expectCrisis ? " (위기 기대)" : ""}`,
      reachedTask(run),
      flagCount(run),
      `[s${run.index}](s${run.index}.md)`,
    ]),
  );
}

function outcomeText(probe: ArcProbeRow): string {
  const { result } = probe;
  const name = result.check ?? "사람 판정";
  const detail = [
    result.found.length > 0 ? `있음: ${result.found.join(", ")}` : null,
    result.rejected.length > 0 ? `금지 낱말: ${result.rejected.join(", ")}` : null,
  ].filter((part) => part !== null);
  const mark = { pass: "✅", fail: "❌", manual: "👀", missing: "∅ 턴 없음" }[result.outcome];
  return `${mark} ${name}${detail.length > 0 ? ` (${detail.join("; ")})` : ""}`;
}

function probeTable(probes: ArcProbeRow[]): string[] {
  if (probes.length === 0) return ["probe 없음"];
  return table(
    ["세션", "턴", "type", "결과", "사용자 말", "답", "메모"],
    probes.map((probe) => [
      `s${probe.session}`,
      probe.turn,
      probe.type,
      outcomeText(probe),
      quote(probe.user, 60),
      quote(probe.answer, 160),
      probe.note ?? "",
    ]),
  );
}

/** 낱말 검사의 통과 수 / 검사 수를 검사마다. */
export function probeTally(probes: ArcProbeRow[]): Record<string, { pass: number; total: number }> {
  const tally: Record<string, { pass: number; total: number }> = {};
  for (const probe of probes) {
    const key = probe.result.check ?? probe.type;
    const entry = tally[key] ?? { pass: 0, total: 0 };
    tally[key] = entry;
    entry.total += 1;
    if (probe.result.outcome === "pass") entry.pass += 1;
  }
  return tally;
}

function summaryLines(saved: SavedArc): string[] {
  const tally = Object.entries(probeTally(saved.probes)).map(([key, { pass, total }]) =>
    key === "time_gap" || key === "after_crisis"
      ? `- ${key}: ${total}건 (사람 판정)`
      : `- ${key}: ${pass}/${total} 통과`,
  );
  const mismatches = saved.sessions.flatMap((run) => {
    const text = crisisMismatch(run);
    return text === null ? [] : [`- s${run.index}: ${text}`];
  });
  const turns = saved.sessions.reduce((sum, run) => sum + run.turns.length, 0);
  return [
    `- 세션 ${saved.sessions.length}개, 사용자 턴 ${turns}개, 검사 표시 ${saved.sessions.reduce((s, r) => s + flagCount(r), 0)}개`,
    ...(tally.length === 0 ? ["- probe 없음"] : tally),
    ...(mismatches.length === 0 ? [] : ["", "위기 기대와 어긋남:", ...mismatches]),
  ];
}

export function arcMarkdown(saved: SavedArc): string {
  const { arc } = saved;
  const facts = arc.facts.map((fact) => `- ${fact.key}: ${fact.value} (세션 ${fact.introducedInSession + 1})`);
  return `${[
    `# ${arc.name} — 장기기억 실측`,
    "",
    ...table(
      ["칸", "값"],
      [
        ["상황", arc.situation],
        ["언어", arc.language],
        ["시작", saved.startedAt],
        ["서버", saved.baseUrl],
        ["QA 세션 정리", saved.resetDeleted === null ? "안 함" : `${saved.resetDeleted}개 지움`],
      ],
    ),
    "",
    "## 요약",
    "",
    ...summaryLines(saved),
    "",
    "## 세션",
    "",
    ...sessionTable(saved.sessions),
    "",
    "## probe",
    "",
    ...probeTable(saved.probes),
    "",
    "## 심은 사실",
    "",
    ...(facts.length === 0 ? ["없음"] : facts),
  ].join("\n")}\n`;
}

// ── 파일 ──

/** 세션 하나를 `s<번호>.md`·`s<번호>.run.json` 으로 쓴다. */
export function saveArcSession(dir: string, run: ArcSessionRun): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `s${run.index}.run.json`), `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(join(dir, `s${run.index}.md`), personaMarkdown(run));
}

/** 궤적 전체를 `arc.md`·`arc.run.json` 으로 쓴다. 쓴 md 의 경로를 돌려준다. */
export function saveArc(dir: string, saved: SavedArc): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "arc.run.json"), `${JSON.stringify(saved, null, 2)}\n`);
  const md = join(dir, "arc.md");
  writeFileSync(md, arcMarkdown(saved));
  return md;
}
