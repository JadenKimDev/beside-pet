//! 안전: 위기 키워드 패턴, 위기 판정(키워드와 모델의 합집합), 고정 위기 문구, 안전 자원 목록. 대화 흐름은 맡지 않는다.
//! 위기 감지와 위기 답의 정본은 여기 한 곳이다(ADR-0004). 바꿀 때는 감지 테스트를 먼저 쓴다.

mod api;
mod crisis;
mod resources;
mod risk;

pub use api::router;
pub use crisis::matches_crisis;
pub use resources::{SafetyResource, crisis_reply, safety_resources};
pub use risk::{RISK_SYSTEM_PROMPT, RiskLevel, assess_risk};
