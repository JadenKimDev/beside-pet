//! 대화의 흐름: 오케스트레이터(동기·스트리밍), 시작·보내기·닫기·삭제, 질의, 리포트 작성. 규칙·저장·프롬프트·지식·모델을 엮어 `SupportService` 를 구현한다.
//! 구조(과제, 진행률, 지원 수준)는 규칙이 정하고 모델은 글만 쓴다. 바깥(저장, 모델, 계정, 시계)은 trait 로 받는다.
//! HTTP 겉(경로, 검증, SSE 프레임)과 SQL 은 맡지 않는다.

mod access;
mod active;
mod adapters;
mod deadline;
mod orchestrator;
mod outside;
mod parts;
mod report;
mod service;
mod start;
mod stream;
mod voice;

pub use adapters::{fail_pending_turns, session_presence};
pub use service::SupportFlow;

#[cfg(test)]
use parts::FlowParts;

#[cfg(test)]
mod tests;
