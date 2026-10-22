//! 기억(#38, ADR-0034)을 조립한 라우터와 실제 대화 흐름, 테스트 스키마로 끝까지 돌린다. 모델만 대본이고 실제 라우터와
//! 호출 기록(`llm_calls`)을 거친다. 온보딩의 아이 한 행, 턴 뒤 추출의 사실 행, 정정, 옵트아웃, 세션 삭제의 연쇄, 추출 실패를 본다.
//! 행 수와 이 테스트가 넣은 값만 본다. DATABASE_URL 이 없으면 이유를 적고 실패한다. 아이디, 비밀번호, 글은 모두 지어낸 값이다.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::http::{Method, StatusCode};
use futures_util::future::BoxFuture;
use futures_util::stream;
use serde_json::{Value, json};

use beside_pet_server::app::Services;
use beside_pet_server::identity::IdentityService;
use beside_pet_server::llm::{
    CallPurpose, Generation, GenerationRequest, LlmProvider, MemoryExtract, ModelRef, ModelRouter,
    PostgresUsageSink, ProviderStream, SharedTextModel, StreamEvent, TextModelProvider, TokenUsage,
};
use beside_pet_server::shared::ApiError;
use beside_pet_server::support;

use crate::db::TestSchema;
use crate::harness::{Harness, Reply};
use crate::turns::account_token;

const USERNAME: &str = "heron-fixture";
const PASSWORD: &str = "fixture-pass-memory";
const SESSION: &str = "s-memory-fixture";
const REPLY: &str = "A made-up gentle reply.";
const BLANKET: &str = "They keep the blue blanket on the sofa.";
const PUT_AWAY: &str = "In the end we put the blanket away.";
const START: &str = r#"{ "griefPath": "afterLoss", "petName": "Pebble" }"#;

/// 위기 판정은 NO, 발화는 고정 글, 기억 추출은 정해 둔 JSON(펜스를 두른 Ollama 모양). `fail_extract` 면 추출 호출만 실패한다.
#[derive(Default)]
struct Scripted {
    extraction: Mutex<String>,
    fail_extract: AtomicBool,
}

impl Scripted {
    fn answer(&self, facts: Value, do_not_remember: bool) {
        let body = json!({ "facts": facts, "do_not_remember": do_not_remember });
        *self.extraction.lock().unwrap() = format!("```json\n{body}\n```");
    }
}

struct Provider(Arc<Scripted>);

impl TextModelProvider for Provider {
    fn provider(&self) -> LlmProvider {
        LlmProvider::Ollama
    }

    fn generate(
        &self,
        _model: &str,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        let text = match request.context.purpose {
            CallPurpose::Crisis => Ok("NO".to_owned()),
            CallPurpose::MemoryExtract if self.0.fail_extract.load(Ordering::SeqCst) => {
                Err(ApiError::Internal)
            }
            CallPurpose::MemoryExtract => Ok(self.0.extraction.lock().unwrap().clone()),
            _ => Ok(REPLY.to_owned()),
        };
        Box::pin(async move {
            text.map(|text| Generation {
                text,
                usage: TokenUsage::default(),
            })
        })
    }

    fn stream(&self, _model: &str, _request: GenerationRequest) -> ProviderStream {
        Box::pin(stream::iter([
            Ok(StreamEvent::Text(REPLY.to_owned())),
            Ok(StreamEvent::Usage(TokenUsage::default())),
        ]))
    }
}

struct Fixture {
    schema: TestSchema,
    model: Arc<Scripted>,
    usage: Arc<PostgresUsageSink>,
    h: Harness,
    token: String,
}

async fn fixture() -> Fixture {
    let schema = TestSchema::open().await;
    let identity = Arc::new(
        IdentityService::start(schema.pool.clone(), "fixture-secret-not-real", Some("1h"))
            .await
            .unwrap(),
    );
    let model = Arc::new(Scripted::default());
    model.answer(json!([]), false);
    let usage = Arc::new(PostgresUsageSink::spawn(schema.pool.clone()));
    let router: SharedTextModel = Arc::new(ModelRouter::new(
        ModelRef {
            provider: LlmProvider::Ollama,
            model: "scripted".to_owned(),
        },
        vec![Box::new(Provider(model.clone()))],
        usage.clone(),
    ));
    let h = Harness::with_services(Services {
        accounts: identity.clone(),
        authenticator: identity.clone(),
        session_presence: support::session_presence(schema.pool.clone()),
        support: support::SupportFlow::live(
            schema.pool.clone(),
            router.clone(),
            identity,
            Arc::new(support::UnimplementedJudge),
            1,
            0.5,
            false,
            Arc::new(support::ModelMemoryExtractor(MemoryExtract::new(router))),
        ),
        ..Services::unimplemented()
    });
    let token = account_token(&h, &schema, USERNAME, PASSWORD).await;
    let f = Fixture {
        schema,
        model,
        usage,
        h,
        token,
    };
    let reply = f.start(SESSION).await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text);
    f
}

/// `supersedes` 는 추출 입력의 현재 사실 목록 번호(`[1]`, `[2]`…)다.
fn object(text: &str, seq: i32, supersedes: &[i32]) -> Value {
    json!({ "kind": "object", "pet_name": null, "text": text, "seq": seq, "supersedes": supersedes })
}

impl Fixture {
    async fn start(&self, session_id: &str) -> Reply {
        let profile: Value = serde_json::from_str(START).unwrap();
        self.h
            .send(
                Method::POST,
                "/v1/sessions",
                Some(&self.token),
                Some(json!({ "sessionId": session_id, "griefProfile": profile })),
            )
            .await
    }

    async fn say(&self, text: &str) -> Reply {
        let reply = self
            .h
            .send(
                Method::POST,
                &format!("/v1/sessions/{SESSION}/messages"),
                Some(&self.token),
                Some(json!({ "text": text })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
        reply
    }

    /// 스트림으로 보낸다. 본문이 끝나면(뒷일까지 끝나 줄이 닫히면) 돌아온다.
    async fn say_streamed(&self, text: &str) -> Reply {
        self.say_streamed_in(SESSION, text).await
    }

    async fn say_streamed_in(&self, session_id: &str, text: &str) -> Reply {
        let reply = self
            .h
            .send(
                Method::POST,
                &format!("/v1/sessions/{session_id}/messages/stream"),
                Some(&self.token),
                Some(json!({ "text": text })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
        reply
    }

    async fn count(&self, sql: &str, bind: &str) -> i64 {
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_owned()))
            .bind(bind)
            .fetch_one(&self.schema.pool)
            .await
            .unwrap()
    }

    /// 동기 턴의 추출은 따로 돌므로 행 수가 `expected` 가 될 때까지 기다린다(2초).
    async fn wait_for(&self, sql: &str, bind: &str, expected: i64) {
        for _ in 0..200 {
            self.usage.flush().await;
            if self.count(sql, bind).await == expected {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!(
            "{sql} 이 {expected} 이 되지 않았다: {}",
            self.count(sql, bind).await
        );
    }

    async fn owner_pets(&self) -> i64 {
        self.count(
            "SELECT count(*) FROM pets WHERE owner_id::text = \
             (SELECT id::text FROM accounts WHERE username = $1)",
            USERNAME,
        )
        .await
    }
}

const NOTES: &str = "SELECT count(*) FROM memory_notes WHERE session_id = $1";
const CURRENT: &str = "SELECT count(*) FROM current_memory WHERE session_id = $1";
const OPTOUTS: &str = "SELECT count(*) FROM memory_optouts WHERE session_id = $1";
const PETS: &str = "SELECT count(*) FROM pets WHERE source_session_id = $1";
const EXTRACT_CALLS: &str =
    "SELECT count(*) FROM llm_calls WHERE session_id = $1 AND purpose = 'memory_extract'";

#[tokio::test]
async fn 온보딩하면_아이가_한_행이고_같은_이름으로_또_시작해도_행이_늘지_않는다() {
    let f = fixture().await;
    assert_eq!(f.owner_pets().await, 1);
    assert_eq!(f.count(PETS, SESSION).await, 1);

    let again = f.start("s-memory-fixture-2").await;

    assert_eq!(again.status, StatusCode::CREATED, "{}", again.text);
    assert_eq!(f.owner_pets().await, 1);
    f.schema.close().await;
}

#[tokio::test]
async fn 턴_뒤_추출은_호출_기록과_사실_행을_남기고_응답은_그대로다() {
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), false);

    let reply = f.say(BLANKET).await;

    assert_eq!(reply.body["reply"], json!(REPLY));
    f.wait_for(NOTES, SESSION, 1).await;
    f.wait_for(EXTRACT_CALLS, SESSION, 1).await;
    let model_rows = f
        .count(
            "SELECT count(*) FROM memory_notes WHERE session_id = $1 AND seq = 1 \
             AND kind = 'object' AND extracted_by LIKE 'model:%'",
            SESSION,
        )
        .await;
    assert_eq!(model_rows, 1);
    f.schema.close().await;
}

#[tokio::test]
async fn 정정하면_현재_목록에는_새_것만_있고_옛_행은_새_행을_가리킨다() {
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), false);
    f.say_streamed(BLANKET).await;
    f.wait_for(NOTES, SESSION, 1).await;
    f.model.answer(json!([object(PUT_AWAY, 3, &[1])]), false);

    f.say_streamed(PUT_AWAY).await;

    f.wait_for(NOTES, SESSION, 2).await;
    assert_eq!(f.count(CURRENT, SESSION).await, 1);
    let current_new = f
        .count(
            "SELECT count(*) FROM current_memory WHERE session_id = $1 AND seq = 3",
            SESSION,
        )
        .await;
    assert_eq!(current_new, 1);
    let linked = f
        .count(
            "SELECT count(*) FROM memory_notes old JOIN memory_notes new ON old.superseded_by = new.id \
             WHERE old.session_id = $1 AND old.seq = 1 AND new.seq = 3",
            SESSION,
        )
        .await;
    assert_eq!(linked, 1);
    f.schema.close().await;
}

/// seq 는 세션마다 1부터 다시 매긴다. 다른 세션의 정정도 번호([1])로 옛 사실을 덮는다(#38 QA).
#[tokio::test]
async fn 다른_세션의_정정도_옛_사실을_덮는다() {
    const NEXT: &str = "s-memory-fixture-next";
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), false);
    f.say_streamed(BLANKET).await;
    f.wait_for(NOTES, SESSION, 1).await;
    let started = f.start(NEXT).await;
    assert_eq!(started.status, StatusCode::CREATED, "{}", started.text);
    f.model.answer(json!([object(PUT_AWAY, 1, &[1])]), false);

    f.say_streamed_in(NEXT, PUT_AWAY).await;

    f.wait_for(NOTES, NEXT, 1).await;
    assert_eq!(f.count(CURRENT, SESSION).await, 0);
    assert_eq!(f.count(CURRENT, NEXT).await, 1);
    let linked = f
        .count(
            "SELECT count(*) FROM memory_notes old JOIN memory_notes new ON old.superseded_by = new.id \
             WHERE old.session_id = $1 AND new.session_id = 's-memory-fixture-next'",
            SESSION,
        )
        .await;
    assert_eq!(linked, 1);
    f.schema.close().await;
}

#[tokio::test]
async fn 기억하지_말라고_하면_사실_없이_옵트아웃_한_행이다() {
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), true);

    f.say(BLANKET).await;

    f.wait_for(OPTOUTS, SESSION, 1).await;
    assert_eq!(f.count(NOTES, SESSION).await, 0);
    f.schema.close().await;
}

#[tokio::test]
async fn 세션을_지우면_행은_남고_현재_기억에서_빠지며_되살리면_돌아온다() {
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), false);
    f.say(BLANKET).await;
    f.wait_for(NOTES, SESSION, 1).await;
    f.model.answer(json!([]), true);
    f.say(PUT_AWAY).await;
    f.wait_for(OPTOUTS, SESSION, 1).await;
    assert_eq!(f.count(PETS, SESSION).await, 1);
    let current = f.count(CURRENT, SESSION).await;
    assert!(current > 0, "the session has current memory before deletion");

    let reply =
        f.h.send(
            Method::DELETE,
            &format!("/v1/sessions/{SESSION}"),
            Some(&f.token),
            None,
        )
        .await;

    assert_eq!(reply.status, StatusCode::NO_CONTENT, "{}", reply.text);
    for sql in [NOTES, OPTOUTS, PETS] {
        assert_eq!(f.count(sql, SESSION).await, 1, "{sql}: rows stay until the purge");
    }
    assert_eq!(f.count(CURRENT, SESSION).await, 0, "deleted sessions leave current memory");
    let state =
        f.h.send(
            Method::GET,
            &format!("/v1/sessions/{SESSION}"),
            Some(&f.token),
            None,
        )
        .await;
    assert_eq!(state.status, StatusCode::NOT_FOUND, "{}", state.text);

    let restored =
        f.h.send(
            Method::POST,
            &format!("/v1/sessions/{SESSION}/restore"),
            Some(&f.token),
            None,
        )
        .await;
    assert_eq!(restored.status, StatusCode::OK, "{}", restored.text);
    assert_eq!(restored.body["sessionId"], json!(SESSION));
    assert_eq!(f.count(CURRENT, SESSION).await, current);
    f.schema.close().await;
}

#[tokio::test]
async fn 추출이_실패해도_응답은_그대로이고_사실_행은_없다() {
    let f = fixture().await;
    f.model.answer(json!([object(BLANKET, 1, &[])]), false);
    f.model.fail_extract.store(true, Ordering::SeqCst);

    let reply = f.say(BLANKET).await;

    assert_eq!(reply.body["reply"], json!(REPLY));
    f.wait_for(EXTRACT_CALLS, SESSION, 1).await;
    let failed = f
        .count(
            "SELECT count(*) FROM llm_calls WHERE session_id = $1 AND purpose = 'memory_extract' \
             AND outcome <> 'ok'",
            SESSION,
        )
        .await;
    assert_eq!(failed, 1);
    assert_eq!(f.count(NOTES, SESSION).await, 0);
    assert_eq!(f.count(OPTOUTS, SESSION).await, 0);
    f.schema.close().await;
}
