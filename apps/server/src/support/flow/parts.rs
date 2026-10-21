//! 흐름이 쓰는 바깥과 자료(모델, 저장, 지식, 계정의 대화 언어, 시계, 답 판정기)를 한데 묶은 것.

use super::judging::Judging;
use super::outside::{SharedChatLanguages, SharedClock, SharedSessionRepository};
use crate::llm::SharedTextModel;
use crate::support::knowledge::KnowledgeBase;

pub struct FlowParts {
    /// 시간 제한은 모델(라우터)이 두른다. 제한을 넘긴 호출은 `ApiError::ModelTimeout` 이다.
    pub model: SharedTextModel,
    pub sessions: SharedSessionRepository,
    pub knowledge: KnowledgeBase,
    pub languages: SharedChatLanguages,
    pub clock: SharedClock,
    pub judging: Judging,
}
