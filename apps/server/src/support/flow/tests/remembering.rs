// 기억(ADR-0034): 온보딩 프로필의 아이 한 행, 답이 끝난 턴 뒤의 추출과 게이트 적용(사실, 새 아이, 정정, 옵트아웃).
// 위기 턴, 실패한 턴, 중단한 턴은 뽑지 않고, 추출이 실패해도 턴의 답은 그대로다. 이름과 글은 모두 지어낸 것이다.

use std::time::Duration;

use super::doubles::{
    ExtractCall, Harness, KEYWORD_CRISIS, OWNER_ID, REPLY_CHUNKS, SESSION_ID, ScriptedModel,
    collect, message, message_with, next_event, onboarding, owner, reply_text,
};
use crate::llm::MEMORY_EXTRACT_PROMPT_VERSION;
use crate::support::{
    ExtractError, ExtractedFact, Extraction, MemoryOptout, MemoryView, NoteKind, PetStatus,
    StreamEvent, SupportService,
};

const BLANKET: &str = "They keep the blue blanket on the sofa.";
const SECOND: &str = "In the end we put the blanket away.";
const TURN_ID: &str = "5d1f8e2a-3c7b-4a96-b0e4-7f2c9a1d6e38";

/// 첫 사용자 발화의 seq(온보딩 인사가 0 이다).
const FIRST_SEQ: i32 = 1;

fn fact(kind: &str, pet_name: Option<&str>, text: &str, seq: i32) -> ExtractedFact {
    ExtractedFact {
        kind: kind.to_owned(),
        pet_name: pet_name.map(str::to_owned),
        text: text.to_owned(),
        seq,
        supersedes_seq: None,
    }
}

fn facts(facts: Vec<ExtractedFact>) -> Result<Extraction, ExtractError> {
    Ok(Extraction {
        facts,
        do_not_remember: false,
    })
}

async fn say_streamed(
    h: &Harness,
    text: &str,
) -> Vec<Result<StreamEvent, crate::shared::ApiError>> {
    collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(text)),
    )
    .await
}

/// 동기 턴의 추출은 따로 돌므로 `n` 번째 추출의 저장이 끝날 때까지 기다린다(2초).
async fn settled(h: &Harness, n: usize) {
    for _ in 0..200 {
        if h.extractor.calls().len() >= n && h.memory.inserted().len() >= n {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("the extraction did not settle: {:?}", h.extractor.calls());
}

fn view(h: &Harness) -> MemoryView {
    h.memory.view_of(OWNER_ID)
}

#[tokio::test]
async fn 온보딩하면_프로필의_아이가_한_행으로_생기고_같은_이름으로_또_시작해도_그대로다() {
    let h = Harness::new();

    h.onboard().await;
    h.flow
        .start(&owner(), onboarding("s-2"))
        .await
        .expect("the second session starts");

    let pets = view(&h).pets;
    assert_eq!(pets.len(), 1, "{pets:?}");
    assert_eq!(pets[0].name, "Biscuit");
    assert_eq!(pets[0].status, PetStatus::Deceased);
    assert_eq!(pets[0].source_session_id, SESSION_ID);
}

#[tokio::test]
async fn 스트림_턴이_끝나면_그_발화와_seq_와_언어로_뽑아_사실을_넣는다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));

    let events = say_streamed(&h, BLANKET).await;

    assert!(
        matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))),
        "{events:?}"
    );
    assert_eq!(
        h.extractor.calls(),
        vec![ExtractCall {
            utterance: BLANKET.to_owned(),
            seq: FIRST_SEQ,
            language: "en".to_owned(),
            session_id: SESSION_ID.to_owned(),
            notes: 0,
        }]
    );
    let inserted = h.memory.inserted();
    assert_eq!(inserted.len(), 1, "{inserted:?}");
    let (note, supersedes) = &inserted[0];
    assert_eq!(note.owner_id, OWNER_ID);
    assert_eq!(note.session_id, SESSION_ID);
    assert_eq!(note.seq, FIRST_SEQ);
    assert_eq!(note.kind, NoteKind::Object);
    assert_eq!(note.pet_id, None);
    assert_eq!(note.text, BLANKET);
    assert_eq!(
        note.extracted_by,
        format!("model:{MEMORY_EXTRACT_PROMPT_VERSION}")
    );
    let said = h.sessions.last_save().history[FIRST_SEQ as usize].at;
    assert_eq!(note.said_at, said, "the fact is dated when it was said");
    assert!(supersedes.is_empty());
}

#[tokio::test]
async fn 동기_턴도_답한_뒤에_뽑고_답은_그대로다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));

    let turn = h.say(BLANKET).await;

    assert_eq!(turn.reply, reply_text());
    settled(&h, 1).await;
    assert_eq!(h.memory.inserted()[0].0.text, BLANKET);
}

#[tokio::test]
async fn 아는_아이의_사실은_그_아이에_잇고_두_번_말한_새_아이는_곁에_있는_아이로_만든다() {
    let h = Harness::new();
    h.onboard().await;
    let biscuit = view(&h).pets[0].id.clone();
    h.extractor.answer(facts(vec![
        fact("object", Some("Biscuit"), BLANKET, FIRST_SEQ),
        fact(
            "pet",
            Some("Cheese"),
            "Cheese is the other cat at home.",
            FIRST_SEQ,
        ),
        fact(
            "pet",
            Some("Cheese"),
            "Cheese sleeps by the door.",
            FIRST_SEQ,
        ),
    ]));

    say_streamed(
        &h,
        "Cheese is the other cat at home and Cheese sleeps by the door.",
    )
    .await;

    let pets = view(&h).pets;
    let cheese = pets
        .iter()
        .find(|pet| pet.name == "Cheese")
        .unwrap_or_else(|| panic!("Cheese is made: {pets:?}"));
    assert_eq!(cheese.status, PetStatus::Living);
    assert_eq!(cheese.loss_type, None);
    assert_eq!(cheese.source_session_id, SESSION_ID);
    let links: Vec<Option<String>> = h
        .memory
        .inserted()
        .iter()
        .map(|(note, _)| note.pet_id.clone())
        .collect();
    assert_eq!(links, vec![Some(biscuit), None, Some(cheese.id.clone())]);
}

#[tokio::test]
async fn 정정은_옛_사실을_무효화하라고_넘긴다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));
    say_streamed(&h, BLANKET).await;
    let old = view(&h).notes[0].id.clone();
    // 둘째 사용자 발화: 첫 답(2) 뒤의 3.
    let mut correction = fact("object", None, SECOND, 3);
    correction.supersedes_seq = Some(FIRST_SEQ);
    h.extractor.answer(facts(vec![correction]));

    say_streamed(&h, SECOND).await;

    let inserted = h.memory.inserted();
    assert_eq!(inserted.len(), 2, "{inserted:?}");
    assert_eq!(inserted[1].0.seq, 3);
    assert_eq!(inserted[1].1, vec![old]);
    assert_eq!(
        h.extractor.calls()[1].notes,
        1,
        "the extractor sees the current facts"
    );
}

#[tokio::test]
async fn 기억하지_말라고_하면_사실_없이_옵트아웃_한_행이다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor.answer(Ok(Extraction {
        facts: vec![fact("object", None, BLANKET, FIRST_SEQ)],
        do_not_remember: true,
    }));

    say_streamed(&h, BLANKET).await;

    assert!(h.memory.inserted().is_empty());
    let said = h.sessions.last_save().history[FIRST_SEQ as usize].at;
    assert_eq!(
        h.memory.optouts(),
        vec![MemoryOptout {
            owner_id: OWNER_ID.to_owned(),
            session_id: SESSION_ID.to_owned(),
            seq: FIRST_SEQ,
            at: said,
        }]
    );
}

#[tokio::test]
async fn 위기_턴은_뽑지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));

    let events = say_streamed(&h, KEYWORD_CRISIS).await;

    assert!(
        matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))),
        "{events:?}"
    );
    assert!(h.extractor.calls().is_empty());
    assert!(h.memory.inserted().is_empty());
}

#[tokio::test]
async fn 실패한_턴은_뽑지_않는다() {
    let h = Harness::with_model(ScriptedModel::failing_stream());
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));

    let events = say_streamed(&h, BLANKET).await;

    assert!(matches!(events.last(), Some(Err(_))), "{events:?}");
    assert!(h.extractor.calls().is_empty());
}

#[tokio::test]
async fn 중단한_턴은_뽑지_않는다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    h.extractor
        .answer(facts(vec![fact("object", None, BLANKET, FIRST_SEQ)]));
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(BLANKET, TURN_ID),
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
        .expect("the turn is cancelled");

    assert_eq!(collect(events).await, vec![Ok(StreamEvent::Cancelled)]);
    assert!(h.extractor.calls().is_empty());
}

#[tokio::test]
async fn 추출이_실패해도_답은_그대로이고_아무것도_넣지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor.answer(Err(ExtractError::Unavailable));

    let events = say_streamed(&h, BLANKET).await;

    let Some(Ok(StreamEvent::Done { result })) = events.last() else {
        panic!("the turn is done: {events:?}");
    };
    assert_eq!(result.reply, reply_text());
    assert_eq!(h.extractor.calls().len(), 1);
    assert!(h.memory.inserted().is_empty());
    assert!(h.memory.optouts().is_empty());
}

#[tokio::test]
async fn 게이트가_버린_사실은_넣지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.extractor.answer(facts(vec![
        fact("health", None, BLANKET, FIRST_SEQ),
        fact("object", None, BLANKET, 7),
        fact("date", None, "It happened on 2025-03-14.", FIRST_SEQ),
    ]));

    say_streamed(&h, BLANKET).await;

    assert_eq!(h.extractor.calls().len(), 1);
    assert!(h.memory.inserted().is_empty());
}
