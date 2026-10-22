//! 감정 지원 대화: 세션의 시작·메시지·종료·삭제·조회와 분석·리포트. 계정 확인은 `identity`, 위기 규칙은 `safety`, 모델은 `llm` 에 맡긴다.
//! 여기 있는 것은 HTTP 겉(경로, 요청 검증, 응답 모양, SSE)과 대화 기능의 관문(`SupportService`)이다. 대화의 속은 구현이 채운다.

mod api;
mod flow;
mod knowledge;
mod memory;
mod prompt;
mod request;
mod response;
mod rules;
mod service;
mod session;
mod sse;
mod store;

pub use api::router;
pub use flow::{
    HaikuReplyJudge, JudgeError, JudgeInput, Judgement, ReplyJudge, ReplyLabel, SharedReplyJudge,
    SystemOneReplyJudge, UnimplementedJudge,
};
pub use flow::{
    StartupPurge, SupportFlow, fail_pending_turns, owned_data_purger, purge_on_startup,
    session_presence,
};
pub use memory::{
    ExtractError, ExtractInput, ExtractedFact, Extraction, GateInput, GateOutcome, GatedNote,
    MemoryExtractor, MemoryNote, MemoryOptout, MemoryStore, MemoryView, ModelMemoryExtractor,
    NewNote, NewPet, NoteKind, Pet, PetLink, PetStatus, SharedMemoryExtractor, SharedMemoryStore,
    gate as gate_memory, parse_loss_type, pet_from_profile,
};
/// 발화 프롬프트의 기억 블록. 흐름이 매 턴 조립한다.
pub use prompt::memory_block;
pub use request::{
    DailyStateRequest, EatingState, GriefPath, GriefProfileRequest, LossType, SendMessageRequest,
    Situation, SleepState, StartSessionRequest, TogetherRange,
};
pub use response::{
    ActiveTurnResponse, ActiveTurnStatus, CancelledStatus, CancelledTurnResponse,
    DeletedSessionResponse, FailedTurnResponse, KnowledgeRefResponse, MessageResponse, MessageRole,
    MindReportResponse, MindReportSectionResponse, ReplyPhase, ReportSectionKey,
    RiskAssessmentResponse, RiskDetector, SessionAnalysisResponse, SessionListItemResponse,
    SessionStateResponse, SessionSummaryResponse, StreamEvent, SupervisionQuality,
    SupervisionResponse, SupportPlanResponse, TaskFocusResponse, TaskTransitionResponse,
    TurnAnalysisResponse, TurnResponse,
};
pub use service::{Requester, SharedSupportService, SupportService, TurnStream, Unimplemented};
