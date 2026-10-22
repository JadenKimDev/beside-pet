// 보고서 마크다운의 작은 조각: 표와 퍼센트. 인물 md, summary, 동작 수치가 함께 쓴다.

/** 표 칸에 넣을 글: `|` 를 가리고 줄바꿈을 `<br>` 로. */
export function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function row(cells: (string | number)[]): string {
  return `| ${cells.map((c) => cell(String(c))).join(" | ")} |`;
}

export function table(header: string[], rows: (string | number)[][]): string[] {
  return [row(header), `|${header.map(() => "---").join("|")}|`, ...rows.map(row)];
}

/** 비율(0~1)을 퍼센트 글로. 없으면 `-`. */
export const percent = (rate: number | null): string => (rate === null ? "-" : `${Math.round(rate * 100)}%`);
