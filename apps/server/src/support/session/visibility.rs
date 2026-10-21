//! 어느 메시지와 턴이 보이는가: 숨김(중단한 턴), 프롬프트 창에서 빼는 턴(실패, 중단), 상태 응답의 진행 중·실패 턴.
//!
//! 숨은 메시지도 전사(`transcript` 칸)에는 남아 저장된다. 여기서는 고르기만 하고 지우지 않는다(ADR-0030).

use super::super::response::MessageRole;
use super::{Message, Session, TurnStatus};

impl Session {
    /// 기록 응답의 전사: 중단한 턴의 메시지만 뺀다. 실패한 턴의 사용자 말은 보인다.
    pub fn visible_messages(&self) -> impl Iterator<Item = &Message> {
        self.transcript
            .iter()
            .filter(|message| self.status_of(message) != Some(TurnStatus::Cancelled))
    }

    /// 답을 기다리거나 받는 중인 마지막 턴(`pending` 또는 `streaming`)의 id 와 상태.
    pub fn active_turn(&self) -> Option<(&str, TurnStatus)> {
        self.turns
            .iter()
            .rev()
            .find(|turn| turn.status.is_active())
            .map(|turn| (turn.id.as_str(), turn.status))
    }

    /// 답이 없는 마지막 실패 턴: 중단한 턴을 건너뛴 마지막 턴이 `failed` 일 때 그 id. 다시 받아 답이 붙거나 뒤에 다른 턴이
    /// 오면 없다.
    pub fn failed_turn(&self) -> Option<&str> {
        self.turns
            .iter()
            .rev()
            .find(|turn| turn.status != TurnStatus::Cancelled)
            .filter(|turn| turn.status == TurnStatus::Failed)
            .map(|turn| turn.id.as_str())
    }

    /// 그 턴의 답(동반자 메시지). 다시 붙는 스트림이 끝난 턴의 답 전체를 보낼 때 쓴다.
    pub fn turn_reply(&self, turn_id: &str) -> Option<&str> {
        self.transcript
            .iter()
            .rev()
            .find(|message| {
                message.role == MessageRole::Assistant
                    && message.turn_id.as_deref() == Some(turn_id)
            })
            .map(|message| message.text.as_str())
    }

    /// 프롬프트·규칙이 보는 사본을 다시 고른다: 실패하거나 중단한 턴의 메시지를 뺀다. 전사나 턴 상태가 바뀐 뒤에 부른다.
    pub(super) fn refresh_conversation(&mut self) {
        self.conversation = self
            .transcript
            .iter()
            .filter(|message| {
                !matches!(
                    self.status_of(message),
                    Some(TurnStatus::Failed | TurnStatus::Cancelled)
                )
            })
            .cloned()
            .collect();
    }

    /// 메시지가 속한 턴의 상태. 턴 없는 옛 메시지와 아직 턴이 적히지 않은 메시지는 없다.
    fn status_of(&self, message: &Message) -> Option<TurnStatus> {
        let id = message.turn_id.as_deref()?;
        self.turns
            .iter()
            .find(|turn| turn.id == id)
            .map(|turn| turn.status)
    }
}
