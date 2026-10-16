//! 대화의 규칙(순수 함수, I/O 없음): 애도 과제와 진행률, 깊이 게이트, 애도 프로필, 지원 수준, 턴 분석과 마음 리포트의 모양, Planner·Supervisor·Summarizer.
//! 저장과 모델 호출, 시계는 맡지 않는다. 시각은 부르는 쪽이 넘긴다.

#![allow(dead_code, unused_imports)] // S4(흐름)가 연결하면 쓰인다. 그때 지운다

mod depth_gate;
mod grief_profile;
mod mind_report;
mod planner;
mod summarizer;
mod supervisor;
mod support_level;
mod task;
mod turn_analysis;

pub use depth_gate::{DISENGAGE_EXIT, MAX_DEPTH, MIN_DEPTH, Progression, evaluate, is_engaged};
pub use grief_profile::{DEFAULT_LANGUAGE, DailyState, GriefProfile, PET_NAME_FALLBACK};
pub use mind_report::{MindReport, REPORT_MIN_TASK, REPORT_SECTION_ORDER, is_report_available};
pub use planner::plan;
pub use summarizer::summarize;
pub use supervisor::{SAMPLE_EVERY, review, should_review};
pub use support_level::SupportLevel;
pub use task::{Task, TaskOutOfRange};
pub use turn_analysis::{RiskAssessment, TaskTransition, TurnAnalysis};
