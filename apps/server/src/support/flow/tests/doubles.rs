//! 흐름 테스트의 더블: 요청을 적어 두는 대본 모델, 메모리 저장, 고정 언어, 한 번에 1초씩 가는 시계, 그리고 조립 도우미.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use chrono::{DateTime, TimeZone, Utc};
use futures_util::future::{self, BoxFuture};
use futures_util::stream::{self, StreamExt};

use super::super::deadline::CallLimits;
use super::super::outside::{ChatLanguages, Clock, SessionRepository};
use super::super::{FlowParts, SupportFlow};
use crate::identity::ChatLanguage;
use crate::llm::{CallContext, GenerationRequest, TextModel, TextStream};
use crate::safety::RISK_SYSTEM_PROMPT;
use crate::shared::ApiError;
use crate::support::knowledge::KnowledgeBase;
use crate::support::rules::GriefProfile;
use crate::support::session::{MessageActivity, SessionSnapshot};
use crate::support::{
    GriefPath, Requester, StartSessionRequest, StreamEvent, SupportService, TurnStream,
};

pub const SESSION_ID: &str = "s-1";
pub const OWNER_ID: &str = "acct-owner";
pub const OTHER_ID: &str = "acct-other";
pub const ADMIN_ID: &str = "acct-admin";

/// 키워드 스크린에 걸리는 지어낸 위기 문장.
pub const KEYWORD_CRISIS: &str = "Since Biscuit died I just want to die.";
/// 키워드에는 걸리지 않고 모델 판정만 위기로 보는 문장.
pub const QUIET_CRISIS: &str = "I keep thinking everyone would be lighter without me.";
/// 진솔한 답(여덟 글자를 넘는다).
pub const ENGAGED: &str = "We walked by the river every single morning.";
/// 비몰입 답.
pub const DUNNO: &str = "I don't know";

pub const REPLY_CHUNKS: [&str; 3] = ["I'm here ", "with you. ", "What was Biscuit like?"];
pub const REPORT_TEXT: &str = "@@journey You walked far today.\n@@emotions sadness, love\nYour sadness is love.\n\
@@keepsake The river walks stay with you.\n@@encouragement Be gentle with yourself.";
pub const REPORT_TEXT_WITHOUT_TAGS: &str = "@@journey You walked far today.\n@@emotions Your sadness is love.\n\
@@keepsake The river walks stay with you.\n@@encouragement Be gentle with yourself.";

pub fn reply_text() -> String {
    REPLY_CHUNKS.concat()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Call {
    Risk(String),
    Reply(GenerationRequest),
    StreamReply(GenerationRequest),
    Report(GenerationRequest),
}

/// 모델이 멈추는 자리.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hang {
    Never,
    /// 위기 판정의 `generate` 가 답하지 않는다.
    Risk,
    /// 발화의 `generate` 가 답하지 않는다.
    Reply,
    /// 발화 스트림이 첫 조각 뒤로 멈춘다.
    StreamAfterFirst,
}

/// 요청의 모양으로 위기 판정·발화·리포트를 가려 대본의 답을 내고, 받은 요청을 적어 둔다.
pub struct ScriptedModel {
    risk_answer: &'static str,
    hang: Hang,
    stream_fails: bool,
    report_text: &'static str,
    calls: Mutex<Vec<Call>>,
    /// 받은 요청의 호출 맥락(부른 순서).
    contexts: Mutex<Vec<CallContext>>,
}

impl ScriptedModel {
    pub fn new() -> ScriptedModel {
        ScriptedModel::with(Hang::Never)
    }

    pub fn with(hang: Hang) -> ScriptedModel {
        ScriptedModel {
            risk_answer: "NO",
            hang,
            stream_fails: false,
            report_text: REPORT_TEXT,
            calls: Mutex::new(Vec::new()),
            contexts: Mutex::new(Vec::new()),
        }
    }

    /// 위기 판정에 YES 라고 답한다.
    pub fn flagging() -> ScriptedModel {
        ScriptedModel {
            risk_answer: "YES",
            ..ScriptedModel::new()
        }
    }

    /// 리포트에 감정 낱말 줄이 없다(옛 프롬프트의 출력).
    pub fn report_without_tags() -> ScriptedModel {
        ScriptedModel {
            report_text: REPORT_TEXT_WITHOUT_TAGS,
            ..ScriptedModel::new()
        }
    }

    /// 발화 스트림이 첫 조각 뒤에 실패한다.
    pub fn failing_stream() -> ScriptedModel {
        ScriptedModel {
            stream_fails: true,
            ..ScriptedModel::new()
        }
    }

    pub fn calls(&self) -> Vec<Call> {
        self.calls.lock().unwrap().clone()
    }

    pub fn contexts(&self) -> Vec<CallContext> {
        self.contexts.lock().unwrap().clone()
    }

    /// 발화를 쓴 호출(동기와 스트림)의 수.
    pub fn reply_calls(&self) -> usize {
        self.calls()
            .iter()
            .filter(|call| matches!(call, Call::Reply(_) | Call::StreamReply(_)))
            .count()
    }

    pub fn report_calls(&self) -> usize {
        self.calls()
            .iter()
            .filter(|call| matches!(call, Call::Report(_)))
            .count()
    }

    /// 마지막 발화 요청(동기나 스트림).
    pub fn last_reply_request(&self) -> GenerationRequest {
        self.calls()
            .into_iter()
            .rev()
            .find_map(|call| match call {
                Call::Reply(request) | Call::StreamReply(request) => Some(request),
                _ => None,
            })
            .expect("a reply was requested")
    }

    fn push(&self, call: Call) {
        self.calls.lock().unwrap().push(call);
    }
}

impl TextModel for ScriptedModel {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        self.contexts.lock().unwrap().push(request.context.clone());
        if request.system.as_deref() == Some(RISK_SYSTEM_PROMPT) {
            let text = request.messages[0].text.clone();
            self.push(Call::Risk(text));
            if self.hang == Hang::Risk {
                return Box::pin(future::pending());
            }
            let answer = self.risk_answer.to_owned();
            return Box::pin(async move { Ok(answer) });
        }
        if request.max_tokens == 900 {
            self.push(Call::Report(request));
            let text = self.report_text.to_owned();
            return Box::pin(async move { Ok(text) });
        }
        self.push(Call::Reply(request));
        if self.hang == Hang::Reply {
            return Box::pin(future::pending());
        }
        // 앞뒤 공백은 흐름이 걷는다.
        Box::pin(async { Ok(format!("  {}\n", reply_text())) })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        self.contexts.lock().unwrap().push(request.context.clone());
        self.push(Call::StreamReply(request));
        if self.stream_fails {
            return Box::pin(stream::iter([
                Ok(REPLY_CHUNKS[0].to_owned()),
                Err(ApiError::Internal),
            ]));
        }
        if self.hang == Hang::StreamAfterFirst {
            return Box::pin(
                stream::once(async { Ok(REPLY_CHUNKS[0].to_owned()) }).chain(stream::pending()),
            );
        }
        Box::pin(stream::iter(REPLY_CHUNKS.map(|chunk| Ok(chunk.to_owned()))))
    }
}

/// 메모리 저장. 저장할 때마다 스냅샷을 적어 둔다.
#[derive(Default)]
pub struct MemorySessions {
    rows: Mutex<HashMap<String, SessionSnapshot>>,
    saves: Mutex<Vec<SessionSnapshot>>,
}

impl MemorySessions {
    pub fn saves(&self) -> Vec<SessionSnapshot> {
        self.saves.lock().unwrap().clone()
    }

    pub fn last_save(&self) -> SessionSnapshot {
        self.saves().pop().expect("the session was saved")
    }

    pub fn get(&self, id: &str) -> Option<SessionSnapshot> {
        self.rows.lock().unwrap().get(id).cloned()
    }

    pub fn put(&self, snapshot: SessionSnapshot) {
        self.rows
            .lock()
            .unwrap()
            .insert(snapshot.id.clone(), snapshot);
    }
}

impl SessionRepository for MemorySessions {
    fn save<'a>(&'a self, snapshot: &'a SessionSnapshot) -> BoxFuture<'a, Result<(), ApiError>> {
        self.saves.lock().unwrap().push(snapshot.clone());
        self.put(snapshot.clone());
        Box::pin(async { Ok(()) })
    }

    fn find<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Option<SessionSnapshot>, ApiError>> {
        let found = self.get(id);
        Box::pin(async move { Ok(found) })
    }

    fn find_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
        limit: u32,
    ) -> BoxFuture<'a, Result<Vec<SessionSnapshot>, ApiError>> {
        let mut found: Vec<SessionSnapshot> = self
            .rows
            .lock()
            .unwrap()
            .values()
            .filter(|snapshot| snapshot.owner_id == owner_id)
            .cloned()
            .collect();
        found.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.started_at));
        found.truncate(limit as usize);
        Box::pin(async move { Ok(found) })
    }

    /// 저장이 질의로 구하는 집계를 전사에서 같은 규칙(마지막 시각, 첫·마지막 사이의 분 내림, 수)으로 구한다.
    fn message_activity<'a>(
        &'a self,
        session_ids: &'a [&'a str],
    ) -> BoxFuture<'a, Result<HashMap<String, MessageActivity>, ApiError>> {
        let rows = self.rows.lock().unwrap();
        let found: HashMap<String, MessageActivity> = session_ids
            .iter()
            .filter_map(|id| rows.get(*id))
            .filter_map(|snapshot| {
                let first = snapshot.history.first()?.at;
                let last = snapshot.history.last()?.at;
                Some((
                    snapshot.id.clone(),
                    MessageActivity {
                        last_message_at: Some(last),
                        duration_minutes: u32::try_from((last - first).num_minutes()).ok(),
                        message_count: u32::try_from(snapshot.history.len()).unwrap(),
                    },
                ))
            })
            .collect();
        Box::pin(async move { Ok(found) })
    }

    fn delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<(), ApiError>> {
        self.rows.lock().unwrap().remove(id);
        Box::pin(async { Ok(()) })
    }
}

/// 계정마다 정해 둔 대화 언어.
#[derive(Default)]
pub struct FixedLanguages(pub HashMap<String, ChatLanguage>);

impl ChatLanguages for FixedLanguages {
    fn chat_language<'a>(
        &'a self,
        account_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<ChatLanguage>, ApiError>> {
        let language = self.0.get(account_id).copied();
        Box::pin(async move { Ok(language) })
    }
}

/// 부를 때마다 1초씩 가는 시계.
pub struct StepClock {
    ticks: AtomicI64,
}

pub fn base_time() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap()
}

impl Clock for StepClock {
    fn now(&self) -> DateTime<Utc> {
        let tick = self.ticks.fetch_add(1, Ordering::SeqCst);
        base_time() + chrono::Duration::seconds(tick)
    }
}

/// 테스트의 제한(짧다). 정상 더블은 곧바로 답하므로 걸리지 않는다.
pub const TEST_LIMITS: CallLimits = CallLimits {
    generate: Duration::from_millis(300),
    stream_idle: Duration::from_millis(200),
};

pub const KNOWLEDGE_JSON: &str = r#"{"chunks":[
 {"source":"Fixture task one","task_id":1,"tags":["acceptance"],"content":"Grief comes in waves."},
 {"source":"Fixture task two","task_id":2,"tags":["pain"],"content":"Pain is allowed to be felt."}
]}"#;

/// 조립한 흐름과 그 더블들.
pub struct Harness {
    pub flow: SupportFlow,
    pub model: Arc<ScriptedModel>,
    pub sessions: Arc<MemorySessions>,
}

impl Harness {
    pub fn new() -> Harness {
        Harness::with(ScriptedModel::new(), FixedLanguages::default())
    }

    pub fn with_model(model: ScriptedModel) -> Harness {
        Harness::with(model, FixedLanguages::default())
    }

    pub fn with(model: ScriptedModel, languages: FixedLanguages) -> Harness {
        let model = Arc::new(model);
        let sessions = Arc::new(MemorySessions::default());
        let flow = SupportFlow::new(FlowParts {
            model: model.clone(),
            sessions: sessions.clone(),
            knowledge: KnowledgeBase::from_json(KNOWLEDGE_JSON),
            languages: Arc::new(languages),
            clock: Arc::new(StepClock {
                ticks: AtomicI64::new(0),
            }),
            limits: TEST_LIMITS,
        });
        Harness {
            flow,
            model,
            sessions,
        }
    }

    /// 온보딩으로 `SESSION_ID` 를 시작한다.
    pub async fn onboard(&self) {
        self.flow
            .start(&owner(), onboarding(SESSION_ID))
            .await
            .expect("the session starts");
    }

    /// 주인으로 한 턴 보낸다.
    pub async fn say(&self, text: &str) -> crate::support::TurnResponse {
        self.flow
            .send(&owner(), SESSION_ID, text.to_owned())
            .await
            .expect("the turn succeeds")
    }
}

pub fn owner() -> Requester {
    Requester {
        account_id: OWNER_ID.to_owned(),
        is_admin: false,
    }
}

pub fn other() -> Requester {
    Requester {
        account_id: OTHER_ID.to_owned(),
        is_admin: false,
    }
}

pub fn admin() -> Requester {
    Requester {
        account_id: ADMIN_ID.to_owned(),
        is_admin: true,
    }
}

pub fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("Biscuit".to_owned()),
        together_range: None,
        loss_type: None,
        situation: None,
        weeks_since_loss: Some(2.0),
        daily_state: None,
        preferred_language: None,
    }
}

pub fn onboarding(session_id: &str) -> StartSessionRequest {
    StartSessionRequest {
        session_id: session_id.to_owned(),
        grief_profile: Some(profile()),
    }
}

pub fn resuming(session_id: &str) -> StartSessionRequest {
    StartSessionRequest {
        session_id: session_id.to_owned(),
        grief_profile: None,
    }
}

/// 스트림을 끝까지 모은다. 걸리면 테스트가 실패하도록 2초로 묶는다.
pub async fn collect(events: TurnStream) -> Vec<Result<StreamEvent, ApiError>> {
    tokio::time::timeout(Duration::from_secs(2), events.collect::<Vec<_>>())
        .await
        .expect("the stream ends")
}

/// 스트림의 토큰을 이어 붙인다.
pub fn joined_tokens(events: &[Result<StreamEvent, ApiError>]) -> String {
    events
        .iter()
        .filter_map(|event| match event {
            Ok(StreamEvent::Token { text }) => Some(text.as_str()),
            _ => None,
        })
        .collect()
}
