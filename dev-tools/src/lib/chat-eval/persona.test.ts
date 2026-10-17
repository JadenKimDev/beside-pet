import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadPersona, loadPersonas, parsePersona, personasDir, petNamesOf } from "./persona.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** 지어낸 인물. 칸을 하나씩 바꿔 가며 쓴다. */
function sample(): Record<string, string | object | null> {
  return {
    name: "sample",
    situation: "지어낸 인물: 고양이 단추를 지난달 보냈다",
    language: "ko",
    profile: { griefPath: "afterLoss", petName: "단추", weeksSinceLoss: 4, dailyState: { sleep: "fair" } },
    turns: ["단추가 보고 싶어요."],
    expect: { noCrisis: true },
  };
}

function parse(overrides: Record<string, string | number | object | null | undefined>) {
  const data = { ...sample(), ...overrides };
  return parsePersona("sample.json", JSON.stringify(data));
}

test("맞는 인물 파일을 그대로 읽는다", () => {
  const persona = parse({});
  assert.equal(persona.name, "sample");
  assert.equal(persona.language, "ko");
  assert.deepEqual(persona.turns, ["단추가 보고 싶어요."]);
  assert.deepEqual(persona.expect, { noCrisis: true });
  assert.equal(persona.profile?.petName, "단추");
  assert.deepEqual(petNamesOf(persona), ["단추"]);
});

test("profile 이 null 이면 재개 인물이고 반려동물 이름이 없다", () => {
  const persona = parse({ profile: null });
  assert.equal(persona.profile, null);
  assert.deepEqual(petNamesOf(persona), []);
});

test("expect 가 없으면 칸이 없다", () => {
  const persona = parse({ expect: undefined });
  assert.equal(persona.expect, undefined);
});

test("칸이 없으면 파일과 칸을 말한다", () => {
  assert.throws(() => parse({ situation: undefined }), /^Error: sample\.json: situation 이 없습니다/);
  assert.throws(() => parse({ turns: undefined }), /sample\.json: turns 가 없습니다/);
  assert.throws(() => parse({ profile: undefined }), /sample\.json: profile 이 없습니다/);
  assert.throws(() => parse({ language: undefined }), /sample\.json: language 이 없습니다/);
});

test("모르는 칸은 던진다", () => {
  assert.throws(() => parse({ mood: "sad" }), /sample\.json: mood 는 모르는 칸입니다/);
  assert.throws(() => parse({ expect: { crisisAt: 1 } }), /sample\.json: expect\.crisisAt 는 모르는 칸입니다/);
  assert.throws(
    () => parse({ profile: { griefPath: "afterLoss", petname: "단추" } }),
    /sample\.json: profile\.petname 는 모르는 칸입니다/,
  );
  assert.throws(
    () => parse({ profile: { griefPath: "afterLoss", dailyState: { mood: "ok" } } }),
    /profile\.dailyState\.mood 는 모르는 칸입니다/,
  );
});

test("잘못된 값은 던진다", () => {
  assert.throws(() => parse({ language: "ja" }), /sample\.json: language 는 ko, en 중 하나입니다/);
  assert.throws(() => parse({ turns: [] }), /sample\.json: turns 는 빈 배열이 아닌 배열입니다/);
  assert.throws(() => parse({ turns: "안녕" }), /sample\.json: turns 는 빈 배열이 아닌 배열입니다/);
  assert.throws(() => parse({ turns: ["안녕", 3] }), /sample\.json: turns\[1\] 는 빈칸 아닌 문자열입니다/);
  assert.throws(() => parse({ profile: "콩이" }), /sample\.json: profile 는 객체이거나 null 입니다/);
  assert.throws(() => parse({ profile: [] }), /profile 는 객체이거나 null 입니다/);
  assert.throws(() => parse({ expect: { crisisAtTurn: 0 } }), /expect\.crisisAtTurn 는 1 이상의 정수입니다/);
  assert.throws(() => parse({ expect: { noCrisis: "yes" } }), /expect\.noCrisis 는 true 나 false 입니다/);
  assert.throws(() => parse({ expect: { noCrisis: true, crisisAtTurn: 1 } }), /함께 둘 수 없습니다/);
  assert.throws(() => parse({ name: "other" }), /sample\.json: name 은 파일 이름\(sample\)과 같아야 합니다/);
  assert.throws(() => parsePersona("sample.json", "{"), /sample\.json: JSON 이 아닙니다/);
});

test("프로필 값은 서버의 요청 검증과 같은 규칙이다", () => {
  const profile = (extra: object) => parse({ profile: { griefPath: "afterLoss", ...extra } });
  assert.throws(() => parse({ profile: { petName: "단추" } }), /profile\.griefPath 가 없습니다/);
  assert.throws(() => profile({ griefPath: "during" }), /profile\.griefPath 는 afterLoss, beforeLoss 중 하나입니다/);
  assert.throws(() => profile({ weeksSinceLoss: 0.2 }), /profile\.weeksSinceLoss 는 0 이상의 정수입니다/);
  assert.throws(() => profile({ weeksSinceLoss: -1 }), /profile\.weeksSinceLoss 는 0 이상의 정수입니다/);
  assert.throws(() => profile({ togetherRange: "13+" }), /profile\.togetherRange/);
  assert.throws(() => profile({ lossType: "accident" }), /profile\.lossType/);
  assert.throws(() => profile({ situation: "dying" }), /profile\.situation/);
  assert.throws(() => profile({ preferredLanguage: "ja" }), /profile\.preferredLanguage/);
  assert.throws(() => profile({ petName: 3 }), /profile\.petName 는 문자열입니다/);
  assert.throws(() => profile({ dailyState: "bad" }), /profile\.dailyState 는 객체입니다/);
  assert.throws(() => profile({ dailyState: { sleep: "bad" } }), /profile\.dailyState\.sleep/);
  assert.throws(() => profile({ dailyState: { eating: "none" } }), /profile\.dailyState\.eating/);
  // 서버처럼 null 인 선택 칸은 없는 것으로 친다.
  assert.equal(profile({ petName: null, weeksSinceLoss: 0 }).profile?.weeksSinceLoss, 0);
});

test("loadPersonas 는 폴더의 json 을 이름순으로 읽는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-eval-personas-"));
  for (const name of ["b-second", "a-first"]) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...sample(), name }));
  }
  writeFileSync(join(dir, "README.txt"), "json 이 아니다");
  assert.deepEqual(
    loadPersonas(dir).map((p) => p.name),
    ["a-first", "b-second"],
  );
  const bad = join(dir, "bad");
  mkdirSync(bad);
  writeFileSync(join(bad, "broken.json"), JSON.stringify({ ...sample(), name: "broken", language: "fr" }));
  assert.throws(() => loadPersona(join(bad, "broken.json")), /broken\.json: language/);
  assert.throws(() => loadPersonas(bad), /broken\.json: language/);
});

test("레포의 인물 묶음은 아홉이고 모두 검증을 지난다", () => {
  const personas = loadPersonas(personasDir(ROOT));
  assert.deepEqual(
    personas.map((p) => p.name),
    [
      "after-crisis",
      "boundary-test",
      "crisis",
      "elderly-cat",
      "english-anticipatory",
      "euthanasia-anger",
      "resume-no-profile",
      "sudden-loss-self-blame",
      "teen-hamster",
    ],
  );
  const byName = new Map(personas.map((p) => [p.name, p]));
  assert.deepEqual(byName.get("elderly-cat")?.expect, { noCrisis: true });
  assert.ok(byName.get("elderly-cat")?.turns.some((t) => t.includes("이제 그만할래")));
  assert.deepEqual(byName.get("crisis")?.expect, { crisisAtTurn: 1 });
  assert.equal(byName.get("after-crisis")?.profile, null);
  assert.equal(byName.get("resume-no-profile")?.profile, null);
  assert.equal(byName.get("english-anticipatory")?.language, "en");
});
