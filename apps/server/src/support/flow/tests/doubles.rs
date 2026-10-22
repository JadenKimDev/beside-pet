//! 흐름 테스트의 더블: 요청을 적어 두는 대본 모델, 메모리 저장, 고정 언어, 한 번에 1초씩 가는 시계, 그리고 조립 도우미.
//! 대본 모델은 실제 라우터(`ModelRouter`) 뒤의 공급자로 끼워, 시간 제한과 호출 기록을 서버와 같은 자리에서 잰다.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use chrono::{DateTime, TimeZone, Utc};
use futures_util::future::{self, BoxFuture};
use futures_util::stream::{self, StreamExt};
use tokio::sync::Semaphore;

use super::super::judging::Judging;
use super::super::outside::{ChatLanguages, Clock, LatestSession, SessionRepository};
use super::super::{FlowParts, SupportFlow};
use crate::identity::ChatLanguage;
use crate::llm::{
    CallContext, CallErrorKind, CallLimits, CallOutcome, CallPurpose, Generation,
    GenerationRequest, InMemoryUsageSink, LlmProvider, ModelRef, ModelRouter, ProviderStream,
    StreamEvent as ProviderEvent, TextModel, TextModelProvider, TextStream, TokenUsage,
};
use crate::safety::RISK_SYSTEM_PROMPT;
use crate::shared::ApiError;
use crate::support::knowledge::KnowledgeBase;
use crate::support::rules::GriefProfile;
use crate::support::session::{MessageActivity, SessionSnapshot};
use crate::support::{
    GriefPath, Requester, SendMessageRequest, StartSessionRequest, StreamEvent, SupportService,
    TurnStream,
};
use crate::support::{MemoryNote, MemoryOptout, MemoryStore, MemoryView, NewNote, NewPet, Pet};

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

/// 테스트가 도중에 거는 발화의 고장(동기와 스트림 모두). 첫 인사를 마친 뒤 걸어 사용자 턴만 망가뜨린다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplyFault {
    /// 공급자가 오류를 낸다.
    Provider,
    /// 답하지 않는다(시간 제한에 걸린다).
    Hang,
}

/// 요청의 모양으로 위기 판정·발화·리포트를 가려 대본의 답을 내고, 받은 요청을 적어 둔다.
pub struct ScriptedModel {
    risk_answer: &'static str,
    /// 위기 판정의 `generate` 가 공급자 오류를 낸다.
    risk_fails: bool,
    hang: Hang,
    fault: Mutex<Option<ReplyFault>>,
    stream_fails: bool,
    report_text: &'static str,
    /// 동기 발화의 답. 없으면 `reply_text()`(질문으로 끝난다).
    statement: Option<&'static str>,
    calls: Mutex<Vec<Call>>,
    /// 받은 요청의 호출 맥락(부른 순서).
    contexts: Mutex<Vec<CallContext>>,
    /// 있으면 발화 스트림이 첫 조각 뒤의 조각마다 이 문의 허가를 하나씩 기다린다.
    pace: Option<Arc<Semaphore>>,
    /// 동기 발화가 차례로 낼 답(후보마다 다른 글). 다 쓰면 `statement` 나 `reply_text()` 로 돌아간다.
    answers: Mutex<std::collections::VecDeque<&'static str>>,
}

impl ScriptedModel {
    pub fn new() -> ScriptedModel {
        ScriptedModel::with(Hang::Never)
    }

    pub fn with(hang: Hang) -> ScriptedModel {
        ScriptedModel {
            risk_answer: "NO",
            risk_fails: false,
            hang,
            fault: Mutex::new(None),
            stream_fails: false,
            report_text: REPORT_TEXT,
            statement: None,
            calls: Mutex::new(Vec::new()),
            contexts: Mutex::new(Vec::new()),
            pace: None,
            answers: Mutex::new(std::collections::VecDeque::new()),
        }
    }

    /// 이제부터 동기 발화가 이 답들을 차례로 낸다.
    pub fn answer_in_turn(&self, answers: &[&'static str]) {
        self.answers.lock().unwrap().extend(answers.iter().copied());
    }

    /// 발화 스트림이 첫 조각을 곧바로 내고, 나머지 조각은 `pace()` 의 허가마다 하나씩 낸다.
    pub fn paced() -> ScriptedModel {
        ScriptedModel {
            pace: Some(Arc::new(Semaphore::new(0))),
            ..ScriptedModel::new()
        }
    }

    /// `paced` 의 문. 허가 하나에 조각 하나가 나간다.
    pub fn pace(&self) -> Arc<Semaphore> {
        self.pace.clone().expect("a paced model")
    }

    /// 위기 판정에 YES 라고 답한다.
    pub fn flagging() -> ScriptedModel {
        ScriptedModel {
            risk_answer: "YES",
            ..ScriptedModel::new()
        }
    }

    /// 위기 판정이 공급자 오류로 실패한다(YES 라고 답할 모델이라도).
    pub fn failing_risk() -> ScriptedModel {
        ScriptedModel {
            risk_answer: "YES",
            risk_fails: true,
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

    /// 동기 발화가 질문으로 끝나지 않는 이 답을 낸다.
    pub fn answering(statement: &'static str) -> ScriptedModel {
        ScriptedModel {
            statement: Some(statement),
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

    /// 이제부터 발화가 `fault` 로 망가진다.
    pub fn break_replies(&self, fault: ReplyFault) {
        *self.fault.lock().unwrap() = Some(fault);
    }

    /// 발화를 다시 정상으로 돌린다.
    pub fn mend_replies(&self) {
        *self.fault.lock().unwrap() = None;
    }

    fn fault(&self) -> Option<ReplyFault> {
        *self.fault.lock().unwrap()
    }

    /// 위기 판정을 부른 수.
    pub fn risk_calls(&self) -> usize {
        self.calls()
            .iter()
            .filter(|call| matches!(call, Call::Risk(_)))
            .count()
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
            if self.risk_fails {
                return Box::pin(async { Err(ApiError::Internal) });
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
        match self.fault() {
            Some(ReplyFault::Provider) => return Box::pin(async { Err(ApiError::Internal) }),
            Some(ReplyFault::Hang) => return Box::pin(future::pending()),
            None => {}
        }
        if self.hang == Hang::Reply {
            return Box::pin(future::pending());
        }
        // 앞뒤 공백은 흐름이 걷는다.
        let next = self.answers.lock().unwrap().pop_front();
        let text = next
            .or(self.statement)
            .map_or_else(reply_text, str::to_owned);
        Box::pin(async move { Ok(format!("  {text}\n")) })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        self.contexts.lock().unwrap().push(request.context.clone());
        self.push(Call::StreamReply(request));
        match self.fault() {
            Some(ReplyFault::Provider) => {
                return Box::pin(stream::once(async { Err(ApiError::Internal) }));
            }
            Some(ReplyFault::Hang) => return Box::pin(stream::pending()),
            None => {}
        }
        if self.stream_fails {
            return Box::pin(stream::iter([
                Ok(REPLY_CHUNKS[0].to_owned()),
                Err(ApiError::Internal),
            ]));
        }
        if let Some(pace) = self.pace.clone() {
            return Box::pin(stream::iter(REPLY_CHUNKS.into_iter().enumerate()).then(
                move |(index, chunk)| {
                    let pace = pace.clone();
                    async move {
                        if index > 0 {
                            pace.acquire().await.expect("the pace stays open").forget();
                        }
                        Ok(chunk.to_owned())
                    }
                },
            ));
        }
        if self.hang == Hang::StreamAfterFirst {
            return Box::pin(
                stream::once(async { Ok(REPLY_CHUNKS[0].to_owned()) }).chain(stream::pending()),
            );
        }
        Box::pin(stream::iter(REPLY_CHUNKS.map(|chunk| Ok(chunk.to_owned()))))
    }
}

/// 대본 모델을 라우터 뒤의 공급자로 끼운다. 글은 그대로 넘기고 토큰 수는 0 이다.
struct ScriptedProvider(Arc<ScriptedModel>);

impl TextModelProvider for ScriptedProvider {
    fn provider(&self) -> LlmProvider {
        LlmProvider::Ollama
    }

    fn generate(
        &self,
        _model: &str,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        let call = self.0.generate(request);
        Box::pin(async move {
            call.await.map(|text| Generation {
                text,
                usage: TokenUsage::default(),
            })
        })
    }

    fn stream(&self, _model: &str, request: GenerationRequest) -> ProviderStream {
        Box::pin(
            self.0
                .stream(request)
                .map(|chunk| chunk.map(ProviderEvent::Text)),
        )
    }
}

/// 메모리 저장. 저장할 때마다 스냅샷을 적어 둔다. 문을 걸면(`hold_saves`) 저장이 문이 열릴 때까지 기다린다.
#[derive(Default)]
pub struct MemorySessions {
    rows: Mutex<HashMap<String, SessionSnapshot>>,
    saves: Mutex<Vec<SessionSnapshot>>,
    gate: Mutex<Option<Arc<Semaphore>>>,
}

impl MemorySessions {
    /// 이제부터 저장이 기다린다. 돌려준 문에 `add_permits` 를 하면 그 수만큼 저장이 지나간다.
    pub fn hold_saves(&self) -> Arc<Semaphore> {
        let gate = Arc::new(Semaphore::new(0));
        *self.gate.lock().unwrap() = Some(gate.clone());
        gate
    }

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
        let gate = self.gate.lock().unwrap().clone();
        Box::pin(async move {
            if let Some(gate) = gate {
                gate.acquire().await.expect("the gate stays open").forget();
            }
            self.saves.lock().unwrap().push(snapshot.clone());
            self.put(snapshot.clone());
            Ok(())
        })
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

    /// 저장의 질의와 같은 규칙: 마지막 메시지 시각(없으면 시작)이 가장 늦은 세션, 동률은 시작과 id 가 큰 쪽.
    fn latest_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<LatestSession>, ApiError>> {
        let found = self
            .rows
            .lock()
            .unwrap()
            .values()
            .filter(|snapshot| snapshot.owner_id == owner_id)
            .map(|snapshot| LatestSession {
                last_active_at: snapshot
                    .history
                    .iter()
                    .map(|message| message.at)
                    .max()
                    .unwrap_or(snapshot.started_at),
                snapshot: snapshot.clone(),
            })
            .max_by(|a, b| {
                (a.last_active_at, a.snapshot.started_at, &a.snapshot.id).cmp(&(
                    b.last_active_at,
                    b.snapshot.started_at,
                    &b.snapshot.id,
                ))
            });
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

/// 소유자마다 현재 기억을 들고 있는 저장. 테스트가 `set` 으로 놓고, 아이와 사실 쓰기는 그 목록에 더한다(옵트아웃은 버린다).
#[derive(Default)]
pub struct MemoryNotes {
    views: Mutex<HashMap<String, MemoryView>>,
    /// 참이면 `view` 가 저장 오류를 낸다.
    failing: std::sync::atomic::AtomicBool,
}

impl MemoryNotes {
    pub fn set(&self, owner_id: &str, view: MemoryView) {
        self.views.lock().unwrap().insert(owner_id.to_owned(), view);
    }

    pub fn fail_reads(&self) {
        self.failing.store(true, Ordering::SeqCst);
    }
}

impl MemoryStore for MemoryNotes {
    fn view<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<MemoryView, ApiError>> {
        let found = if self.failing.load(Ordering::SeqCst) {
            Err(ApiError::Internal)
        } else {
            Ok(self
                .views
                .lock()
                .unwrap()
                .get(owner_id)
                .cloned()
                .unwrap_or_default())
        };
        Box::pin(async move { found })
    }

    fn upsert_pet<'a>(&'a self, pet: &'a NewPet) -> BoxFuture<'a, Result<Pet, ApiError>> {
        let mut views = self.views.lock().unwrap();
        let view = views.entry(pet.owner_id.clone()).or_default();
        let found = match view.pets.iter().find(|row| row.name == pet.name) {
            Some(row) => row.clone(),
            None => {
                let row = Pet {
                    id: format!("pet-{}", view.pets.len() + 1),
                    name: pet.name.clone(),
                    status: pet.status,
                    loss_type: pet.loss_type,
                    source_session_id: pet.source_session_id.clone(),
                    said_at: pet.said_at,
                };
                view.pets.push(row.clone());
                row
            }
        };
        Box::pin(async move { Ok(found) })
    }

    fn insert_note<'a>(
        &'a self,
        note: &'a NewNote,
        supersedes: &'a [String],
    ) -> BoxFuture<'a, Result<MemoryNote, ApiError>> {
        let mut views = self.views.lock().unwrap();
        let view = views.entry(note.owner_id.clone()).or_default();
        view.notes.retain(|row| !supersedes.contains(&row.id));
        let row = MemoryNote {
            id: format!("note-{}-{}", note.session_id, note.seq),
            session_id: note.session_id.clone(),
            seq: note.seq,
            kind: note.kind,
            pet_id: note.pet_id.clone(),
            text: note.text.clone(),
            said_at: note.said_at,
        };
        view.notes.insert(0, row.clone());
        Box::pin(async move { Ok(row) })
    }

    fn record_optout<'a>(
        &'a self,
        _optout: &'a MemoryOptout,
    ) -> BoxFuture<'a, Result<(), ApiError>> {
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

/// 테스트에서 라우터가 두르는 제한(짧다). 정상 더블은 곧바로 답하므로 걸리지 않는다.
pub const TEST_LIMITS: CallLimits = CallLimits {
    generate: Duration::from_millis(300),
    stream_idle: Duration::from_millis(200),
};

/// 테스트가 도중에 끼어들 틈이 있는 제한. 테스트 자체는 2초로 묶는다.
pub const SLOW_LIMITS: CallLimits = CallLimits {
    generate: Duration::from_secs(5),
    stream_idle: Duration::from_secs(5),
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
    pub memory: Arc<MemoryNotes>,
    /// 라우터가 남긴 모델 호출 기록(`llm_calls` 의 행).
    pub calls: Arc<InMemoryUsageSink>,
}

impl Harness {
    pub fn new() -> Harness {
        Harness::with(ScriptedModel::new(), FixedLanguages::default())
    }

    pub fn with_model(model: ScriptedModel) -> Harness {
        Harness::with(model, FixedLanguages::default())
    }

    pub fn with(model: ScriptedModel, languages: FixedLanguages) -> Harness {
        Harness::assemble(model, languages, TEST_LIMITS)
    }

    /// 제한을 넉넉히(`SLOW_LIMITS`) 둔다. 테스트가 도중에 끼어드는(중단, 다시 붙기) 턴에 쓴다.
    pub fn slow(model: ScriptedModel) -> Harness {
        Harness::assemble(model, FixedLanguages::default(), SLOW_LIMITS)
    }

    /// 답 판정기를 끼운다(후보 수와 임계값도). 도중에 끼어드는 턴도 쓰도록 제한은 넉넉히(`SLOW_LIMITS`) 둔다.
    pub fn judged(model: ScriptedModel, judging: Judging) -> Harness {
        Harness::build(
            model,
            FixedLanguages::default(),
            SLOW_LIMITS,
            judging,
            false,
        )
    }

    /// sandbox 처럼 답한 턴마다 발화 프롬프트의 추적을 남긴다.
    pub fn traced(model: ScriptedModel) -> Harness {
        Harness::build(
            model,
            FixedLanguages::default(),
            TEST_LIMITS,
            Judging::off(),
            true,
        )
    }

    fn assemble(model: ScriptedModel, languages: FixedLanguages, limits: CallLimits) -> Harness {
        Harness::build(model, languages, limits, Judging::off(), false)
    }

    fn build(
        model: ScriptedModel,
        languages: FixedLanguages,
        limits: CallLimits,
        judging: Judging,
        trace_turns: bool,
    ) -> Harness {
        let model = Arc::new(model);
        let sessions = Arc::new(MemorySessions::default());
        let memory = Arc::new(MemoryNotes::default());
        let calls = Arc::new(InMemoryUsageSink::default());
        let router = ModelRouter::new(
            ModelRef {
                provider: LlmProvider::Ollama,
                model: "scripted".to_owned(),
            },
            vec![Box::new(ScriptedProvider(model.clone()))],
            calls.clone(),
        )
        .with_limits(limits);
        let flow = SupportFlow::new(FlowParts {
            model: Arc::new(router),
            sessions: sessions.clone(),
            memory: memory.clone(),
            knowledge: KnowledgeBase::from_json(KNOWLEDGE_JSON),
            languages: Arc::new(languages),
            clock: Arc::new(StepClock {
                ticks: AtomicI64::new(0),
            }),
            judging,
            trace_turns,
        });
        Harness {
            flow,
            model,
            sessions,
            memory,
            calls,
        }
    }

    /// 라우터가 이 목적의 호출을 실패로 적은 종류들(적은 순서).
    pub fn call_errors(&self, purpose: CallPurpose) -> Vec<CallErrorKind> {
        self.calls
            .list()
            .into_iter()
            .filter(|record| record.purpose == purpose)
            .filter_map(|record| match record.outcome {
                CallOutcome::Error(kind) => Some(kind),
                CallOutcome::Ok => None,
            })
            .collect()
    }

    /// 온보딩으로 `SESSION_ID` 를 시작한다.
    pub async fn onboard(&self) {
        self.flow
            .start(&owner(), onboarding(SESSION_ID))
            .await
            .expect("the session starts");
    }

    /// 주인으로 한 턴 보낸다(턴 id 는 서버가 만든다).
    pub async fn say(&self, text: &str) -> crate::support::TurnResponse {
        self.flow
            .send(&owner(), SESSION_ID, message(text))
            .await
            .expect("the turn succeeds")
    }
}

/// 턴 id 없는 본문.
pub fn message(text: &str) -> SendMessageRequest {
    SendMessageRequest {
        text: text.to_owned(),
        turn_id: None,
    }
}

/// 클라이언트가 만든 턴 id 를 실은 본문.
pub fn message_with(text: &str, turn_id: &str) -> SendMessageRequest {
    SendMessageRequest {
        text: text.to_owned(),
        turn_id: Some(turn_id.to_owned()),
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

/// 스트림의 다음 항목. 걸리면 테스트가 실패하도록 2초로 묶는다.
pub async fn next_event(events: &mut TurnStream) -> Option<Result<StreamEvent, ApiError>> {
    tokio::time::timeout(Duration::from_secs(2), events.next())
        .await
        .expect("the next event comes")
}
