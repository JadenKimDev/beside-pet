// PRD 머리말(frontmatter) 읽기. PRD 가 쓰는 범위만 다룬다: `key: value`,
// `key: [a, b]`, 그리고 `key:` 아래에 `- item` 을 늘어놓는 목록.

export type Frontmatter = Record<string, string | string[]>;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(value: string): string[] {
  return value
    .slice(1, -1)
    .split(",")
    .map(unquote)
    .filter((item) => item.length > 0);
}

/** 문서를 머리말과 본문으로 나눈다. 머리말이 없으면 `data` 는 비어 있다. */
export function splitFrontmatter(text: string): { data: Frontmatter; body: string } {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { data: {}, body: text };
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    throw new Error("머리말을 닫는 '---' 가 없습니다");
  }

  const data: Frontmatter = {};
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) {
      throw new Error(`머리말에서 읽을 수 없는 줄: ${line}`);
    }
    const key = pair[1]!;
    const value = pair[2]!.trim();
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = parseInlineList(value);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, body: lines.slice(end + 1).join("\n") };
}

export function asString(data: Frontmatter, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

export function asList(data: Frontmatter, key: string): string[] {
  const value = data[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** 머리말의 값 하나를 바꾸거나, 없으면 끝에 더한다. 나머지 줄은 그대로 둔다. */
export function setFrontmatter(text: string, key: string, value: string): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
    throw new Error("머리말이 없습니다");
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    throw new Error("머리말을 닫는 '---' 가 없습니다");
  }
  const at = lines.findIndex((line, i) => i > 0 && i < end && line.startsWith(`${key}:`));
  if (at === -1) {
    lines.splice(end, 0, `${key}: ${value}`);
  } else {
    lines[at] = `${key}: ${value}`;
  }
  return lines.join("\n");
}
