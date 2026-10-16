// 레포 검사의 규칙들(큰 파일, 같은 몸체 함수, 범용 타입)의 입구. `@beside-pet/dev-checks/code-rules` 로 가져온다.
// Node 가 직접 돌리는 `dev-tools` 가 쓴다. 규칙은 경로와 소스 글을 받아 발견 목록을 돌려주는 순수 함수다.
// 언어는 확장자로 가른다(TS, 그리고 고객 스택이 Rust 일 때를 위한 Rust).

export * from "./duplicate-bodies.ts";
export * from "./generic-types.ts";
export * from "./large-files.ts";
export * from "./source-text.ts";
