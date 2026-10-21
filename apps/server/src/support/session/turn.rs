//! 턴 하나의 사실(id, 상태, 시작·끝 시각, 오류 종류)과 그 상태 전이(pending → done | failed). `turns` 행 하나다.

use chrono::{DateTime, Utc};

/// 턴의 상태. 값 문자열은 `turns.status` 의 것과 같다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnStatus {
    /// 사용자 메시지를 받았고 답이 아직 끝나지 않았다.
    Pending,
    Done,
    Failed,
}

impl TurnStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            TurnStatus::Pending => "pending",
            TurnStatus::Done => "done",
            TurnStatus::Failed => "failed",
        }
    }

    pub fn parse(value: &str) -> Option<TurnStatus> {
        match value {
            "pending" => Some(TurnStatus::Pending),
            "done" => Some(TurnStatus::Done),
            "failed" => Some(TurnStatus::Failed),
            _ => None,
        }
    }
}

/// 실패한 턴의 오류 종류. 종류만 적고 오류 본문은 적지 않는다. 값 문자열은 `turns.error_kind` 의 것과 같다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnErrorKind {
    /// 발화가 시간 제한을 넘겼다.
    Timeout,
    /// 모델 공급자가 오류를 냈다.
    Provider,
    /// 서버가 다시 떠서 `pending` 으로 남은 턴을 닫았다.
    Restart,
}

impl TurnErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TurnErrorKind::Timeout => "timeout",
            TurnErrorKind::Provider => "provider",
            TurnErrorKind::Restart => "restart",
        }
    }

    pub fn parse(value: &str) -> Option<TurnErrorKind> {
        match value {
            "timeout" => Some(TurnErrorKind::Timeout),
            "provider" => Some(TurnErrorKind::Provider),
            "restart" => Some(TurnErrorKind::Restart),
            _ => None,
        }
    }
}

/// 턴 하나. `finished_at` 은 `pending` 일 때만 없고, `error_kind` 는 `failed` 일 때만 있다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    /// 클라이언트가 만든 UUID 이거나 서버가 만든 것. 세션은 받기만 한다.
    pub id: String,
    pub status: TurnStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error_kind: Option<TurnErrorKind>,
}

#[allow(
    dead_code,
    reason = "#19 S4 가 흐름에서 턴을 쓰기 전까지는 세션의 턴 메서드(테스트만 부른다)가 쓴다"
)]
impl Turn {
    pub(super) fn pending(id: String, at: DateTime<Utc>) -> Turn {
        Turn {
            id,
            status: TurnStatus::Pending,
            started_at: at,
            finished_at: None,
            error_kind: None,
        }
    }

    pub fn is_pending(&self) -> bool {
        self.status == TurnStatus::Pending
    }

    /// pending → done.
    pub(super) fn finish(&mut self, at: DateTime<Utc>) {
        self.status = TurnStatus::Done;
        self.finished_at = Some(at);
    }

    /// pending → failed.
    pub(super) fn fail(&mut self, kind: TurnErrorKind, at: DateTime<Utc>) {
        self.status = TurnStatus::Failed;
        self.finished_at = Some(at);
        self.error_kind = Some(kind);
    }
}
