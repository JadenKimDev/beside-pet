// `pnpm chat:eval` 의 두 하위 명령(run: 인물 하나씩, arc: 궤적 하나). 루트 CLI(`dev-tools/src/cli.ts`)가 부른다.
// 비밀번호는 클라이언트 안에만 있고, DB 주소는 `arc-db.ts` 안에만 있다. 여기서는 둘 다 찍지 않는다.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import { arcsDir, loadArc } from "./arc.ts";
import { openSandboxDb } from "./arc-db.ts";
import { ARC_USAGE, arcDir, parseArcArgs, saveArc, saveArcSession } from "./arc-report.ts";
import { resetQaSessions, runArc } from "./arc-run.ts";
import { createClient, loadQaAccount } from "./client.ts";
import { loadPersona, loadPersonas, personasDir } from "./persona.ts";
import {
  CHAT_EVAL_USAGE,
  chatEvalDir,
  localDate,
  parseChatEvalArgs,
  readBaseline,
  saveRun,
  turnLine,
  writeSummary,
} from "./report.ts";
import { runPersona, stdinLines } from "./runner.ts";

export async function chatEval(root: string, args: string[]): Promise<void> {
  if (args[0] === "arc") return chatEvalArc(root, args);
  const options = parseChatEvalArgs(args);
  if (options === null) {
    console.log(CHAT_EVAL_USAGE);
    return;
  }
  const dir = personasDir(root);
  if (options.persona !== null && !existsSync(join(dir, `${options.persona}.json`))) {
    throw new Error(`인물이 없습니다: ${options.persona} (${relative(root, dir)} 의 파일 이름)`);
  }
  const personas = options.persona === null ? loadPersonas(dir) : [loadPersona(join(dir, `${options.persona}.json`))];
  const date = localDate(new Date());
  const out = chatEvalDir(root, date);
  const baseline =
    options.baseline === null ? null : readBaseline(chatEvalDir(root, options.baseline), options.baseline);
  if (baseline !== null && baseline.runs.length === 0) {
    console.error(`⚠ 기준 날짜 ${baseline.date} 에 결과 json(<인물>.run.json)이 없어 기준 없이 씁니다`);
  }
  const client = createClient({ account: loadQaAccount(root) });
  await client.health();
  await client.login();
  const input = options.interactive ? stdinLines(process.stdin.isTTY ? "> " : "") : null;
  try {
    for (const persona of personas) {
      console.log(`\n▶ ${persona.name} — ${persona.situation}`);
      const result = await runPersona(persona, {
        client,
        mode: input === null ? "script" : "interactive",
        stream: options.stream,
        ...(input === null ? {} : { nextTurn: input.next }),
        onGreeting: (greeting, ms) => console.log(`  첫 인사 (${(ms / 1000).toFixed(1)}s)\n${greeting}`),
        onTurn: (turn) => console.log(turnLine(turn, input !== null)),
      });
      const flags = result.sessionFlags.map((flag) => flag.check).join(", ") || "-";
      console.log(
        `  closedBy ${result.closedBy}  세션 검사 [${flags}]  리포트 ${result.report === null ? "없음" : "있음"}`,
      );
      console.log(`  → ${relative(root, saveRun(out, { ...result, baseUrl: client.baseUrl }))}`);
    }
  } finally {
    input?.close();
  }
  console.log(`\n→ ${relative(root, writeSummary(out, date, baseline))}`);
}

/** 궤적 하나: 세션마다 대본을 돌리고 sandbox DB 의 시각을 과거로 민다. DB 주소와 비밀번호는 찍지 않는다. */
async function chatEvalArc(root: string, args: string[]): Promise<void> {
  const options = parseArcArgs(args);
  if (options === null) {
    console.log(ARC_USAGE);
    return;
  }
  const file = join(arcsDir(root), `${options.arc}.json`);
  if (!existsSync(file))
    throw new Error(`궤적이 없습니다: ${options.arc} (${relative(root, arcsDir(root))} 의 파일 이름)`);
  const arc = loadArc(file);
  const out = arcDir(root, localDate(new Date()), options.outLabel, arc.name);
  const db = await openSandboxDb(root);
  try {
    const client = createClient({ account: loadQaAccount(root) });
    await client.health();
    await client.login();
    // 밀린 세션은 남은 세션보다 created_at 이 앞서므로, 남은 세션이 있으면 재개가 그것을 집는다.
    const leftover = (await client.list()).length;
    if (leftover > 0 && !options.resetQa) {
      throw new Error(
        `QA 계정에 세션 ${leftover}개가 남아 있어 재개가 이번 궤적이 아닌 세션을 집습니다. --reset-qa 로 지우고 돌리세요`,
      );
    }
    const resetDeleted = options.resetQa ? await resetQaSessions(client) : null;
    if (resetDeleted !== null) console.log(`QA 계정의 세션 ${resetDeleted}개를 지웠습니다`);
    const saved = await runArc(arc, {
      client,
      db,
      stream: options.stream,
      resetDeleted,
      onSession: (index, session) =>
        console.log(`\n▶ ${arc.name} s${index + 1} — ${session.label} (dayOffset ${session.dayOffset})`),
      onTurn: (turn) => console.log(turnLine(turn, false)),
      onSessionDone: (run) => {
        saveArcSession(out, run);
        const moved = Object.entries(run.shiftCounts)
          .map(([table, count]) => `${table} ${count}`)
          .join(", ");
        console.log(`  closedBy ${run.closedBy}  → ${run.shiftedDate} (${run.shiftDays}일: ${moved})`);
      },
    });
    console.log(`\n→ ${relative(root, saveArc(out, saved))}`);
  } finally {
    await db.close();
  }
}
