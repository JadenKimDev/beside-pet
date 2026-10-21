//! 전사의 메시지 하나: 말한 쪽, 본문, 그때의 과제, 시각, 속한 턴. `messages` 행 하나다.

use chrono::{DateTime, Utc};

use super::super::response::{MessageResponse, MessageRole};
use super::super::rules::Task;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub role: MessageRole,
    pub text: String,
    /// 이 메시지를 적을 때의 과제.
    pub task: Task,
    pub at: DateTime<Utc>,
    /// 이 메시지가 속한 턴. 턴을 두기 전의 메시지와 옛 메서드로 적은 메시지는 없다.
    pub turn_id: Option<String>,
}

impl Message {
    pub fn to_response(&self) -> MessageResponse {
        MessageResponse {
            role: self.role,
            text: self.text.clone(),
            task: self.task.number(),
            at: self.at,
            turn_id: self.turn_id.clone(),
        }
    }
}
