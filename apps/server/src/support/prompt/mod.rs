//! 모델에 주는 글: 발화 시스템 프롬프트와 단계 지침, 히스토리 창, 리포트 프롬프트와 `@@marker` 파서, 출력 언어.
//! 구조(단계, 과제, 지원 수준)는 규칙이 정해 넘기고, 여기서는 글로 바꾸기만 한다. 모델을 부르지 않는다.
//! 위기 판정 프롬프트는 `safety` 의 것이라 여기 두지 않는다.

mod language;
mod reply;
mod report;
mod transcript;

pub use reply::{
    PROMPT_VERSION as REPLY_PROMPT_VERSION, PreviousSession, ReplyContext, reply_messages,
    reply_system_prompt,
};
pub use report::{
    PROMPT_VERSION as REPORT_PROMPT_VERSION, ReportContext, parse_report_bodies,
    report_system_prompt, report_user_prompt,
};
