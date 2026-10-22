//! 턴을 받자마자 저장(#19, ADR-0028): 실제 대화 흐름(`SupportFlow`)과 계정 구현을 테스트 스키마에 붙이고, 모델만 대본이다.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다). 아이디, 비밀번호, 글은 모두 지어낸 값이다.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::http::{Method, StatusCode};
use chrono::Utc;
use futures_util::future::BoxFuture;
use futures_util::{StreamExt, stream};
use serde_json::{Value, json};

use beside_pet_server::app::Services;
use beside_pet_server::identity::IdentityService;
use beside_pet_server::llm::{CallPurpose, GenerationRequest, TextModel, TextStream};
use beside_pet_server::shared::ApiError;
use beside_pet_server::support;

use crate::db::TestSchema;
use crate::harness::Harness;

const USERNAME: &str = "wren-fixture";
const PASSWORD: &str = "fixture-pass-turns";
pub const SESSION: &str = "s-turns-fixture";
pub const TURN_ID: &str = "3e9a1c7b-5d2f-4b86-a0c4-9f7e2b1d8a53";
pub const FAILED_TURN_ID: &str = "c1d8e2f4-7a3b-4e59-8b6d-2a0f9c3e7b14";
pub const WORDS: &str = "We used to nap together in the sun.";

/// 위기 판정은 NO, 발화는 고정 글. `fail` 을 켜면 발화가 공급자 오류를 내고,
/// `hold` 를 켜면 스트림이 첫 조각 뒤에 멈춘다(중단할 때까지 흐르는 답).
#[derive(Default)]
pub struct Scripted {
    pub fail: AtomicBool,
    pub hold: AtomicBool,
}

/// `hold` 일 때의 첫 조각.
pub const FIRST_CHUNK: &str = "A made-up ";

impl TextModel for Scripted {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        let answer = match request.context.purpose {
            CallPurpose::Crisis => Ok("NO".to_owned()),
            _ if self.fail.load(Ordering::SeqCst) => Err(ApiError::Internal),
            _ => Ok("A made-up gentle reply.".to_owned()),
        };
        Box::pin(async move { answer })
    }

    fn stream(&self, _: GenerationRequest) -> TextStream {
        if self.hold.load(Ordering::SeqCst) {
            return Box::pin(stream::iter([Ok(FIRST_CHUNK.to_owned())]).chain(stream::pending()));
        }
        let chunk = if self.fail.load(Ordering::SeqCst) {
            Err(ApiError::Internal)
        } else {
            Ok("A made-up gentle reply.".to_owned())
        };
        Box::pin(stream::iter([chunk]))
    }
}

pub struct Fixture {
    pub schema: TestSchema,
    pub model: Arc<Scripted>,
    pub h: Harness,
    pub token: String,
}

pub async fn fixture() -> Fixture {
    let schema = TestSchema::open().await;
    let identity = Arc::new(
        IdentityService::start(schema.pool.clone(), "fixture-secret-not-real", Some("1h"))
            .await
            .unwrap(),
    );
    let model = Arc::new(Scripted::default());
    let h = Harness::with_services(Services {
        accounts: identity.clone(),
        authenticator: identity.clone(),
        session_presence: support::session_presence(schema.pool.clone()),
        support: support::SupportFlow::live(
            schema.pool.clone(),
            model.clone(),
            identity,
            Arc::new(support::UnimplementedJudge),
            1,
            0.5,
            false,
            Arc::new(support::ModelMemoryExtractor(
                beside_pet_server::llm::MemoryExtract::new(model.clone()),
            )),
        ),
        ..Services::unimplemented()
    });
    let token = account_token(&h, &schema, USERNAME, PASSWORD).await;
    let start = json!({ "sessionId": SESSION, "griefProfile": { "griefPath": "afterLoss", "petName": "Pebble" } });
    let reply = h
        .send(Method::POST, "/v1/sessions", Some(&token), Some(start))
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text);
    Fixture {
        schema,
        model,
        h,
        token,
    }
}

/// 계정을 만들어 활성으로 바꾸고 로그인해 인증 쿠키의 값을 낸다.
pub async fn account_token(
    h: &Harness,
    schema: &TestSchema,
    username: &str,
    password: &str,
) -> String {
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/register",
            None,
            Some(
                json!({ "username": username, "password": password, "company": "Fictional Pets" }),
            ),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text);
    schema
        .exec(&format!(
            "UPDATE accounts SET status = 'active' WHERE username = '{username}'"
        ))
        .await;
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/login",
            None,
            Some(json!({ "username": username, "password": password })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    reply
        .headers
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|v| v.strip_prefix("beside-pet.token="))
        .and_then(|v| v.split(';').next())
        .expect("인증 쿠키가 없다")
        .to_owned()
}

impl Fixture {
    pub async fn say(&self, body: Value) -> crate::harness::Reply {
        self.h
            .send(
                Method::POST,
                &format!("/v1/sessions/{SESSION}/messages"),
                Some(&self.token),
                Some(body),
            )
            .await
    }

    pub async fn history(&self) -> Vec<Value> {
        let reply = self
            .h
            .send(
                Method::GET,
                &format!("/v1/sessions/{SESSION}/messages"),
                Some(&self.token),
                None,
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
        reply.body.as_array().unwrap().clone()
    }

    pub async fn count(&self, sql: &str, id: &str) -> i64 {
        sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_owned()))
            .bind(id)
            .fetch_one(&self.schema.pool)
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn 같은_턴_id_로_두_번_보내면_두_번째는_409_이고_메시지_행은_하나다() {
    let f = fixture().await;

    let first = f.say(json!({ "text": WORDS, "turnId": TURN_ID })).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.text);
    let again = f.say(json!({ "text": WORDS, "turnId": TURN_ID })).await;

    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(
        again.body,
        json!({ "statusCode": 409, "message": "Turn already received", "error": "Conflict" })
    );
    let users = f
        .count(
            "SELECT count(*) FROM messages WHERE turn_id = $1 AND role = 'user'",
            TURN_ID,
        )
        .await;
    assert_eq!(users, 1);
    let history = f.history().await;
    let ours: Vec<&Value> = history
        .iter()
        .filter(|m| m["turnId"] == json!(TURN_ID))
        .collect();
    assert_eq!(ours.len(), 2, "the user's words and the reply: {history:?}");
    f.schema.close().await;
}

#[tokio::test]
async fn 턴_id_없이_보내면_서버가_만들고_기록의_항목마다_turn_id_가_있다() {
    let f = fixture().await;

    let reply = f.say(json!({ "text": WORDS })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);

    let history = f.history().await;
    assert_eq!(history.len(), 3, "greeting, words, reply: {history:?}");
    for item in &history {
        let id = item["turnId"].as_str().expect("every item has a turnId");
        uuid::Uuid::parse_str(id).expect("a UUID");
    }
    assert_eq!(history[1]["turnId"], history[2]["turnId"]);
    assert_ne!(history[0]["turnId"], history[1]["turnId"]);
    f.schema.close().await;
}

#[tokio::test]
async fn 발화가_실패하면_500_이고_사용자_메시지와_실패한_턴이_남고_과제는_그대로다() {
    let f = fixture().await;
    f.model.fail.store(true, Ordering::SeqCst);

    let reply = f
        .say(json!({ "text": WORDS, "turnId": FAILED_TURN_ID }))
        .await;

    assert_eq!(reply.status, StatusCode::INTERNAL_SERVER_ERROR);
    let history = f.history().await;
    let last = history.last().unwrap();
    assert_eq!(last["role"], json!("user"));
    assert_eq!(last["text"], json!(WORDS));
    assert_eq!(last["turnId"], json!(FAILED_TURN_ID));
    let failed = f
        .count(
            "SELECT count(*) FROM turns WHERE id = $1 AND status = 'failed' AND error_kind = 'provider'",
            FAILED_TURN_ID,
        )
        .await;
    assert_eq!(failed, 1);
    let state =
        f.h.send(
            Method::GET,
            &format!("/v1/sessions/{SESSION}"),
            Some(&f.token),
            None,
        )
        .await;
    assert_eq!(state.body["task"], json!(1));
    assert_eq!(state.body["supportLevel"], json!(1));
    assert_eq!(state.body["closed"], json!(false));

    // 같은 id 로 다시 보내면 받았다는 409 다(웹은 기록을 다시 읽는다).
    f.model.fail.store(false, Ordering::SeqCst);
    let again = f
        .say(json!({ "text": WORDS, "turnId": FAILED_TURN_ID }))
        .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    f.schema.close().await;
}

#[tokio::test]
async fn 스트림이_실패해도_사용자_메시지는_기록에_남는다() {
    let f = fixture().await;
    f.model.fail.store(true, Ordering::SeqCst);

    let reply =
        f.h.send(
            Method::POST,
            &format!("/v1/sessions/{SESSION}/messages/stream"),
            Some(&f.token),
            Some(json!({ "text": WORDS, "turnId": FAILED_TURN_ID })),
        )
        .await;

    assert_eq!(reply.status, StatusCode::OK);
    assert!(reply.text.contains("\"kind\":\"meta\""), "{}", reply.text);
    assert!(!reply.text.contains("\"kind\":\"done\""), "{}", reply.text);
    let history = f.history().await;
    assert_eq!(history.last().unwrap()["turnId"], json!(FAILED_TURN_ID));
    f.schema.close().await;
}

#[tokio::test]
async fn 턴_id_가_uuid_가_아니면_400_이다() {
    let f = fixture().await;

    let reply = f
        .say(json!({ "text": WORDS, "turnId": "not-a-uuid" }))
        .await;

    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.body["message"], json!(["turnId must be a UUID"]));
    f.schema.close().await;
}

#[tokio::test]
async fn 기동_정리는_남은_pending_턴을_restart_로_닫는다() {
    let f = fixture().await;
    f.schema
        .exec(&format!(
            "INSERT INTO turns (id, session_id, status, started_at) \
             VALUES ('{TURN_ID}', '{SESSION}', 'pending', now())"
        ))
        .await;

    let closed = support::fail_pending_turns(f.schema.pool.clone(), Utc::now())
        .await
        .unwrap();

    assert_eq!(closed, 1);
    let restarted = f
        .count(
            "SELECT count(*) FROM turns WHERE id = $1 AND status = 'failed' AND error_kind = 'restart'",
            TURN_ID,
        )
        .await;
    assert_eq!(restarted, 1);
    f.schema.close().await;
}
