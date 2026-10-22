// 기억 하위 기능: 종류 변환, 온보딩 규칙 추출, 검증 게이트. 픽스처는 지어낸 아이와 발화다.

use chrono::{DateTime, TimeZone, Utc};

use super::{
    ExtractedFact, Extraction, GateInput, MemoryNote, MemoryView, NoteKind, Pet, PetLink,
    PetStatus, gate, parse_loss_type, pet_from_profile,
};
use crate::support::{GriefPath, GriefProfileRequest, LossType};

const SESSION: &str = "session-now";

fn at(day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, day, 9, 0, 0).unwrap()
}

fn profile(path: GriefPath, name: Option<&str>, loss: Option<LossType>) -> GriefProfileRequest {
    GriefProfileRequest {
        grief_path: path,
        pet_name: name.map(str::to_owned),
        together_range: None,
        loss_type: loss,
        situation: None,
        weeks_since_loss: None,
        daily_state: None,
        preferred_language: None,
    }
}

fn pet(id: &str, name: &str, status: PetStatus) -> Pet {
    Pet {
        id: id.to_owned(),
        name: name.to_owned(),
        status,
        loss_type: None,
        source_session_id: "session-old".to_owned(),
        said_at: at(1),
    }
}

fn note(
    id: &str,
    session: &str,
    seq: i32,
    kind: NoteKind,
    pet_id: Option<&str>,
    text: &str,
) -> MemoryNote {
    MemoryNote {
        id: id.to_owned(),
        session_id: session.to_owned(),
        seq,
        kind,
        pet_id: pet_id.map(str::to_owned),
        text: text.to_owned(),
        said_at: at(2),
    }
}

fn fact(kind: &str, pet_name: Option<&str>, text: &str, seq: i32) -> ExtractedFact {
    ExtractedFact {
        kind: kind.to_owned(),
        pet_name: pet_name.map(str::to_owned),
        text: text.to_owned(),
        seq,
        supersedes: Vec::new(),
    }
}

fn view() -> MemoryView {
    MemoryView {
        pets: vec![pet("pet-bori", "보리", PetStatus::Deceased)],
        notes: vec![],
    }
}

fn run(extraction: &Extraction, utterance: &str, view: &MemoryView) -> super::GateOutcome {
    gate(GateInput {
        extraction,
        session_id: SESSION,
        seq: 4,
        utterance,
        view,
    })
}

// --- 종류와 상태의 문자열 ---

#[test]
fn note_kind_round_trips_the_seven_db_strings() {
    let names: Vec<&str> = NoteKind::ALL.iter().map(|kind| kind.as_str()).collect();
    assert_eq!(
        names,
        [
            "pet",
            "person",
            "object",
            "place",
            "date",
            "ritual",
            "preference"
        ]
    );
    for kind in NoteKind::ALL {
        assert_eq!(NoteKind::parse(kind.as_str()), Some(kind));
    }
}

#[test]
fn note_kind_has_no_health_or_job() {
    for name in ["health", "job", "work", "medical", "Pet", ""] {
        assert_eq!(NoteKind::parse(name), None, "{name}");
    }
}

#[test]
fn pet_status_and_loss_type_round_trip() {
    for status in [PetStatus::Deceased, PetStatus::Living] {
        assert_eq!(PetStatus::parse(status.as_str()), Some(status));
    }
    assert_eq!(PetStatus::parse("gone"), None);
    assert_eq!(parse_loss_type("euthanasia"), Some(LossType::Euthanasia));
    assert_eq!(parse_loss_type("sudden"), Some(LossType::Sudden));
    assert_eq!(parse_loss_type("accident"), None);
}

// --- 온보딩 프로필의 규칙 추출 ---

#[test]
fn after_loss_profile_makes_a_deceased_pet() {
    let made = pet_from_profile(
        "owner-1",
        SESSION,
        &profile(GriefPath::AfterLoss, Some("보리"), Some(LossType::Illness)),
        at(3),
    )
    .expect("a pet");
    assert_eq!(made.owner_id, "owner-1");
    assert_eq!(made.name, "보리");
    assert_eq!(made.status, PetStatus::Deceased);
    assert_eq!(made.loss_type, Some(LossType::Illness));
    assert_eq!(made.source_session_id, SESSION);
    assert_eq!(made.said_at, at(3));
}

#[test]
fn before_loss_profile_makes_a_living_pet() {
    let made = pet_from_profile(
        "owner-1",
        SESSION,
        &profile(GriefPath::BeforeLoss, Some("Maple"), None),
        at(3),
    )
    .expect("a pet");
    assert_eq!(made.status, PetStatus::Living);
    assert_eq!(made.loss_type, None);
}

#[test]
fn profile_without_a_name_makes_no_pet() {
    for name in [None, Some(""), Some("   ")] {
        assert_eq!(
            pet_from_profile(
                "owner-1",
                SESSION,
                &profile(GriefPath::AfterLoss, name, None),
                at(3)
            ),
            None
        );
    }
}

#[test]
fn profile_name_is_trimmed() {
    let made = pet_from_profile(
        "owner-1",
        SESSION,
        &profile(GriefPath::AfterLoss, Some("  보리 "), None),
        at(3),
    )
    .expect("a pet");
    assert_eq!(made.name, "보리");
}

// --- 검증 게이트 ---

#[test]
fn keeps_a_valid_fact_and_links_the_known_pet() {
    let extraction = Extraction {
        facts: vec![fact(
            "object",
            Some("보리"),
            "보리는 현관의 파란 담요에서 잤다",
            4,
        )],
        do_not_remember: false,
    };
    let out = run(
        &extraction,
        "보리는 늘 현관에 둔 파란 담요에서 잤어요",
        &view(),
    );
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].kind, NoteKind::Object);
    assert_eq!(out.notes[0].pet, PetLink::Known("pet-bori".to_owned()));
    assert_eq!(out.notes[0].text, "보리는 현관의 파란 담요에서 잤다");
    assert!(out.notes[0].supersedes.is_empty());
    assert!(out.new_pets.is_empty());
    assert!(!out.opt_out);
    assert_eq!(out.dropped, 0);
}

#[test]
fn pet_name_matches_ignoring_case_and_spaces() {
    let mut v = view();
    v.pets.push(pet("pet-maple", "Maple", PetStatus::Living));
    let extraction = Extraction {
        facts: vec![fact("ritual", Some(" maple "), "Walks Maple at dawn", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "I still walk maple at dawn", &v);
    assert_eq!(out.notes[0].pet, PetLink::Known("pet-maple".to_owned()));
}

#[test]
fn drops_kinds_outside_the_seven() {
    let extraction = Extraction {
        facts: vec![
            fact("health", None, "잠을 못 잔다", 4),
            fact("job", None, "간호사로 일한다", 4),
            fact("place", None, "한강 산책로를 걸었다", 4),
        ],
        do_not_remember: false,
    };
    let out = run(
        &extraction,
        "간호사라 잠을 못 자요. 한강 산책로를 같이 걸었어요",
        &view(),
    );
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].kind, NoteKind::Place);
    assert_eq!(out.dropped, 2);
}

#[test]
fn drops_facts_from_another_utterance() {
    let extraction = Extraction {
        facts: vec![
            fact("place", None, "한강 산책로", 3),
            fact("place", None, "뒷산", 4),
        ],
        do_not_remember: false,
    };
    let out = run(&extraction, "뒷산에 자주 갔어요", &view());
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].text, "뒷산");
    assert_eq!(out.dropped, 1);
}

#[test]
fn drops_empty_text() {
    let extraction = Extraction {
        facts: vec![fact("object", None, "  ", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "그냥요", &view());
    assert!(out.notes.is_empty());
    assert_eq!(out.dropped, 1);
}

#[test]
fn drops_numbers_and_dates_not_in_the_utterance() {
    let extraction = Extraction {
        facts: vec![
            fact("date", Some("보리"), "보리는 2025년 3월 14일에 떠났다", 4),
            fact("date", Some("보리"), "보리는 15살이었다", 4),
            fact("date", Some("보리"), "보리는 3월 14일에 떠났다", 4),
        ],
        do_not_remember: false,
    };
    let out = run(&extraction, "보리는 3월 14일에 떠났어요", &view());
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].text, "보리는 3월 14일에 떠났다");
    assert_eq!(out.dropped, 2);
}

#[test]
fn number_check_ignores_leading_zeros() {
    let extraction = Extraction {
        facts: vec![fact("date", None, "Anniversary on 03/07", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "It was 3/7, I remember", &view());
    assert_eq!(out.notes.len(), 1);
}

#[test]
fn unknown_pet_name_keeps_the_fact_without_a_pet_and_makes_no_pet() {
    let extraction = Extraction {
        facts: vec![fact("pet", Some("치즈"), "우리 집 다른 아이 치즈", 4)],
        do_not_remember: false,
    };
    let out = run(
        &extraction,
        "우리 집 다른 아이 치즈도 요즘 기운이 없어요",
        &view(),
    );
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].pet, PetLink::None);
    assert!(out.new_pets.is_empty());
}

#[test]
fn second_pet_fact_with_the_same_name_in_the_session_asks_for_a_pet() {
    let mut v = view();
    v.notes.push(note(
        "n1",
        SESSION,
        2,
        NoteKind::Pet,
        None,
        "우리 집 다른 아이 치즈",
    ));
    let extraction = Extraction {
        facts: vec![fact("pet", Some("치즈"), "치즈는 노란 고양이다", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "치즈는 노란 고양이예요", &v);
    assert_eq!(out.new_pets, vec!["치즈".to_owned()]);
    assert_eq!(out.notes[0].pet, PetLink::New("치즈".to_owned()));
}

#[test]
fn earlier_mention_in_another_session_does_not_count() {
    let mut v = view();
    v.notes.push(note(
        "n1",
        "session-old",
        2,
        NoteKind::Pet,
        None,
        "우리 집 다른 아이 치즈",
    ));
    let extraction = Extraction {
        facts: vec![fact("pet", Some("치즈"), "치즈는 노란 고양이다", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "치즈는 노란 고양이예요", &v);
    assert!(out.new_pets.is_empty());
    assert_eq!(out.notes[0].pet, PetLink::None);
}

#[test]
fn two_pet_facts_with_the_same_name_in_one_utterance_ask_for_one_pet() {
    let extraction = Extraction {
        facts: vec![
            fact("pet", Some("치즈"), "우리 집 다른 아이 치즈", 4),
            fact("pet", Some("치즈"), "치즈는 노란 고양이다", 4),
            fact("object", Some("치즈"), "치즈의 장난감 쥐", 4),
        ],
        do_not_remember: false,
    };
    let out = run(
        &extraction,
        "우리 집 다른 아이 치즈, 노란 고양이예요. 장난감 쥐를 좋아해요",
        &view(),
    );
    assert_eq!(out.new_pets, vec!["치즈".to_owned()]);
    assert_eq!(out.notes[0].pet, PetLink::None);
    assert_eq!(out.notes[1].pet, PetLink::New("치즈".to_owned()));
    assert_eq!(out.notes[2].pet, PetLink::New("치즈".to_owned()));
}

#[test]
fn non_pet_facts_never_ask_for_a_pet() {
    let mut v = view();
    v.notes.push(note(
        "n1",
        SESSION,
        2,
        NoteKind::Object,
        None,
        "치즈의 장난감",
    ));
    let extraction = Extraction {
        facts: vec![fact("object", Some("치즈"), "치즈의 방석", 4)],
        do_not_remember: false,
    };
    let out = run(&extraction, "치즈의 방석도 있어요", &v);
    assert!(out.new_pets.is_empty());
}

#[test]
fn do_not_remember_drops_every_fact_and_opts_out() {
    let extraction = Extraction {
        facts: vec![
            fact("pet", Some("치즈"), "우리 집 다른 아이 치즈", 4),
            fact("person", None, "남편이 화를 냈다", 4),
        ],
        do_not_remember: true,
    };
    let mut v = view();
    v.notes.push(note(
        "n1",
        SESSION,
        2,
        NoteKind::Pet,
        None,
        "우리 집 다른 아이 치즈",
    ));
    let out = run(
        &extraction,
        "치즈 얘기랑 남편이 화낸 건 기억하지 마세요",
        &v,
    );
    assert!(out.opt_out);
    assert!(out.notes.is_empty());
    assert!(out.new_pets.is_empty());
    assert_eq!(out.dropped, 2);
}

/// 정정의 대상은 추출 입력에 붙인 번호(`[1]`, `[2]`…, 뷰의 순서)로 온다. 세션마다 1부터 매기는 seq 는 보지 않는다.
fn blanket_view() -> MemoryView {
    let mut v = view();
    v.notes.push(note(
        "walk-bag",
        "session-a",
        2,
        NoteKind::Object,
        None,
        "산책 가방은 현관에 그대로 걸어 두고 치우지 않기로 했다",
    ));
    v.notes.push(note(
        "same-seq-other-session",
        "session-b",
        2,
        NoteKind::Object,
        None,
        "담요를 소파에 둔다",
    ));
    v.notes.push(note(
        "later-seq",
        "session-c",
        7,
        NoteKind::Place,
        None,
        "산책은 늘 개천가로 갔다",
    ));
    v
}

fn correcting(numbers: Vec<i32>) -> Extraction {
    let mut correction = fact("object", None, "산책 가방을 결국 치웠다", 4);
    correction.supersedes = numbers;
    Extraction {
        facts: vec![correction],
        do_not_remember: false,
    }
}

#[test]
fn supersedes_resolves_the_bracketed_number_across_sessions() {
    let v = blanket_view();
    let out = run(&correcting(vec![1]), "산책 가방은 결국 치웠어요", &v);
    assert_eq!(out.notes[0].supersedes, vec!["walk-bag".to_owned()]);
}

#[test]
fn supersedes_ignores_seq_session_and_kind_of_the_old_fact() {
    let v = blanket_view();
    // 셋째 사실은 다른 세션의 seq 7(이번 발화의 seq 4 보다 크다)이고 종류도 다르다.
    let out = run(&correcting(vec![3, 2]), "산책 가방은 결국 치웠어요", &v);
    assert_eq!(
        out.notes[0].supersedes,
        vec!["later-seq".to_owned(), "same-seq-other-session".to_owned()]
    );
}

#[test]
fn supersedes_drops_numbers_outside_the_list_and_repeats() {
    let v = blanket_view();
    let out = run(
        &correcting(vec![0, -1, 4, 99, 1, 1]),
        "산책 가방은 결국 치웠어요",
        &v,
    );
    assert_eq!(out.notes.len(), 1);
    assert_eq!(out.notes[0].supersedes, vec!["walk-bag".to_owned()]);
}

#[test]
fn supersedes_nothing_when_the_list_is_empty() {
    let out = run(&correcting(vec![1]), "산책 가방은 결국 치웠어요", &view());
    assert_eq!(out.notes.len(), 1);
    assert!(out.notes[0].supersedes.is_empty());
}
