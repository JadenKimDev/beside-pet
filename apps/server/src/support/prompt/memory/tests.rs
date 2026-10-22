// 기억 블록: 머리 지시, 아이의 순서, 종류별 줄, 다른 아이의 줄, 50개 자르기(다른 아이 것부터), 빈 기억. 픽스처는 지어낸 아이와 사실이다.

use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{BLOCK_NAME, MAX_FACTS, memory_block};
use crate::support::{MemoryNote, MemoryView, NoteKind, Pet, PetStatus};

const HEADER: &str = "About this person (facts they shared; never quote verbatim; never bring up on your own: how the pet died, or anything about their guilt):";

fn at(minutes: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, 1, 0, 0, 0).unwrap() + Duration::minutes(minutes)
}

fn pet(id: &str, name: &str, status: PetStatus) -> Pet {
    Pet {
        id: id.to_owned(),
        name: name.to_owned(),
        status,
        loss_type: None,
        source_session_id: "s1".to_owned(),
        said_at: at(0),
    }
}

fn note(id: &str, kind: NoteKind, pet_id: Option<&str>, text: &str, minute: i64) -> MemoryNote {
    MemoryNote {
        id: id.to_owned(),
        session_id: "s1".to_owned(),
        seq: 1,
        kind,
        pet_id: pet_id.map(str::to_owned),
        text: text.to_owned(),
        said_at: at(minute),
    }
}

fn two_pets() -> MemoryView {
    MemoryView {
        pets: vec![
            pet("p-cheese", "Cheese", PetStatus::Living),
            pet("p-bori", "Bori", PetStatus::Deceased),
        ],
        notes: vec![
            note(
                "n1",
                NoteKind::Object,
                Some("p-bori"),
                "Bori slept on a blue blanket by the door",
                3,
            ),
            note(
                "n2",
                NoteKind::Object,
                Some("p-bori"),
                "Bori's red collar hangs on the shelf",
                2,
            ),
            note(
                "n3",
                NoteKind::Place,
                None,
                "They walked along the river",
                1,
            ),
            note(
                "n4",
                NoteKind::Ritual,
                Some("p-cheese"),
                "Cheese gets a treat at night",
                4,
            ),
        ],
    }
}

#[test]
fn no_facts_means_no_block() {
    assert_eq!(memory_block(&MemoryView::default(), Some("Bori")), None);
    let pets_only = MemoryView {
        pets: vec![pet("p-bori", "Bori", PetStatus::Deceased)],
        notes: vec![],
    };
    assert_eq!(memory_block(&pets_only, Some("Bori")), None);
}

#[test]
fn block_is_named_memory_and_starts_with_the_instruction() {
    let block = memory_block(&two_pets(), Some("Bori")).expect("a block");
    assert_eq!(block.name, BLOCK_NAME);
    assert_eq!(BLOCK_NAME, "memory");
    assert!(block.text.starts_with(HEADER), "{}", block.text);
}

#[test]
fn session_pet_comes_first_and_other_pets_follow_with_their_facts() {
    let text = memory_block(&two_pets(), Some("bori"))
        .expect("a block")
        .text;
    let bori = text.find("Bori (passed away)").expect("session pet line");
    let cheese = text.find("Cheese (living)").expect("other pet line");
    assert!(bori < cheese, "{text}");
    assert!(
        text.lines()
            .any(|line| line == "About Cheese (living): Cheese gets a treat at night"),
        "other pet's facts go on its own line: {text}"
    );
    assert!(
        !text.contains("- ritual:"),
        "other pet's facts stay off the kind lines: {text}"
    );
}

#[test]
fn session_pet_facts_come_before_other_pets_facts() {
    let text = memory_block(&two_pets(), Some("Bori"))
        .expect("a block")
        .text;
    let lines: Vec<&str> = text.lines().collect();
    let last_kind_line = lines
        .iter()
        .rposition(|line| line.starts_with("- "))
        .expect("kind lines");
    let about = text
        .lines()
        .position(|line| line.starts_with("About Cheese"))
        .expect("other pet line");
    assert!(last_kind_line < about, "{text}");
}

#[test]
fn other_pet_line_lists_facts_most_recent_first() {
    let mut view = two_pets();
    view.notes.push(note(
        "n5",
        NoteKind::Place,
        Some("p-cheese"),
        "Cheese threw up and went to the vet",
        9,
    ));
    let text = memory_block(&view, Some("Bori")).expect("a block").text;
    assert!(
        text.lines().any(|line| line
            == "About Cheese (living): Cheese threw up and went to the vet; Cheese gets a treat at night"),
        "{text}"
    );
}

#[test]
fn other_pet_without_facts_keeps_name_and_status_only() {
    let mut view = two_pets();
    view.notes
        .retain(|note| note.pet_id.as_deref() != Some("p-cheese"));
    let text = memory_block(&view, Some("Bori")).expect("a block").text;
    assert!(text.contains("Other pets: Cheese (living)"), "{text}");
    assert!(!text.contains("About Cheese"), "{text}");
}

#[test]
fn only_other_pets_facts_still_make_a_block() {
    let mut view = two_pets();
    view.notes
        .retain(|note| note.pet_id.as_deref() == Some("p-cheese"));
    let text = memory_block(&view, Some("Bori")).expect("a block").text;
    assert!(
        text.contains("About Cheese (living): Cheese gets a treat at night"),
        "{text}"
    );
}

#[test]
fn over_the_cap_other_pets_facts_are_dropped_first_oldest_first() {
    // 지금 세션의 아이 사실 45개(오래된 것), 다른 아이 사실 10개(더 최근). 상한 50 이면 다른 아이 것 5개만 남는다.
    let mut notes: Vec<MemoryNote> = (0..45)
        .map(|i| {
            note(
                &format!("b{i}"),
                NoteKind::Ritual,
                Some("p-bori"),
                &format!("bori fact {i:03}"),
                i,
            )
        })
        .collect();
    notes.extend((0..10).map(|i| {
        note(
            &format!("c{i}"),
            NoteKind::Ritual,
            Some("p-cheese"),
            &format!("cheese fact {i:03}"),
            100 + i,
        )
    }));
    let view = MemoryView {
        pets: two_pets().pets,
        notes,
    };
    let text = memory_block(&view, Some("Bori")).expect("a block").text;
    for i in 0..45 {
        assert!(text.contains(&format!("bori fact {i:03}")), "kept bori {i}");
    }
    for i in 0..5 {
        assert!(
            !text.contains(&format!("cheese fact {i:03}")),
            "oldest cheese {i} dropped: {text}"
        );
    }
    for i in 5..10 {
        assert!(
            text.contains(&format!("cheese fact {i:03}")),
            "kept cheese {i}"
        );
    }
}

#[test]
fn session_pet_facts_alone_over_the_cap_leave_no_room_for_other_pets() {
    let mut notes: Vec<MemoryNote> = (0..(MAX_FACTS as i64 + 3))
        .map(|i| {
            note(
                &format!("b{i}"),
                NoteKind::Ritual,
                Some("p-bori"),
                &format!("bori fact {i:03}"),
                i,
            )
        })
        .collect();
    notes.push(note(
        "c-new",
        NoteKind::Ritual,
        Some("p-cheese"),
        "cheese newest fact",
        1000,
    ));
    let view = MemoryView {
        pets: two_pets().pets,
        notes,
    };
    let text = memory_block(&view, Some("Bori")).expect("a block").text;
    assert!(!text.contains("cheese newest fact"), "{text}");
    assert!(text.contains("Other pets: Cheese (living)"), "{text}");
    for i in 0..3 {
        assert!(
            !text.contains(&format!("bori fact {i:03}")),
            "oldest bori {i} dropped"
        );
    }
}

#[test]
fn facts_are_one_line_per_kind_most_recent_first() {
    let text = memory_block(&two_pets(), Some("Bori"))
        .expect("a block")
        .text;
    let object_lines: Vec<&str> = text
        .lines()
        .filter(|line| line.starts_with("- object:"))
        .collect();
    assert_eq!(
        object_lines,
        [
            "- object: Bori slept on a blue blanket by the door; Bori's red collar hangs on the shelf"
        ]
    );
    assert!(
        text.contains("- place: They walked along the river"),
        "{text}"
    );
    let object = text.find("- object:").unwrap();
    let place = text.find("- place:").unwrap();
    assert!(object < place, "kinds follow NoteKind::ALL order: {text}");
}

#[test]
fn without_a_session_pet_every_pet_is_listed_and_facts_are_kept() {
    let text = memory_block(&two_pets(), None).expect("a block").text;
    assert!(text.contains("Bori (passed away)"), "{text}");
    assert!(text.contains("Cheese (living)"), "{text}");
    assert!(
        text.contains("- ritual: Cheese gets a treat at night"),
        "{text}"
    );
    assert!(text.contains("- object: Bori slept"), "{text}");
}

#[test]
fn unknown_session_pet_name_behaves_like_no_session_pet() {
    assert_eq!(
        memory_block(&two_pets(), Some("Nobody")),
        memory_block(&two_pets(), None)
    );
}

#[test]
fn keeps_only_the_most_recent_fifty_facts() {
    let notes = (0..(MAX_FACTS as i64 + 5))
        .map(|i| {
            note(
                &format!("n{i}"),
                NoteKind::Ritual,
                None,
                &format!("ritual number {i:03}"),
                i,
            )
        })
        .collect();
    let view = MemoryView {
        pets: vec![],
        notes,
    };
    let text = memory_block(&view, None).expect("a block").text;
    for i in 0..5 {
        assert!(
            !text.contains(&format!("ritual number {i:03}")),
            "oldest {i} dropped"
        );
    }
    for i in 5..(MAX_FACTS + 5) {
        assert!(text.contains(&format!("ritual number {i:03}")), "kept {i}");
    }
}

#[test]
fn block_does_not_carry_note_ids_or_session_ids() {
    let text = memory_block(&two_pets(), Some("Bori"))
        .expect("a block")
        .text;
    assert!(
        !text.contains("n1") && !text.contains("p-bori") && !text.contains("s1"),
        "{text}"
    );
}
