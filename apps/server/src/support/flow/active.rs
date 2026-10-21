//! 진행 중 턴 등록부: 답이 흐르는 턴마다 모은 글, 구독 채널, 중단 토큰을 프로세스 메모리에 든다(ADR-0030).
//!
//! 발화가 시작할 때 `register` 하고 끝나면 `finish` 로 뺀다. 같은 턴 id 의 두 번째 등록은 `AlreadyActive` 라
//! 같은 프로세스 안에서 같은 `turnId` 가 동시에 도착하는 경합을 막는다. DB 와 모델은 모르고 I/O 가 없다.
//! 서버가 다시 뜨면 비어 있다.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use tokio::sync::{broadcast, watch};

/// 구독자 한 명이 받지 않고 쌓아 둘 수 있는 이벤트 수. 넘기면 그 구독자는 끊기고 발화는 막히지 않는다.
pub const SUBSCRIBER_BUFFER: usize = 256;

/// 구독자가 받는 이벤트.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnEvent {
    Chunk(String),
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveStatus {
    Streaming,
    Cancelled,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AlreadyActive;

/// 턴 id → 진행 중 항목. 복제해도 같은 등록부를 본다.
#[derive(Clone, Default)]
pub struct ActiveTurns {
    inner: Arc<Mutex<HashMap<String, Entry>>>,
}

struct Entry {
    text: String,
    events: broadcast::Sender<TurnEvent>,
    cancel: watch::Sender<bool>,
}

impl Entry {
    fn is_cancelled(&self) -> bool {
        *self.cancel.borrow()
    }

    fn status(&self) -> ActiveStatus {
        if self.is_cancelled() {
            ActiveStatus::Cancelled
        } else {
            ActiveStatus::Streaming
        }
    }
}

/// 발화를 맡은 쪽이 드는 중단 토큰.
pub struct TurnHandle {
    cancel: watch::Receiver<bool>,
}

/// 다시 붙은 구독자 하나의 이벤트 줄. `None` 은 끝(항목이 빠졌거나, 버퍼를 넘겨 끊겼거나)이다.
pub struct Subscription {
    first: Option<TurnEvent>,
    events: broadcast::Receiver<TurnEvent>,
}

impl ActiveTurns {
    /// 턴을 올린다. 같은 id 가 이미 있으면 `AlreadyActive` 다.
    pub fn register(&self, turn_id: &str) -> Result<TurnHandle, AlreadyActive> {
        let mut turns = self.lock();
        if turns.contains_key(turn_id) {
            return Err(AlreadyActive);
        }
        let (events, _) = broadcast::channel(SUBSCRIBER_BUFFER);
        let (cancel, cancel_rx) = watch::channel(false);
        turns.insert(
            turn_id.to_owned(),
            Entry {
                text: String::new(),
                events,
                cancel,
            },
        );
        Ok(TurnHandle { cancel: cancel_rx })
    }

    /// 조각을 모은 글에 더하고 구독자에게 보낸다. 항목이 없거나 이미 중단됐으면 버리고 `false` 다.
    pub fn push(&self, turn_id: &str, chunk: &str) -> bool {
        let mut turns = self.lock();
        let Some(entry) = turns.get_mut(turn_id) else {
            return false;
        };
        if entry.is_cancelled() {
            return false;
        }
        entry.text.push_str(chunk);
        // 구독자가 없으면 보낼 곳이 없을 뿐이다. 느린 구독자는 broadcast 가 밀어내고 발화는 기다리지 않는다.
        let _ = entry.events.send(TurnEvent::Chunk(chunk.to_owned()));
        true
    }

    /// 지금까지 모은 글과 이후의 이벤트 줄. 이미 중단된 턴이면 줄의 첫 이벤트가 `Cancelled` 다.
    pub fn subscribe(&self, turn_id: &str) -> Option<(String, Subscription)> {
        let turns = self.lock();
        let entry = turns.get(turn_id)?;
        let first = entry.is_cancelled().then_some(TurnEvent::Cancelled);
        Some((
            entry.text.clone(),
            Subscription {
                first,
                events: entry.events.subscribe(),
            },
        ))
    }

    /// 토큰을 당기고 구독자에게 `Cancelled` 를 보낸다. 그때까지 모은 글을 돌려준다. 두 번 불러도 같다.
    pub fn cancel(&self, turn_id: &str) -> Option<String> {
        let turns = self.lock();
        let entry = turns.get(turn_id)?;
        if !entry.is_cancelled() {
            entry.cancel.send_replace(true);
            let _ = entry.events.send(TurnEvent::Cancelled);
        }
        Some(entry.text.clone())
    }

    /// 항목을 뺀다. 중단되지 않은 턴이면 구독자에게 `Done` 을 먼저 보낸다. 없는 턴이면 아무것도 하지 않는다.
    pub fn finish(&self, turn_id: &str) {
        let Some(entry) = self.lock().remove(turn_id) else {
            return;
        };
        if !entry.is_cancelled() {
            let _ = entry.events.send(TurnEvent::Done);
        }
    }

    pub fn is_cancelled(&self, turn_id: &str) -> bool {
        self.lock().get(turn_id).is_some_and(Entry::is_cancelled)
    }

    pub fn snapshot(&self, turn_id: &str) -> Option<(ActiveStatus, String)> {
        self.lock()
            .get(turn_id)
            .map(|entry| (entry.status(), entry.text.clone()))
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        // 잠금 안에서 패닉할 곳이 없다. 혹시 오염돼도 자료는 그대로 쓸 수 있다.
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl TurnHandle {
    pub fn is_cancelled(&self) -> bool {
        *self.cancel.borrow()
    }

    /// 중단될 때 풀린다. 중단 없이 턴이 빠져도 풀리므로 `select!` 에서 걸려 있지 않는다(그때 `is_cancelled` 는 `false`).
    pub async fn cancelled(&mut self) {
        let _ = self.cancel.wait_for(|cancelled| *cancelled).await;
    }
}

impl Subscription {
    pub async fn recv(&mut self) -> Option<TurnEvent> {
        if let Some(event) = self.first.take() {
            return Some(event);
        }
        // 버퍼를 넘긴 구독자(`Lagged`)는 끊는다. 다시 붙으면 모은 글을 처음부터 받는다.
        self.events.recv().await.ok()
    }
}

#[cfg(test)]
mod tests;
