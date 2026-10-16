//! 스트림 턴의 통로: 흐름이 이벤트를 보내는 `Emitter` 와, 흐름을 따로 돌려 그 이벤트를 `TurnStream` 으로 내는 `turn_stream`.
//!
//! 흐름이 끝나면 `done`(결과)이나 오류 하나를 마지막으로 보낸다. 받는 쪽이 떠나도 턴은 끝까지 돌아 저장된다.

use std::future::Future;

use futures_util::stream;
use tokio::sync::mpsc;

use crate::shared::ApiError;
use crate::support::{StreamEvent, TurnResponse, TurnStream};

/// 한 턴이 쌓아 둘 수 있는 이벤트 수. 받는 쪽이 느리면 흐름이 기다린다.
const BUFFER: usize = 32;

type Item = Result<StreamEvent, ApiError>;

pub struct Emitter(mpsc::Sender<Item>);

impl Emitter {
    pub async fn send(&self, event: StreamEvent) {
        // 받는 쪽이 떠났으면 버린다.
        let _ = self.0.send(Ok(event)).await;
    }
}

pub fn turn_stream<F>(run: impl FnOnce(Emitter) -> F) -> TurnStream
where
    F: Future<Output = Result<TurnResponse, ApiError>> + Send + 'static,
{
    let (sender, receiver) = mpsc::channel(BUFFER);
    let turn = run(Emitter(sender.clone()));
    tokio::spawn(async move {
        let last = turn.await.map(|result| StreamEvent::Done { result });
        let _ = sender.send(last).await;
    });
    Box::pin(stream::unfold(receiver, |mut receiver| async move {
        receiver.recv().await.map(|item| (item, receiver))
    }))
}
