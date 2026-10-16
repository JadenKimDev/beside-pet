// 범용 타입 규칙의 단위 테스트.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { genericTypeViolations } from "./generic-types.ts";

function lines(path: string, source: string) {
  return genericTypeViolations({ path, source }).map((v) => v.line);
}

describe("genericTypeViolations (ts)", () => {
  it("any 의 네 꼴을 잡고 파일, 줄, 글을 돌려준다", () => {
    const source = [
      "const a: any = 1;",
      "const b = f<any>();",
      "const c = x as any;",
      "const d: any[] = [];",
      "const ok = company;",
    ].join("\n");
    const found = genericTypeViolations({ path: "x.ts", source });
    assert.deepEqual(
      found.map((v) => v.line),
      [1, 2, 3, 4],
    );
    assert.equal(found[0]!.file, "x.ts");
    assert.equal(found[0]!.text, "const a: any = 1;");
    assert.ok(found.every((v) => v.rule.length > 0));
  });

  it("Record<string, any> 와 유니언의 any 도 잡는다", () => {
    assert.deepEqual(lines("x.ts", "type R = Record<string, any>;\ntype U = string | any;"), [1, 2]);
  });

  it("주석과 문자열 안의 any 는 보지 않는다", () => {
    const source = ["// x: any", "const s = 'as any';", "/* <any> */", "const t = `: any`;"].join("\n");
    assert.deepEqual(lines("x.tsx", source), []);
  });

  it("unknown 은 catch, JSON.parse, 응답 본문 줄에서만 허용한다", () => {
    const source = [
      "} catch (error: unknown) {",
      "const data: unknown = JSON.parse(text);",
      "const json: unknown = await res.json();",
      "async function read(response: Response): Promise<unknown> {",
      "function take(body: unknown) {",
      "const x: unknown = 1;",
      "function f(v: unknown) {}",
    ].join("\n");
    assert.deepEqual(lines("x.ts", source), [6, 7]);
  });

  it("catch 오류를 받는 매개변수(e, err, error)의 unknown 은 허용한다", () => {
    const source = [
      "function failureOf(error: unknown): Failure {",
      "const loginError = (e: unknown) => e;",
      "onError: (err: unknown) => setFailure(failureOf(err)),",
      "function onFail(e: unknown, extra: unknown) {",
      "function take(errors: unknown) {",
      "function take(value: unknown, e: number) {",
    ].join("\n");
    assert.deepEqual(lines("x.ts", source), [4, 5, 6]);
  });

  it("객체의 키나 속성 이름인 unknown 은 타입이 아니므로 보지 않는다", () => {
    const source = [
      "  unknown: 'Other',",
      "const label = labels.unknown;",
      "const m = { unknown?: 1 };",
      "type T = { unknown: unknown };",
      "const op = (f: () => Promise<unknown>) => f;",
    ].join("\n");
    assert.deepEqual(lines("x.ts", source), [4, 5]);
  });

  it("타입 가드 선언 줄의 unknown 은 허용한다", () => {
    const source = [
      "export function isLanguage(value: unknown): value is Language {",
      "const isRow = (value: unknown): value is Row => typeof value === 'object';",
      "function isThing(value: unknown): boolean {",
      "const x: unknown = isList;",
    ].join("\n");
    assert.deepEqual(lines("x.ts", source), [3, 4]);
  });

  it("as unknown as 는 허용되는 줄에서도 어김이다", () => {
    const source = ["const a = b as unknown as C;", "const d = JSON.parse(t) as unknown as E;"].join("\n");
    assert.deepEqual(lines("x.test.ts", source), [1, 2]);
  });

  it("한 줄에 둘이 걸려도 줄은 규칙마다 한 번이다", () => {
    const found = genericTypeViolations({ path: "x.ts", source: "function f(a: any, b: any): any {}" });
    assert.equal(found.length, 1);
  });
});

describe("genericTypeViolations (rust)", () => {
  it("dyn Any 를 잡는다", () => {
    const source = [
      "fn f(x: Box<dyn Any>) {}",
      "fn g(x: &(dyn std::any::Any + Send)) {}",
      "fn h(x: Box<dyn AnyThing>) {}",
      "// Box<dyn Any>",
      'const S: &str = "dyn Any";',
    ].join("\n");
    assert.deepEqual(lines("a/b.rs", source), [1, 2]);
  });

  it("Rust 의 any 이름과 TS 규칙은 섞지 않는다", () => {
    assert.deepEqual(lines("a/b.rs", "let x: any = iter.any(|v| v);\nfn f(x: unknown) {}"), []);
  });
});
