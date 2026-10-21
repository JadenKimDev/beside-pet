//! 세션의 상태를 응답 모양(턴 결과, 스트림의 `meta`, 상태, 목록 항목, 기록, 분석)으로 옮긴다.

use super::super::response::{
    MessageResponse, SessionAnalysisResponse, SessionListItemResponse, SessionStateResponse,
    StreamEvent, TurnResponse,
};
use super::super::rules::TurnAnalysis;
use super::{Message, MessageActivity, Session};

impl Session {
    /// 한 턴의 결과(지금 상태 + 답).
    pub fn turn_response(&self, reply: String) -> TurnResponse {
        TurnResponse {
            reply,
            task: self.task.number(),
            progress: self.progress(),
            support_level: self.support_level.number(),
            done: self.closed,
        }
    }

    /// 스트림의 첫 이벤트: 글보다 먼저 보내는 구조.
    pub fn meta_event(&self) -> StreamEvent {
        StreamEvent::Meta {
            task: self.task.number(),
            progress: self.progress(),
            support_level: self.support_level.number(),
            done: self.closed,
        }
    }

    pub fn state_response(&self) -> SessionStateResponse {
        SessionStateResponse {
            session_id: self.id.clone(),
            task: self.task.number(),
            progress: self.progress(),
            support_level: self.support_level.number(),
            closed: self.closed,
            report_available: self.report_available(),
        }
    }

    /// 목록 항목. 메시지 집계는 저장이 질의로 구해 넘긴다.
    pub fn list_item(&self, activity: &MessageActivity) -> SessionListItemResponse {
        SessionListItemResponse {
            session_id: self.id.clone(),
            started_at: self.started_at,
            closed: self.closed,
            reached_task: self.task.number(),
            progress: self.progress(),
            pet_name: self.grief_profile.pet_name.clone(),
            preferred_language: self.grief_profile.language(),
            report_available: self.report_available(),
            last_message_at: activity.last_message_at,
            duration_minutes: activity.duration_minutes,
            message_count: activity.message_count,
        }
    }

    /// 기록 응답. 중단한 턴의 메시지는 숨는다(`visible_messages`).
    pub fn history_response(&self) -> Vec<MessageResponse> {
        self.visible_messages().map(Message::to_response).collect()
    }

    /// 분석 보기. 계획과 요약은 여기서 규칙으로 다시 구한다.
    pub fn analysis_response(&self) -> SessionAnalysisResponse {
        SessionAnalysisResponse {
            session_id: self.id.clone(),
            closed: self.closed,
            plan: Some(self.plan()),
            analyses: self
                .analyses
                .iter()
                .map(TurnAnalysis::to_response)
                .collect(),
            summary: self.summary(),
            history: self.history_response(),
        }
    }
}
