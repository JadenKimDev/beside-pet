// GitHub 프로젝트 보드. 이슈를 보드에 올리고 Status 칸을 옮긴다.
//
// 보드는 진행 상황을 보여 주는 창이고, 판정의 정본은 원장이다. 그래서 보드에 닿지 못해도
// 러너는 멈추지 않고 이유만 알린다. 닫힌 이슈를 Done 으로 옮기는 것은 보드의 기본
// 자동화("Item closed")가 한다.

import { CONFIG_FILE } from "./config.ts";
import { gh, readConfig, repoSlug } from "./repo.ts";

export type BoardStatus = "backlog" | "in_progress";

/** 보드마다 이름이 조금씩 다르므로 흔한 이름을 차례로 찾는다. */
const STATUS_NAMES: Record<BoardStatus, string[]> = {
  backlog: ["backlog", "todo", "to do", "ready"],
  in_progress: ["in progress", "doing"],
};

export interface StatusOption {
  id: string;
  name: string;
}

/** Status 칸의 선택지 가운데 원하는 상태에 해당하는 것. 대소문자는 가리지 않는다. */
export function pickOption(options: StatusOption[], status: BoardStatus): StatusOption | undefined {
  for (const wanted of STATUS_NAMES[status]) {
    const found = options.find((option) => option.name.trim().toLowerCase() === wanted);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function issueUrl(root: string, issue: number): string {
  return `https://github.com/${repoSlug(root)}/issues/${issue}`;
}

/**
 * 이슈를 `project.config.json` 의 `boardNumber` 보드(https://github.com/users/<소유 계정>/projects/<번호>)에
 * 올리고(이미 있으면 그대로) Status 를 옮긴다. 번호가 없으면 건너뛰고 그 사실을 이유로 돌려준다.
 * 성공하면 `null`, 못 했으면 사람에게 보여 줄 이유를 돌려준다.
 */
export function syncBoard(root: string, issue: number, status: BoardStatus | null): string | null {
  const owner = repoSlug(root).split("/")[0]!;
  const boardNumber = readConfig(root).boardNumber;
  if (boardNumber === null) {
    return `${CONFIG_FILE} 에 boardNumber 가 없어 보드를 건너뜁니다`;
  }
  const project = ["--owner", owner, "--format", "json"];
  const run = (args: string[]) => gh(root, args, { repo: false });
  try {
    const item = JSON.parse(
      run(["project", "item-add", String(boardNumber), "--url", issueUrl(root, issue), ...project]),
    ) as { id: string };
    if (status === null) {
      return null;
    }
    const board = JSON.parse(run(["project", "view", String(boardNumber), ...project])) as { id: string };
    const fields = JSON.parse(run(["project", "field-list", String(boardNumber), ...project])) as {
      fields: { id: string; name: string; options?: StatusOption[] }[];
    };
    const field = fields.fields.find((f) => f.name === "Status");
    const option = field?.options ? pickOption(field.options, status) : undefined;
    if (!field || !option) {
      const names = field?.options?.map((o) => o.name).join(", ") ?? "없음";
      return `보드의 Status 칸에서 '${STATUS_NAMES[status][0]}' 에 해당하는 선택지를 찾지 못했습니다 (있는 선택지: ${names})`;
    }
    run([
      "project",
      "item-edit",
      "--id",
      item.id,
      "--project-id",
      board.id,
      "--field-id",
      field.id,
      "--single-select-option-id",
      option.id,
    ]);
    return null;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/scope/i.test(text)) {
      return "gh 토큰에 project 권한이 없습니다. 'gh auth refresh -s project' 로 권한을 더하세요";
    }
    return `보드를 갱신하지 못했습니다: ${text.split("\n").find((line) => line.trim() !== "") ?? text}`;
  }
}
