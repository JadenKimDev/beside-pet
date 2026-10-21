//! 스트림 턴의 통로: 흐름이 이벤트를 보내는 `Emitter` 와, 흐름을 따로 돌려 그 이벤트를 `TurnStream` 으로 내는 `turn_stream`.
//!
//! 흐름이 끝나면 `done`(결과)이나 `cancelled`(중단)나 오류 하나를 마지막으로 보낸다. 받는 쪽이 떠나도 턴은 끝까지 돌아 저장된다.
//! 흐름이 맡겨 둔 뒷일(답의 판정, ADR-0031)은 마지막 이벤트를 보낸 뒤에 돌고, 그것이 끝나야 줄이 닫힌다.

use std::future::Future;
use std::sync::{Arc, Mutex, PoisonError};

use futures_util::future::BoxFuture;

use futures_util::stream;
use tokio::sync::mpsc;

use super::orchestrator::Finished;
use crate::shared::ApiError;
use crate::support::{StreamEvent, TurnStream};

/// 한 턴이 쌓아 둘 수 있는 이벤트 수. 받는 쪽이 느리면 흐름이 기다린다.
const BUFFER: usize = 32;

type Item = Result<StreamEvent, ApiError>;

type After = Arc<Mutex<Option<BoxFuture<'static, ()>>>>;

pub struct Emitter {
    sender: mpsc::Sender<Item>,
    after: After,
}

impl Emitter {
    pub async fn send(&self, event: StreamEvent) {
        // 받는 쪽이 떠났으면 버린다.
        let _ = self.sender.send(Ok(event)).await;
    }

    /// 마지막 이벤트를 보낸 뒤에 돌릴 일을 맡긴다(응답 지연에 더하지 않는다). 다시 맡기면 앞의 것을 바꾼다.
    pub fn after_last(&self, work: impl Future<Output = ()> + Send + 'static) {
        *self.after.lock().unwrap_or_else(PoisonError::into_inner) = Some(Box::pin(work));
    }
}

pub fn turn_stream<F>(run: impl FnOnce(Emitter) -> F) -> TurnStream
where
    F: Future<Output = Result<Finished, ApiError>> + Send + 'static,
{
    let (sender, receiver) = mpsc::channel(BUFFER);
    let after: After = Arc::default();
    let turn = run(Emitter {
        sender: sender.clone(),
        after: after.clone(),
    });
    tokio::spawn(async move {
        let last = turn.await.map(|finished| match finished {
            Finished::Done(result) => StreamEvent::Done { result },
            Finished::Cancelled => StreamEvent::Cancelled,
        });
        let _ = sender.send(last).await;
        let work = after.lock().unwrap_or_else(PoisonError::into_inner).take();
        if let Some(work) = work {
            work.await;
        }
    });
    Box::pin(stream::unfold(receiver, |mut receiver| async move {
        receiver.recv().await.map(|item| (item, receiver))
    }))
}
