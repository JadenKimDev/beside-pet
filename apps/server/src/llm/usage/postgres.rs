//! Postgres 싱크: 호출 기록을 채널로 받아 따로 도는 작업이 `llm_calls` 에 한 행씩 적는다.
//!
//! 기록은 호출을 막지 않는다. 채널이 차면 버리고, 쓰기가 실패하면 오류의 종류만 로그에 남기고 다음 기록을 받는다.
//! 로그에는 세션 id 와 SQL 오류의 글(접속 주소가 섞일 수 있다)을 싣지 않는다.

use sqlx::PgPool;
use tokio::sync::{mpsc, oneshot};

use super::{CallErrorKind, CallRecord, UsageSink};

/// 기본 채널 크기. 쓰기가 밀려 이만큼 쌓이면 새 기록을 버린다.
const CAPACITY: usize = 1024;

enum Message {
    Record(Box<CallRecord>),
    /// 앞서 받은 기록을 모두 적은 뒤 알린다.
    Flush(oneshot::Sender<()>),
}

/// `llm_calls` 에 적는 싱크. 만들 때 tokio 런타임 안이어야 한다.
pub struct PostgresUsageSink {
    sender: mpsc::Sender<Message>,
}

impl PostgresUsageSink {
    /// 채널과 쓰는 작업을 띄운다.
    pub fn spawn(pool: PgPool) -> PostgresUsageSink {
        PostgresUsageSink::spawn_with_capacity(pool, CAPACITY)
    }

    /// 채널 크기를 정해 띄운다.
    pub fn spawn_with_capacity(pool: PgPool, capacity: usize) -> PostgresUsageSink {
        let (sender, receiver) = mpsc::channel(capacity);
        tokio::spawn(write_loop(pool, receiver));
        PostgresUsageSink { sender }
    }

    /// 지금까지 넘긴 기록을 쓰는 작업이 모두 처리할 때까지 기다린다(성공이든 실패든). 종료 직전과 테스트에서 쓴다.
    pub async fn flush(&self) {
        let (done, wait) = oneshot::channel();
        if self.sender.send(Message::Flush(done)).await.is_ok() {
            let _ = wait.await;
        }
    }

    /// 쓰는 작업이 아직 기록을 받는가.
    pub fn is_running(&self) -> bool {
        !self.sender.is_closed()
    }
}

impl UsageSink for PostgresUsageSink {
    fn record(&self, record: CallRecord) {
        if let Err(error) = self.sender.try_send(Message::Record(Box::new(record))) {
            let reason = match error {
                mpsc::error::TrySendError::Full(_) => "channel full",
                mpsc::error::TrySendError::Closed(_) => "writer stopped",
            };
            tracing::warn!(reason, "model call record dropped");
        }
    }
}

async fn write_loop(pool: PgPool, mut receiver: mpsc::Receiver<Message>) {
    while let Some(message) = receiver.recv().await {
        match message {
            Message::Record(record) => {
                if let Err(error) = insert(&pool, &record).await {
                    tracing::warn!(
                        kind = write_error_kind(&error),
                        "model call record not written"
                    );
                }
            }
            Message::Flush(done) => {
                let _ = done.send(());
            }
        }
    }
}

async fn insert(pool: &PgPool, record: &CallRecord) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO llm_calls (id, at, provider, model, purpose, prompt_version, session_id, \
         input_tokens, output_tokens, duration_ms, first_token_ms, outcome, error_kind) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(record.at)
    .bind(record.provider.as_str())
    .bind(&record.model)
    .bind(record.purpose.as_str())
    .bind(&record.prompt_version)
    .bind(record.session_id.as_deref())
    .bind(record.input_tokens.map(i64::from))
    .bind(record.output_tokens.map(i64::from))
    .bind(i64::from(record.duration_ms))
    .bind(record.first_token_ms.map(i64::from))
    .bind(record.outcome.as_str())
    .bind(record.outcome.error_kind().map(CallErrorKind::as_str))
    .execute(pool)
    .await?;
    Ok(())
}

/// 쓰기 실패의 종류. 오류의 글은 싣지 않는다.
fn write_error_kind(error: &sqlx::Error) -> &'static str {
    match error {
        sqlx::Error::PoolClosed => "pool closed",
        sqlx::Error::PoolTimedOut => "pool timed out",
        sqlx::Error::Io(_) | sqlx::Error::Tls(_) => "connection",
        sqlx::Error::Database(_) => "database",
        _ => "other",
    }
}

#[cfg(test)]
mod tests;
