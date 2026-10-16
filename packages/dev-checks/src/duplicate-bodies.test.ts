// 같은 몸체의 함수 규칙의 단위 테스트.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { duplicateBodies, functionBodies } from "./duplicate-bodies.ts";

/** 안쪽 줄이 `count` 줄인 몸체. `{` 와 `}` 는 따로 한 줄씩이다. */
function body(count: number, word = "total"): string[] {
  const inner: string[] = [];
  for (let i = 0; i < count; i += 1) inner.push(`    ${word} += ${i};`);
  return inner;
}

function rustFn(name: string, count: number, word?: string): string {
  return [`pub fn ${name}(total: &mut u32) {`, ...body(count, word), "}"].join("\n");
}

function tsFn(name: string, count: number, word?: string): string {
  return [`export function ${name}(total: number): number {`, ...body(count, word), "  return total;", "}"].join("\n");
}

function tsArrow(name: string, count: number, word?: string): string {
  return [
    `export const ${name} = async (total: number): Promise<{ n: number }> => {`,
    ...body(count, word),
    "  return total;",
    "};",
  ].join("\n");
}

describe("functionBodies", () => {
  it("Rust 함수의 이름, 줄, 안쪽 줄 수를 뽑는다", () => {
    const source = ["//! m", "", rustFn("alpha", 12), "", "fn beta() -> u32 { 1 }"].join("\n");
    const found = functionBodies({ path: "a/m.rs", source });
    assert.deepEqual(
      found.map(({ file, name, line, lines }) => ({ file, name, line, lines })),
      [
        { file: "a/m.rs", name: "alpha", line: 3, lines: 12 },
        { file: "a/m.rs", name: "beta", line: 18, lines: 0 },
      ],
    );
  });

  it("몸체 없는 trait 선언은 뺀다", () => {
    const source = "trait T {\n    fn a(&self) -> u32;\n    fn b(&self) -> u32 {\n        1\n    }\n}\n";
    assert.deepEqual(
      functionBodies({ path: "t.rs", source }).map((f) => f.name),
      ["b"],
    );
  });

  it("where 절과 제네릭, 문자열 속 중괄호를 넘는다", () => {
    const source = [
      "fn g<T>(x: T) -> Vec<T>",
      "where",
      "    T: Clone,",
      "{",
      '    let s = "}}}";',
      "    let c = '{';",
      "    vec![x]",
      "}",
      "fn after() {}",
    ].join("\n");
    const found = functionBodies({ path: "g.rs", source });
    assert.deepEqual(
      found.map((f) => [f.name, f.lines]),
      [
        ["g", 3],
        ["after", 0],
      ],
    );
  });

  it("TS 의 function 과 화살표 함수를 뽑고, 반환 타입의 중괄호를 몸체로 보지 않는다", () => {
    const source = [
      tsFn("one", 3),
      tsArrow("two", 3),
      "function three(): { a: number } {",
      "  return { a: 1 };",
      "}",
    ].join("\n");
    const found = functionBodies({ path: "x.ts", source });
    assert.deepEqual(
      found.map((f) => [f.name, f.lines]),
      [
        ["one", 4],
        ["two", 4],
        ["three", 1],
      ],
    );
  });

  it("반환 타입이 문자열 글자로 끝나도 그 뒤 중괄호는 몸체다", () => {
    const source = [
      'function pick(a: number): Kind | "none" {',
      "  const b = a;",
      "  return b;",
      "}",
      "function next() {",
      "  return 1;",
      "}",
    ].join("\n");
    const found = functionBodies({ path: "x.ts", source });
    assert.deepEqual(
      found.map((f) => [f.name, f.line, f.lines]),
      [
        ["pick", 1, 2],
        ["next", 5, 1],
      ],
    );
  });

  it("주석과 공백만 다른 몸체는 해시가 같고, 글이 다르면 해시가 다르다", () => {
    const a = rustFn("a", 12);
    const b = rustFn("b", 12)
      .replace("total += 3;", "total  +=  3; // note")
      .replace("total += 4;", "/* x */ total += 4;");
    const c = rustFn("c", 12, "other");
    const [fa, fb, fc] = [a, b, c].map((s) => functionBodies({ path: "x.rs", source: s })[0]!);
    assert.equal(fa!.hash, fb!.hash);
    assert.notEqual(fa!.hash, fc!.hash);
  });

  it("문자열이 다른 몸체는 해시가 다르다", () => {
    const a = functionBodies({ path: "x.rs", source: 'fn a() { f("x"); }' })[0]!;
    const b = functionBodies({ path: "x.rs", source: 'fn b() { f("y"); }' })[0]!;
    assert.notEqual(a.hash, b.hash);
  });
});

describe("duplicateBodies", () => {
  it("이름이 다른 같은 몸체를 한 묶음으로 돌려준다(파일을 넘어서도)", () => {
    const groups = duplicateBodies([
      { path: "a/one.rs", source: rustFn("first", 12) },
      { path: "b/two.rs", source: `${rustFn("unrelated", 12, "other")}\n${rustFn("second", 12)}` },
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]!.functions, [
      { file: "a/one.rs", line: 1, name: "first" },
      { file: "b/two.rs", line: 15, name: "second" },
    ]);
    assert.ok(groups[0]!.hash.length > 0);
  });

  it("안쪽이 열 줄 이하인 몸체는 뺀다", () => {
    const groups = duplicateBodies([{ path: "a.rs", source: `${rustFn("x", 10)}\n${rustFn("y", 10)}` }]);
    assert.deepEqual(groups, []);
  });

  it("문턱을 인자로 받는다", () => {
    const groups = duplicateBodies([{ path: "a.rs", source: `${rustFn("x", 5)}\n${rustFn("y", 5)}` }], 5);
    assert.equal(groups.length, 1);
  });

  it("이름까지 같은 것만 모였으면 어김이 아니다", () => {
    const groups = duplicateBodies([
      { path: "a.rs", source: rustFn("new", 12) },
      { path: "b.rs", source: rustFn("new", 12) },
    ]);
    assert.deepEqual(groups, []);
  });

  it("TS 의 function 과 화살표 함수가 같은 몸체면 잡는다", () => {
    const groups = duplicateBodies([
      { path: "a.ts", source: tsFn("left", 12) },
      { path: "b.tsx", source: tsArrow("right", 12) },
    ]);
    assert.deepEqual(
      groups.map((g) => g.functions.map((f) => f.name)),
      [["left", "right"]],
    );
  });
});
