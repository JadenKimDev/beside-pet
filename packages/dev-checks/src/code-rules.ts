// 레포 검사의 규칙들(Rust 서버의 기능 내부 경로와 `mod.rs` 자리, 큰 파일, 같은 몸체 함수, 범용 타입, 운영 화면의 FSD 레이어, 대화 웹의 색 리터럴과
// 한글 리터럴)의 입구.
// `@beside-pet/dev-checks/code-rules` 로 가져온다.
// Node 가 직접 돌리는 `dev-tools` 가 쓴다. 규칙은 경로와 소스 글을 받아 발견 목록을 돌려주는 순수 함수다.
// 언어는 확장자로 가른다(TS, 그리고 고객 스택이 Rust 일 때를 위한 Rust).

export * from "./duplicate-bodies.ts";
export * from "./fsd-layers.ts";
export * from "./generic-types.ts";
export * from "./internal-use.ts";
export * from "./large-files.ts";
export * from "./mod-placement.ts";
export * from "./source-text.ts";
export * from "./web-literals.ts";
