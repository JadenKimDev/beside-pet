// 주석과 문자열 지우기의 단위 테스트. 자리(줄과 칸)가 그대로인지와 지울 것만 지우는지를 본다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankCommentsAndStrings } from "./source-text.ts";

describe("blankCommentsAndStrings (rust)", () => {
  it("줄 주석, 문서 주석, 겹친 블록 주석을 지우고 줄 수와 길이를 지킨다", () => {
    const source = ["let a = 1; // any {", "/// doc {", "/* x /* y */ z { */ let b = 2;"].join("\n");
    const out = blankCommentsAndStrings(source, "rust");
    assert.equal(out.length, source.length);
    assert.equal(out.split("\n").length, 3);
    assert.ok(!out.includes("{"));
    assert.ok(out.includes("let a = 1;"));
    assert.ok(out.includes("let b = 2;"));
  });

  it("문자열, 날 문자열, 글자 하나의 중괄호를 지우고 수명 표시는 남긴다", () => {
    const source = [
      'let s = "a { \\" }";',
      'let r = r#"x " { y"#;',
      "let c = '{';",
      "let e = '\\'';",
      "fn f<'a>(x: &'a str) -> &'a str { x }",
    ].join("\n");
    const out = blankCommentsAndStrings(source, "rust");
    assert.equal(out.length, source.length);
    assert.equal((out.match(/\{/g) ?? []).length, 1);
    assert.ok(out.includes("fn f<'a>(x: &'a str) -> &'a str { x }"));
  });

  it("여러 줄 문자열의 줄바꿈은 남긴다", () => {
    const source = 'let s = "one\ntwo {";\nlet t = 1;';
    const out = blankCommentsAndStrings(source, "rust");
    assert.equal(out.split("\n").length, 3);
    assert.ok(out.endsWith("let t = 1;"));
  });
});

describe("blankCommentsAndStrings (ts)", () => {
  it("따옴표 셋과 주석을 지운다", () => {
    const source = [
      "const a = 'x: any';",
      'const b = "{";',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 지울 대상인 TS 템플릿 글을 글자 그대로 담는다
      "const c = `t ${'}'} {`; // any",
      "/* any */ const d = 1;",
    ].join("\n");
    const out = blankCommentsAndStrings(source, "ts");
    assert.equal(out.length, source.length);
    assert.ok(!out.includes("any"));
    assert.ok(!out.includes("{"));
    assert.ok(!out.includes("}"));
    assert.ok(out.includes("const d = 1;"));
  });

  it("정규식 글자 안의 따옴표가 뒤를 문자열로 만들지 않는다", () => {
    const source = ["const re = /[\"'`]/g;", "const x: any = 1;"].join("\n");
    const out = blankCommentsAndStrings(source, "ts");
    assert.ok(out.split("\n")[1]!.includes("const x: any = 1;"));
  });

  it("나눗셈은 정규식으로 보지 않는다", () => {
    const source = "const a = b / 2; const s = 'q'; const c = d / e;";
    const out = blankCommentsAndStrings(source, "ts");
    assert.ok(out.includes("const c = d / e;"));
    assert.ok(!out.includes("q"));
  });
});
