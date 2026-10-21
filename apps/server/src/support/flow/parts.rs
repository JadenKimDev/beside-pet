//! 흐름이 쓰는 바깥과 자료(모델, 저장, 지식, 계정의 대화 언어, 시계, 모델 호출의 제한, 답 판정기)를 한데 묶은 것.

use super::deadline::CallLimits;
use super::judging::Judging;
use super::outside::{SharedChatLanguages, SharedClock, SharedSessionRepository};
use crate::llm::SharedTextModel;
use crate::support::knowledge::KnowledgeBase;

pub struct FlowParts {
    /// `SupportFlow::new` 가 `limits` 로 시간 제한을 두른다.
    pub model: SharedTextModel,
    pub sessions: SharedSessionRepository,
    pub knowledge: KnowledgeBase,
    pub languages: SharedChatLanguages,
    pub clock: SharedClock,
    pub limits: CallLimits,
    pub judging: Judging,
}
