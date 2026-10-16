// 레포와 바깥 세계(파일, git, gh, 셸)에 닿는 부분. 판정 규칙은 여기 두지 않는다.

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { SourceFile } from "@beside-pet/dev-checks/code-rules";

import type { RepoProbe } from "./actions.ts";
import { isCodeFile } from "./code-rules.ts";
import { CONFIG_FILE, type ProjectConfig, parseConfig } from "./config.ts";
import type { Ledger, Outcome } from "./ledger.ts";

export function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

/** 레포 루트의 `project.config.json`. 없으면 어디에 만들어야 하는지 말하며 던진다. */
export function readConfig(root: string): ProjectConfig {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`${CONFIG_FILE} 이 레포 루트에 없습니다: ${path}`);
  }
  return parseConfig(readFileSync(path, "utf8"));
}

export function ledgerDir(root: string): string {
  return join(root, "docs", "ledger");
}

export function prdDir(root: string): string {
  return join(root, "docs", "prd");
}

export function ledgerPath(root: string, issue: number): string {
  return join(ledgerDir(root), `${issue}.json`);
}

export function outcomesPath(root: string): string {
  return join(ledgerDir(root), "outcomes.jsonl");
}

export function readLedger(root: string, issue: number): Ledger {
  const path = ledgerPath(root, issue);
  if (!existsSync(path)) {
    throw new Error(`원장이 없습니다: docs/ledger/${issue}.json — 'pnpm ledger:new <PRD 파일>' 로 먼저 만드세요`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Ledger;
}

export function writeLedger(root: string, ledger: Ledger): void {
  mkdirSync(ledgerDir(root), { recursive: true });
  writeFileSync(ledgerPath(root, ledger.issue), `${JSON.stringify(ledger, null, 2)}\n`);
}

export function removeLedger(root: string, issue: number): void {
  rmSync(ledgerPath(root, issue));
}

export function listLedgers(root: string): Ledger[] {
  const dir = ledgerDir(root);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Ledger);
}

export function appendOutcome(root: string, record: Outcome): void {
  mkdirSync(ledgerDir(root), { recursive: true });
  appendFileSync(outcomesPath(root), `${JSON.stringify(record)}\n`);
}

export function readOutcomes(root: string): Outcome[] {
  const path = outcomesPath(root);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Outcome);
}

export function fileProbe(root: string): RepoProbe {
  return {
    nodePackage(dir) {
      const path = join(root, dir, "package.json");
      if (!existsSync(path)) {
        return null;
      }
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { name?: string; scripts?: Record<string, string> };
      return pkg.name ? { name: pkg.name, scripts: Object.keys(pkg.scripts ?? {}) } : null;
    },
  };
}

/** 이 레포의 `owner/repo`. `project.config.json` 의 `repo` 가 먼저이고, 비었으면 `origin` 원격에서 읽는다. */
export function repoSlug(root: string): string {
  const configured = readConfig(root).repo;
  if (configured !== null) {
    return configured;
  }
  let url: string;
  try {
    url = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`${CONFIG_FILE} 의 repo 가 비었고 origin 원격도 없습니다. repo 에 owner/name 을 적으세요`);
  }
  const match = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(url);
  if (!match) {
    throw new Error(`origin 이 GitHub 주소가 아닙니다: ${url}`);
  }
  return match[1]!;
}

/**
 * 정해 둔 계정으로 `gh` 를 부른다. `gh` 는 머신의 활성 계정을 따르므로 `project.config.json` 의 `ghUser`
 * (비었으면 레포 소유 계정)의 토큰을 꺼내 넘긴다 (`CLAUDE.md` "계정"). 그 토큰이 없으면 활성 계정으로 시도한다.
 */
export function gh(root: string, args: string[], options: { repo: boolean } = { repo: true }): string {
  const slug = repoSlug(root);
  const user = readConfig(root).ghUser ?? slug.split("/")[0]!;
  const env = { ...process.env };
  try {
    env.GH_TOKEN = execFileSync("gh", ["auth", "token", "--user", user], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // 활성 계정으로 시도한다.
  }
  // 프로젝트 명령(`gh project …`)은 `-R` 을 받지 않는다.
  const full = options.repo ? [...args, "-R", slug] : args;
  return execFileSync("gh", full, { encoding: "utf8", env, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
}

/** 검증 명령 하나를 레포 루트에서 돌리고 통과 여부를 돌려준다. 출력은 그대로 흘려보낸다. */
export function runCommand(root: string, command: string): boolean {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  return result.status === 0;
}

/** git 이 추적하는 파일 (레포 루트 기준 경로). */
export function trackedFiles(root: string, paths: readonly string[]): string[] {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--", ...paths], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((p) => p !== "");
}

/** git 이 추적하는 파일 가운데 `keep` 이 고른 것을 읽는다. 추적되지만 지워진 파일은 건너뛴다. 경로는 레포 루트 기준. */
export function readTrackedSources(
  root: string,
  paths: readonly string[],
  keep: (path: string) => boolean = isCodeFile,
): SourceFile[] {
  const found: SourceFile[] = [];
  for (const path of trackedFiles(root, paths)) {
    if (!keep(path)) continue;
    const full = join(root, path);
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    found.push({ path, source: readFileSync(full, "utf8") });
  }
  return found;
}

/**
 * 주어진 경로 가운데 `.gitignore` 규칙에 걸리는 것. 이미 추적되는 파일도 규칙에 걸리면 보인다
 * (`--no-index`): 규칙이 같은 자리의 새 파일을 가리는 것을 미리 잡는다.
 */
export function ignoredPaths(root: string, paths: readonly string[]): Set<string> {
  if (paths.length === 0) {
    return new Set();
  }
  const result = spawnSync("git", ["-C", root, "check-ignore", "--no-index", "--stdin", "-z"], {
    input: `${paths.join("\0")}\0`,
    encoding: "utf8",
  });
  // 0: 하나 이상 무시됨, 1: 하나도 없음, 그 밖: 오류.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore 실패: ${result.stderr}`);
  }
  return new Set(result.stdout.split("\0").filter((p) => p !== ""));
}
