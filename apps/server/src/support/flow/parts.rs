//! 흐름이 쓰는 바깥과 자료(모델, 저장, 기억과 그 추출기, 지식, 계정의 대화 언어, 시계, 답 판정기)를 한데 묶은 것.

use super::judging::Judging;
use super::outside::{SharedChatLanguages, SharedClock, SharedSessionRepository};
use crate::llm::SharedTextModel;
use crate::support::knowledge::KnowledgeBase;
use crate::support::{SharedMemoryExtractor, SharedMemoryStore};

pub struct FlowParts {
    /// 시간 제한은 모델(라우터)이 두른다. 제한을 넘긴 호출은 `ApiError::ModelTimeout` 이다.
    pub model: SharedTextModel,
    pub sessions: SharedSessionRepository,
    /// 소유자의 현재 기억. 발화마다 읽어 기억 블록으로 넣는다.
    pub memory: SharedMemoryStore,
    /// 답이 끝난 턴 뒤에 그 사용자 발화에서 사실을 뽑는다.
    pub extractor: SharedMemoryExtractor,
    pub knowledge: KnowledgeBase,
    pub languages: SharedChatLanguages,
    pub clock: SharedClock,
    pub judging: Judging,
    /// 답한 턴의 분석에 발화 프롬프트의 추적을 남기는가(`APP_ENV=sandbox` 일 때만 참).
    pub trace_turns: bool,
}
