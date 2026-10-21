// 답의 판정(ADR-0031): 끝난 턴의 답을 판정해 분석에 적고, 동기 턴은 후보에서 고르고, 다음 턴은 직전 판정으로 한 줄을 더한다.
// 판정기는 대본 더블이다. 글은 모두 지어낸 것이다.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::future::BoxFuture;
use tokio::sync::Semaphore;

use super::super::judge::{JudgeError, JudgeInput, Judgement, ReplyJudge, ReplyLabel};
use super::super::judging::Judging;
use super::doubles::{
    ENGAGED, Harness, KEYWORD_CRISIS, REPLY_CHUNKS, SESSION_ID, ScriptedModel, collect, message,
    message_with, next_event, owner, reply_text,
};
use crate::support::{MessageRole, StreamEvent, SupportService};

/// 다음 턴 지시 줄의 낱말(문구 전체는 `turn_style` 의 테스트가 본다).
const AFTER_GENERIC: &str = "pick up one concrete thing they said";

const PLAIN: &str = "Grief can feel heavy and that is okay.";
const SPECIFIC: &str = "Those river mornings sound like they were yours alone.";
const MIXED: &str = "It sounds like the mornings mattered.";

type Verdict = Result<Option<Judgement>, JudgeError>;

/// 답의 글마다 정해 둔 판정을 내고 받은 입력을 적는다. 문을 걸면 첫 판정이 허가를 기다린다.
struct ScriptedJudge {
    verdicts: HashMap<String, Verdict>,
    fallback: Verdict,
    inputs: Mutex<Vec<JudgeInput>>,
    first_gate: Option<Arc<Semaphore>>,
}

impl ScriptedJudge {
    fn always(verdict: Verdict) -> ScriptedJudge {
        ScriptedJudge {
            verdicts: HashMap::new(),
            fallback: verdict,
            inputs: Mutex::new(Vec::new()),
            first_gate: None,
        }
    }

    fn by_reply(verdicts: &[(&str, Verdict)]) -> ScriptedJudge {
        ScriptedJudge {
            verdicts: verdicts
                .iter()
                .map(|(reply, verdict)| ((*reply).to_owned(), verdict.clone()))
                .collect(),
            ..ScriptedJudge::always(Ok(None))
        }
    }

    fn inputs(&self) -> Vec<JudgeInput> {
        self.inputs.lock().unwrap().clone()
    }

    fn calls(&self) -> usize {
        self.inputs().len()
    }
}

impl ReplyJudge for ScriptedJudge {
    fn judge(&self, input: JudgeInput) -> BoxFuture<'_, Verdict> {
        let first = {
            let mut inputs = self.inputs.lock().unwrap();
            inputs.push(input.clone());
            inputs.len() == 1
        };
        let verdict = self
            .verdicts
            .get(&input.reply)
            .cloned()
            .unwrap_or_else(|| self.fallback.clone());
        let gate = self.first_gate.clone().filter(|_| first);
        Box::pin(async move {
            if let Some(gate) = gate {
                gate.acquire().await.expect("the gate stays open").forget();
            }
            verdict
        })
    }
}

/// 확률을 주는 판정기(systemone 모양): 일반 위로의 확률이 `generic` 이다.
fn sensed(label: ReplyLabel, generic: f32) -> Verdict {
    let mut probabilities = BTreeMap::new();
    probabilities.insert(ReplyLabel::GenericComfort, generic);
    if label != ReplyLabel::GenericComfort {
        probabilities.insert(label, 1.0 - generic);
    }
    Ok(Some(Judgement {
        label,
        probabilities: Some(probabilities),
        judge: "systemone",
        version: "0.1.0",
    }))
}

/// 확률이 없는 판정기(haiku 모양).
fn labelled(label: ReplyLabel) -> Verdict {
    Ok(Some(Judgement {
        label,
        probabilities: None,
        judge: "haiku",
        version: "0.1.0",
    }))
}

fn judged(model: ScriptedModel, judge: &Arc<ScriptedJudge>, candidates: u8) -> Harness {
    Harness::judged(
        model,
        Judging {
            judge: judge.clone(),
            candidates,
            threshold: 0.5,
        },
    )
}

async fn stream_turn(h: &Harness, text: &str) -> Vec<Result<StreamEvent, crate::shared::ApiError>> {
    collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(text)),
    )
    .await
}

async fn analysis_json(h: &Harness) -> serde_json::Value {
    let analysis = h
        .flow
        .analysis(&owner(), SESSION_ID)
        .await
        .expect("the analysis reads");
    serde_json::to_value(analysis).unwrap()
}

#[tokio::test]
async fn 판정기를_끄면_분석에_판정_칸이_없다() {
    let h = Harness::new();
    h.onboard().await;
    let events = stream_turn(&h, ENGAGED).await;
    assert!(matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))));
    h.say(ENGAGED).await;

    let saved = h.sessions.last_save();
    assert!(
        saved
            .analyses
            .iter()
            .all(|analysis| analysis.reply.is_none())
    );
    let value = analysis_json(&h).await;
    for analysis in value["analyses"].as_array().unwrap() {
        let item = analysis.as_object().unwrap();
        for key in ["replyLabel", "replyLabelProbability", "replyJudge"] {
            assert!(!item.contains_key(key), "{key} is left out: {analysis}");
        }
    }
}

#[tokio::test]
async fn 스트림_턴은_끝난_뒤_판정해_분석에_적는다() {
    let judge = Arc::new(ScriptedJudge::always(sensed(
        ReplyLabel::GenericComfort,
        0.75,
    )));
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;
    assert_eq!(judge.calls(), 0, "the greeting is not judged");

    let events = stream_turn(&h, ENGAGED).await;

    assert!(matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))));
    let inputs = judge.inputs();
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0].reply, reply_text());
    assert_eq!(inputs[0].recent_user, vec![ENGAGED.to_owned()]);
    assert_eq!(inputs[0].language, "en");
    let saved = h.sessions.last_save();
    let reply = saved.analyses[0]
        .reply
        .as_ref()
        .expect("the judgement is saved");
    assert_eq!(reply.label, ReplyLabel::GenericComfort);
    assert_eq!(reply.label_probability, Some(0.75));
    assert_eq!(reply.judge, "systemone@0.1.0");
    let value = analysis_json(&h).await;
    assert_eq!(value["analyses"][0]["replyLabel"], "generic_comfort");
    assert_eq!(value["analyses"][0]["replyLabelProbability"], 0.75);
    assert_eq!(value["analyses"][0]["replyJudge"], "systemone@0.1.0");
}

#[tokio::test]
async fn 판정기의_입력은_최근_사용자_말_둘이다() {
    let judge = Arc::new(ScriptedJudge::always(labelled(ReplyLabel::Question)));
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;
    for text in [
        "The first made-up line here.",
        "The second made-up line.",
        ENGAGED,
    ] {
        h.say(text).await;
    }
    let last = judge.inputs().pop().unwrap();
    assert_eq!(
        last.recent_user,
        vec!["The second made-up line.".to_owned(), ENGAGED.to_owned()]
    );
}

#[tokio::test]
async fn 판정이_실패하면_칸은_비고_대화는_이어진다() {
    let judge = Arc::new(ScriptedJudge::always(Err(JudgeError::Timeout)));
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;

    let events = stream_turn(&h, ENGAGED).await;
    assert!(matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))));
    let turn = h.say(ENGAGED).await;

    assert_eq!(turn.reply, reply_text());
    assert_eq!(judge.calls(), 2);
    let saved = h.sessions.last_save();
    assert_eq!(saved.analyses.len(), 2);
    assert!(
        saved
            .analyses
            .iter()
            .all(|analysis| analysis.reply.is_none())
    );
}

#[tokio::test]
async fn 동기_턴은_후보_셋에서_일반_위로가_가장_낮은_답을_고른다() {
    let judge = Arc::new(ScriptedJudge::by_reply(&[
        (PLAIN, sensed(ReplyLabel::GenericComfort, 0.8)),
        (SPECIFIC, sensed(ReplyLabel::SpecificReflection, 0.2)),
        (MIXED, sensed(ReplyLabel::SpecificReflection, 0.4)),
    ]));
    let h = judged(ScriptedModel::new(), &judge, 3);
    h.onboard().await;
    let replies_before = h.model.reply_calls();
    let saves_before = h.sessions.saves().len();
    h.model.answer_in_turn(&[PLAIN, SPECIFIC, MIXED]);

    let turn = h.say(ENGAGED).await;

    assert_eq!(turn.reply, SPECIFIC);
    assert_eq!(
        h.model.reply_calls() - replies_before,
        3,
        "three candidates"
    );
    assert_eq!(judge.calls(), 3, "each candidate is judged once");
    assert_eq!(
        h.sessions.saves().len() - saves_before,
        3,
        "the same saves as one candidate: on receipt, when the reply starts, on completion"
    );
    let saved = h.sessions.last_save();
    let assistant: Vec<&str> = saved
        .history
        .iter()
        .filter(|message| message.role == MessageRole::Assistant)
        .map(|message| message.text.as_str())
        .collect();
    assert_eq!(assistant.last(), Some(&SPECIFIC));
    assert!(!assistant.contains(&PLAIN) && !assistant.contains(&MIXED));
    let reply = saved.analyses[0]
        .reply
        .as_ref()
        .expect("the judgement is saved");
    assert_eq!(reply.label, ReplyLabel::SpecificReflection);
    assert_eq!(
        reply.label_probability,
        Some(0.8),
        "the chosen label's own probability"
    );
}

#[tokio::test]
async fn 확률이_없으면_일반_위로가_아닌_첫_후보를_고른다() {
    let judge = Arc::new(ScriptedJudge::by_reply(&[
        (PLAIN, labelled(ReplyLabel::GenericComfort)),
        (SPECIFIC, labelled(ReplyLabel::SpecificReflection)),
        (MIXED, labelled(ReplyLabel::Question)),
    ]));
    let h = judged(ScriptedModel::new(), &judge, 3);
    h.onboard().await;
    h.model.answer_in_turn(&[PLAIN, SPECIFIC, MIXED]);

    assert_eq!(h.say(ENGAGED).await.reply, SPECIFIC);
}

#[tokio::test]
async fn 모두_일반_위로면_첫_후보를_고른다() {
    let judge = Arc::new(ScriptedJudge::always(labelled(ReplyLabel::GenericComfort)));
    let h = judged(ScriptedModel::new(), &judge, 2);
    h.onboard().await;
    h.model.answer_in_turn(&[MIXED, PLAIN]);

    assert_eq!(h.say(ENGAGED).await.reply, MIXED);
}

#[tokio::test]
async fn 판정이_모두_실패하면_첫_후보를_고르고_칸은_빈다() {
    let judge = Arc::new(ScriptedJudge::always(Err(JudgeError::Unavailable)));
    let h = judged(ScriptedModel::new(), &judge, 2);
    h.onboard().await;
    h.model.answer_in_turn(&[MIXED, PLAIN]);

    assert_eq!(h.say(ENGAGED).await.reply, MIXED);
    assert!(h.sessions.last_save().analyses[0].reply.is_none());
}

#[tokio::test]
async fn 직전_답이_일반_위로면_다음_턴에_구체_하나를_받는_줄이_붙는다() {
    let judge = Arc::new(ScriptedJudge::always(sensed(
        ReplyLabel::GenericComfort,
        0.8,
    )));
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;
    h.say(ENGAGED).await;
    let first = h.model.last_reply_request();
    assert!(
        !first.system.as_deref().unwrap().contains(AFTER_GENERIC),
        "the first turn has no judged reply before it"
    );

    stream_turn(&h, ENGAGED).await;

    let next = h.model.last_reply_request();
    assert!(next.system.as_deref().unwrap().contains(AFTER_GENERIC));
}

#[tokio::test]
async fn 직전_답의_일반_위로_확률이_임계값_밑이면_줄이_없다() {
    let judge = Arc::new(ScriptedJudge::always(sensed(
        ReplyLabel::GenericComfort,
        0.3,
    )));
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;
    h.say(ENGAGED).await;
    h.say(ENGAGED).await;

    let next = h.model.last_reply_request();
    assert!(!next.system.as_deref().unwrap().contains(AFTER_GENERIC));
}

#[tokio::test]
async fn 위기_턴과_첫_인사는_판정하지_않는다() {
    let judge = Arc::new(ScriptedJudge::always(labelled(ReplyLabel::Question)));
    let h = judged(ScriptedModel::new(), &judge, 3);
    h.onboard().await;

    let turn = h.say(KEYWORD_CRISIS).await;

    assert!(turn.done, "the crisis turn closes the session");
    assert_eq!(judge.calls(), 0);
    assert_eq!(
        h.model.reply_calls(),
        1,
        "only the greeting asked the model"
    );
    assert!(
        h.sessions
            .last_save()
            .analyses
            .iter()
            .all(|analysis| analysis.reply.is_none())
    );
}

#[tokio::test]
async fn 스트림_판정_사이에_다음_턴이_오면_판정을_적지_않고_다음_턴을_지키지_않는다() {
    let gate = Arc::new(Semaphore::new(0));
    let judge = Arc::new(ScriptedJudge {
        first_gate: Some(gate.clone()),
        ..ScriptedJudge::always(labelled(ReplyLabel::GenericComfort))
    });
    let h = judged(ScriptedModel::new(), &judge, 1);
    h.onboard().await;

    let mut events = h
        .flow
        .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED));
    // `done` 이 먼저 나가고 판정은 그 뒤에 기다린다.
    let done = tokio::time::timeout(Duration::from_secs(2), async {
        use futures_util::StreamExt;
        loop {
            match events.next().await {
                Some(Ok(StreamEvent::Done { .. })) => break true,
                Some(_) => continue,
                None => break false,
            }
        }
    })
    .await
    .expect("done comes before the judgement");
    assert!(done);
    tokio::time::timeout(Duration::from_secs(2), async {
        while judge.calls() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("the judge is asked after done");

    // 판정이 기다리는 사이에 다음 턴이 끝난다.
    h.say("Another made-up line for the next turn.").await;
    gate.add_permits(1);
    let rest = collect(events).await;
    assert!(rest.is_empty(), "nothing follows done: {rest:?}");

    let saved = h.sessions.get(SESSION_ID).unwrap();
    let users: Vec<&str> = saved
        .history
        .iter()
        .filter(|message| message.role == MessageRole::User)
        .map(|message| message.text.as_str())
        .collect();
    assert_eq!(
        users,
        vec![ENGAGED, "Another made-up line for the next turn."],
        "the late judgement does not save over the next turn"
    );
    assert!(
        saved.analyses[0].reply.is_none(),
        "the late judgement is dropped"
    );
    assert!(saved.analyses[1].reply.is_some(), "the next turn is judged");
}

#[tokio::test]
async fn 중단된_턴은_판정하지_않는다() {
    const TURN_ID: &str = "7b2e4c91-0d3f-4a6e-8c15-2f9a7d3b6e40";
    let judge = Arc::new(ScriptedJudge::always(labelled(ReplyLabel::Question)));
    let h = judged(ScriptedModel::paced(), &judge, 1);
    h.onboard().await;
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    assert!(matches!(
        next_event(&mut events).await,
        Some(Ok(StreamEvent::Meta { .. }))
    ));
    assert_eq!(
        next_event(&mut events).await,
        Some(Ok(StreamEvent::Token {
            text: REPLY_CHUNKS[0].to_owned()
        }))
    );

    h.flow
        .cancel_turn(&owner(), SESSION_ID, TURN_ID)
        .await
        .expect("the turn cancels");

    assert_eq!(collect(events).await, vec![Ok(StreamEvent::Cancelled)]);
    assert_eq!(judge.calls(), 0);
}
