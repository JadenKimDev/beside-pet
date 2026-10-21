//! 대화의 규칙(순수 함수, I/O 없음): 애도 과제와 진행률, 깊이 게이트, 애도 프로필, 지원 수준, 턴 분석과 마음 리포트의 모양, 이번 턴의 화법(질문, 위로, 어미, 이미 쓴 상투구), Planner·Supervisor·Summarizer.
//! 저장과 모델 호출, 시계는 맡지 않는다. 시각은 부르는 쪽이 넘긴다.

mod depth_gate;
mod grief_profile;
mod mind_report;
mod planner;
mod summarizer;
mod supervisor;
mod support_level;
mod task;
mod turn_analysis;
mod turn_style;

pub use depth_gate::evaluate;
pub use grief_profile::GriefProfile;
pub use mind_report::{MindReport, REPORT_SECTION_ORDER, is_report_available};
pub use planner::plan;
pub use summarizer::summarize;
pub use supervisor::{review, should_review};
pub use support_level::SupportLevel;
pub use task::Task;
pub use turn_analysis::{RiskAssessment, TaskTransition, TurnAnalysis};
#[cfg(test)]
pub use turn_style::QuestionPolicy;
pub use turn_style::TurnStyle;
