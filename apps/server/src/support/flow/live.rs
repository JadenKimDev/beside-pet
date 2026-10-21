//! 등록부에 오른 사용자 턴 하나: 발화가 조각을 등록부에 더하고 중단 토큰을 보며, 턴이 끝나 버려지면 등록부에서 빠진다(ADR-0030).
//!
//! 등록부의 열쇠는 세션 id 와 턴 id 의 쌍이다. 턴 id 는 클라이언트가 만든 멱등 키라 세션마다만 유일하다.

use std::future::Future;

use super::active::{ActiveTurns, AlreadyActive, TurnHandle};

/// 등록부의 열쇠.
pub fn key(session_id: &str, turn_id: &str) -> String {
    format!("{session_id}/{turn_id}")
}

pub struct LiveTurn {
    turns: ActiveTurns,
    key: String,
    handle: TurnHandle,
}

impl LiveTurn {
    /// 턴을 등록부에 올린다. 같은 턴이 이미 돌고 있으면 `AlreadyActive` 다.
    pub fn register(
        turns: &ActiveTurns,
        session_id: &str,
        turn_id: &str,
    ) -> Result<LiveTurn, AlreadyActive> {
        let key = key(session_id, turn_id);
        let handle = turns.register(&key)?;
        Ok(LiveTurn {
            turns: turns.clone(),
            key,
            handle,
        })
    }

    /// 조각을 모은 글에 더하고 다시 붙은 구독자에게 보낸다. 이미 중단됐으면 버리고 `false` 다.
    pub fn push(&self, chunk: &str) -> bool {
        self.turns.push(&self.key, chunk)
    }

    /// 중단을 요청받았는가.
    pub fn is_cancelled(&self) -> bool {
        self.turns.is_cancelled(&self.key)
    }

    /// 지금까지 모은 글.
    pub fn gathered(&self) -> String {
        self.turns
            .snapshot(&self.key)
            .map(|(_, text)| text)
            .unwrap_or_default()
    }

    /// `work` 를 기다리되 그 사이에 중단되면 `work` 를 버리고 `None` 이다.
    pub async fn unless_cancelled<T>(&mut self, work: impl Future<Output = T>) -> Option<T> {
        tokio::pin!(work);
        tokio::select! {
            biased;
            () = self.handle.cancelled() => {
                if self.handle.is_cancelled() {
                    None
                } else {
                    Some(work.await)
                }
            }
            out = &mut work => Some(out),
        }
    }
}

impl Drop for LiveTurn {
    /// 턴이 끝났다(저장까지 마쳤다). 중단되지 않았으면 구독자는 `Done` 을 받는다.
    fn drop(&mut self) {
        self.turns.finish(&self.key);
    }
}
