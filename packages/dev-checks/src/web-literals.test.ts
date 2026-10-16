// 대화 웹의 색 리터럴, 한글 리터럴 규칙의 단위 테스트. 소스는 지어낸 글이다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colorLiteralViolations,
  hangulLiteralViolations,
  inColorLiteralScope,
  inHangulLiteralScope,
} from "./web-literals.ts";

const colorLines = (source: string, path = "apps/web/components/x.tsx") =>
  colorLiteralViolations({ path, source }).map((v) => v.line);
const hangulLines = (source: string, path = "apps/web/components/x.tsx") =>
  hangulLiteralViolations({ path, source }).map((v) => v.line);

describe("inColorLiteralScope", () => {
  it("apps/web 의 ts, tsx 만 보고 theme/ 와 테스트와 선언 파일은 뺀다", () => {
    assert.equal(inColorLiteralScope("apps/web/components/ui/Button.tsx"), true);
    assert.equal(inColorLiteralScope("apps/web/lib/api.ts"), true);
    assert.equal(inColorLiteralScope("apps/web/theme/theme.ts"), false);
    assert.equal(inColorLiteralScope("apps/web/theme/contrast.test.ts"), false);
    assert.equal(inColorLiteralScope("apps/web/components/ui/Button.test.tsx"), false);
    assert.equal(inColorLiteralScope("apps/web/app/globals.css"), false);
    assert.equal(inColorLiteralScope("apps/web/next-env.d.ts"), false);
    assert.equal(inColorLiteralScope("dev-tools/src/cli.ts"), false);
  });
});

describe("inHangulLiteralScope", () => {
  it("apps/web 의 tsx 만 보고 i18n/ 과 테스트는 뺀다", () => {
    assert.equal(inHangulLiteralScope("apps/web/app/page.tsx"), true);
    assert.equal(inHangulLiteralScope("apps/web/lib/api.ts"), false);
    assert.equal(inHangulLiteralScope("apps/web/i18n/Provider.tsx"), false);
    assert.equal(inHangulLiteralScope("apps/web/app/page.test.tsx"), false);
    assert.equal(inHangulLiteralScope("apps/server/src/x.tsx"), false);
  });
});

describe("colorLiteralViolations", () => {
  it("문자열, JSX 속성, Tailwind 임의 값의 hex 를 잡고 파일, 줄, 글을 돌려준다", () => {
    const source = [
      'const a = "#fff";',
      "<svg fill='#1A2B3C' />",
      'const c = "bg-[#123456] text-white";',
      "const d = { color: `#11223344` };",
      'const e = "#abcd";',
    ].join("\n");
    const found = colorLiteralViolations({ path: "apps/web/components/x.tsx", source });
    assert.deepEqual(
      found.map((v) => v.line),
      [1, 2, 3, 4, 5],
    );
    assert.equal(found[0]!.file, "apps/web/components/x.tsx");
    assert.equal(found[0]!.text, 'const a = "#fff";');
    assert.ok(found.every((v) => v.rule.length > 0));
  });

  it("rgb, rgba, hsl, hsla 함수를 잡는다", () => {
    const source = [
      'const a = "rgb(0 0 0)";',
      "const b = 'rgba(0,0,0,.5)';",
      'const c = "bg-[hsl(200_50%_50%)]";',
      "const d = `HSLA(1, 2%, 3%, 1)`;",
    ].join("\n");
    assert.deepEqual(colorLines(source), [1, 2, 3, 4]);
  });

  it("주석의 이슈 번호와 hex 는 보지 않는다", () => {
    const source = ["// #12 에서 정함, 예전 색은 #fff", "/* rgb(0,0,0) #abcdef */", "{/* #123 */}"].join("\n");
    assert.deepEqual(colorLines(source), []);
  });

  it("URL 앵커, 글자 참조, 색이 아닌 길이, 이름의 일부는 잡지 않는다", () => {
    const source = [
      'const a = "/help#crisis";',
      'const b = "/a#abc";',
      'const c = "&#123;";',
      'const d = "#12";',
      'const e = "#12345";',
      'const f = "#fade-in";',
      'const g = "#section2";',
      "const h = toRgb(x);",
      "const i = myrgb(x);",
    ].join("\n");
    assert.deepEqual(colorLines(source), []);
  });

  it("같은 줄은 규칙마다 한 번만 돌려준다", () => {
    assert.deepEqual(colorLines('const a = ["#fff", "#000", "rgb(0,0,0)"];'), [1, 1]);
  });

  it("theme/ 아래와 테스트 파일은 보지 않는다", () => {
    assert.deepEqual(colorLines('const a = "#fff";', "apps/web/theme/tokens.ts"), []);
    assert.deepEqual(colorLines('const a = "#fff";', "apps/web/theme/tokens.test.ts"), []);
  });
});

describe("hangulLiteralViolations", () => {
  it("JSX 글, 문자열, 템플릿의 한글을 잡는다", () => {
    const source = [
      "<p>안녕하세요</p>",
      'const a = "보내기";',
      "const b = `반가워요` + name;",
      "const c = 'ㅎㅎ';",
      'const ok = t("home.title");',
    ].join("\n");
    assert.deepEqual(hangulLines(source), [1, 2, 3, 4]);
  });

  it("주석의 한글은 보지 않는다", () => {
    const source = ["// 첫 화면", "/* 설명 */", "{/* 머리 */}", "<p>{t('x')}</p>"].join("\n");
    assert.deepEqual(hangulLines(source), []);
  });

  it("i18n/ 아래, 테스트, .ts 파일은 보지 않는다", () => {
    assert.deepEqual(hangulLines('const a = "보내기";', "apps/web/i18n/Provider.tsx"), []);
    assert.deepEqual(hangulLines('const a = "보내기";', "apps/web/app/page.test.tsx"), []);
    assert.deepEqual(hangulLines('const a = "보내기";', "apps/web/lib/api.ts"), []);
  });
});
