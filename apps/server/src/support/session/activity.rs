//! 세션의 메시지 집계(마지막 시각, 첫·마지막 사이의 분, 수). DB 가 질의로 구하고 저장하지 않는다(#15).

use chrono::{DateTime, Utc};

/// 한 세션의 메시지 집계. 메시지가 없으면 `Default`(시각과 길이 없음, 수 0)다.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct MessageActivity {
    pub last_message_at: Option<DateTime<Utc>>,
    /// 첫 메시지에서 마지막 메시지까지의 분(내림).
    pub duration_minutes: Option<u32>,
    pub message_count: u32,
}
