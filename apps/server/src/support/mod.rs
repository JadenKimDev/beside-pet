//! 감정 지원 대화: 세션의 시작·메시지·종료·삭제·조회와 분석·리포트. 계정 확인은 `identity`, 위기 규칙은 `safety`, 모델은 `llm` 에 맡긴다.
//! 여기 있는 것은 HTTP 겉(경로, 요청 검증, 응답 모양, SSE)과 대화 기능의 관문(`SupportService`)이다. 대화의 속은 구현이 채운다.

mod api;
mod request;
mod response;
mod rules;
mod service;
mod session;
mod sse;

pub use api::router;
pub use request::{
    DailyStateRequest, EatingState, GriefPath, GriefProfileRequest, LossType, SendMessageRequest,
    Situation, SleepState, StartSessionRequest, TogetherRange,
};
pub use response::{
    KnowledgeRefResponse, MessageResponse, MessageRole, MindReportResponse,
    MindReportSectionResponse, ReplyPhase, ReportSectionKey, RiskAssessmentResponse, RiskDetector,
    SessionAnalysisResponse, SessionListItemResponse, SessionStateResponse, SessionSummaryResponse,
    StreamEvent, SupervisionQuality, SupervisionResponse, SupportPlanResponse, TaskFocusResponse,
    TaskTransitionResponse, TurnAnalysisResponse, TurnResponse,
};
pub use service::{Requester, SharedSupportService, SupportService, TurnStream, Unimplemented};
