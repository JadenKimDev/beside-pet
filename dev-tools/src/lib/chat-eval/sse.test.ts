import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectTurn, createSseReader, frameData, parseFrame, type StreamEvent, splitFrames } from "./sse.ts";

// 서버가 보내는 모양 그대로의 지어낸 스트림(sse.rs 의 frame: `data: <JSON>\n\n`).
const RESULT = { reply: "모모를 잊지 않으셨군요.", task: 1, progress: 0, supportLevel: 1, done: false };
const STREAM = [
  `data: {"kind":"meta","task":1,"progress":0.0,"supportLevel":1,"done":false}\n\n`,
  `data: {"kind":"token","text":"모모를"}\n\n`,
  `data: {"kind":"token","text":" 잊지 않으셨군요."}\n\n`,
  `data: ${JSON.stringify({ kind: "done", result: RESULT })}\n\n`,
].join("");

describe("splitFrames", () => {
  it("빈 줄로 끝난 프레임과 끝나지 않은 나머지로 나눈다", () => {
    const { frames, rest } = splitFrames('data: {"a":1}\n\ndata: {"b"');
    assert.deepEqual(frames, ['data: {"a":1}']);
    assert.equal(rest, 'data: {"b"');
  });

  it("CRLF 줄 끝도 받는다", () => {
    const { frames, rest } = splitFrames("data: 1\r\n\r\ndata: 2\r\n\r\n");
    assert.deepEqual(frames, ["data: 1", "data: 2"]);
    assert.equal(rest, "");
  });
});

describe("frameData", () => {
  it("여러 data 줄을 줄바꿈으로 잇고 주석과 다른 칸은 버린다", () => {
    assert.equal(frameData(": keep-alive\nevent: x\ndata: a\ndata:b"), "a\nb");
  });

  it("data 줄이 없으면 null", () => {
    assert.equal(frameData(": ping"), null);
  });
});

describe("parseFrame", () => {
  it("meta, token, done 을 읽는다", () => {
    assert.deepEqual(parseFrame('data: {"kind":"meta","task":2,"progress":0.5,"supportLevel":3,"done":true}'), {
      kind: "meta",
      task: 2,
      progress: 0.5,
      supportLevel: 3,
      done: true,
    });
    assert.deepEqual(parseFrame('data: {"kind":"token","text":"<0xEC>"}'), { kind: "token", text: "<0xEC>" });
    assert.deepEqual(parseFrame(`data: ${JSON.stringify({ kind: "done", result: RESULT })}`), {
      kind: "done",
      result: RESULT,
    });
  });

  it("모르는 kind 나 빠진 칸은 던진다", () => {
    assert.throws(() => parseFrame('data: {"kind":"other"}'), /모양을 모릅니다/);
    assert.throws(() => parseFrame('data: {"kind":"done","result":{"reply":"x"}}'), /모양을 모릅니다/);
    assert.throws(() => parseFrame("data: {not json"), /JSON 이 아닙니다/);
  });
});

describe("createSseReader", () => {
  it("프레임 경계와 맞지 않는 조각을 이어 같은 이벤트를 낸다", () => {
    const whole = createSseReader();
    const expected = [...whole.push(STREAM), ...whole.end()];
    assert.equal(expected.length, 4);

    for (const size of [1, 3, 7, 50]) {
      const reader = createSseReader();
      const got: StreamEvent[] = [];
      for (let at = 0; at < STREAM.length; at += size) got.push(...reader.push(STREAM.slice(at, at + size)));
      got.push(...reader.end());
      assert.deepEqual(got, expected, `조각 크기 ${size}`);
    }
  });

  it("끝에 빈 줄이 없는 마지막 프레임은 end 가 낸다", () => {
    const reader = createSseReader();
    assert.deepEqual(reader.push('data: {"kind":"token","text":"a"}'), []);
    assert.deepEqual(reader.end(), [{ kind: "token", text: "a" }]);
  });
});

describe("collectTurn", () => {
  it("토큰을 잇고 done 의 결과를 돌려준다", () => {
    const reader = createSseReader();
    const turn = collectTurn([...reader.push(STREAM), ...reader.end()]);
    assert.deepEqual(turn.result, RESULT);
    assert.equal(turn.tokens, 2);
    assert.equal(turn.text, "모모를 잊지 않으셨군요.");
  });

  it("done 없이 끊긴 스트림은 던진다", () => {
    assert.throws(() => collectTurn([{ kind: "token", text: "a" }]), /done 없이/);
  });
});
