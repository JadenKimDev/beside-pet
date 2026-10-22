//! 검증 게이트(순수): 모델 추출에서 저장해도 되는 사실만 남기고, 무엇을 넣고 무효화하고 만들지를 정한다.
//!
//! 버리는 것: 일곱 밖의 종류, 이번 발화가 아닌 seq, 빈 글, 발화 본문에 없는 숫자(모델이 추론한 날짜·나이).
//! 정정은 추출 입력에 붙인 번호(뷰의 순서, 1부터)를 같은 뷰에서 푼다. 목록 밖의 번호는 버린다.
//! 모르는 아이 이름은 아이를 만들지 않고 `pet_id` 없이 둔다. 다만 같은 세션에서 같은 이름의 `pet` 사실이 두 번째로
//! 나오면 그 이름의 아이를 만들라고 내놓는다. `do_not_remember` 면 사실을 모두 버리고 옵트아웃만 남긴다.

use std::collections::BTreeSet;

use super::{ExtractedFact, Extraction, MemoryView, NoteKind};

/// 게이트가 보는 것: 추출, 출처 발화(seq 와 본문), 세션, 소유자의 현재 기억.
#[derive(Debug, Clone, Copy)]
pub struct GateInput<'a> {
    pub extraction: &'a Extraction,
    pub session_id: &'a str,
    pub seq: i32,
    pub utterance: &'a str,
    pub view: &'a MemoryView,
}

/// 사실이 어느 아이 이야기인가.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PetLink {
    /// 아이를 말하지 않았거나 모르는 이름이다.
    None,
    /// 저장된 아이(`pets.id`).
    Known(String),
    /// 이번에 만들 아이(`GateOutcome::new_pets` 의 이름). 만든 뒤 그 id 를 넣는다.
    New(String),
}

/// 넣을 사실 하나. `supersedes` 는 이 사실이 무효화할 옛 사실의 id 다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatedNote {
    pub kind: NoteKind,
    pub pet: PetLink,
    pub text: String,
    pub supersedes: Vec<String>,
}

/// 게이트의 결과. 옵트아웃이면 `notes` 와 `new_pets` 는 비어 있다.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GateOutcome {
    pub notes: Vec<GatedNote>,
    /// 만들 아이의 이름(곁에 있는 아이로 만든다). 이름은 처음 나온 모양 그대로다.
    pub new_pets: Vec<String>,
    pub opt_out: bool,
    /// 버린 사실의 수. 로그에 건수만 남길 때 쓴다.
    pub dropped: usize,
}

pub fn gate(input: GateInput<'_>) -> GateOutcome {
    let facts = &input.extraction.facts;
    if input.extraction.do_not_remember {
        return GateOutcome {
            opt_out: true,
            dropped: facts.len(),
            ..GateOutcome::default()
        };
    }
    let spoken = numbers(input.utterance);
    // 이 세션에서 이미 나온 `pet` 사실의 이름들(아이 없이 저장된 것). 같은 이름이 또 나오면 아이를 만든다.
    let mut mentioned: Vec<String> = Vec::new();
    let mut outcome = GateOutcome::default();
    for fact in facts {
        let Some((kind, text)) = accepted(fact, &input, &spoken) else {
            outcome.dropped += 1;
            continue;
        };
        let pet = link(fact, kind, &input, &mut mentioned, &mut outcome.new_pets);
        let supersedes = superseded(input.view, &fact.supersedes);
        outcome.notes.push(GatedNote {
            kind,
            pet,
            text,
            supersedes,
        });
    }
    outcome
}

/// 종류, seq, 빈 글, 숫자를 보고 받을 사실이면 (종류, 다듬은 글).
fn accepted(
    fact: &ExtractedFact,
    input: &GateInput<'_>,
    spoken: &BTreeSet<String>,
) -> Option<(NoteKind, String)> {
    let kind = NoteKind::parse(&fact.kind)?;
    if fact.seq != input.seq {
        return None;
    }
    let text = fact.text.trim();
    if text.is_empty() || !numbers(text).is_subset(spoken) {
        return None;
    }
    Some((kind, text.to_owned()))
}

/// 사실의 아이를 정한다. 모르는 이름의 `pet` 사실은 이 세션의 두 번째부터 새 아이로 잇는다.
fn link(
    fact: &ExtractedFact,
    kind: NoteKind,
    input: &GateInput<'_>,
    mentioned: &mut Vec<String>,
    new_pets: &mut Vec<String>,
) -> PetLink {
    let Some(name) = fact
        .pet_name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    else {
        return PetLink::None;
    };
    let key = name_key(name);
    if let Some(pet) = input
        .view
        .pets
        .iter()
        .find(|pet| name_key(&pet.name) == key)
    {
        return PetLink::Known(pet.id.clone());
    }
    if let Some(made) = new_pets.iter().find(|made| name_key(made) == key) {
        return PetLink::New(made.clone());
    }
    if kind != NoteKind::Pet {
        return PetLink::None;
    }
    let seen_before = mentioned.contains(&key)
        || input.view.notes.iter().any(|note| {
            note.session_id == input.session_id
                && note.kind == NoteKind::Pet
                && note.pet_id.is_none()
                && note.text.to_lowercase().contains(&key)
        });
    if seen_before {
        new_pets.push(name.to_owned());
        PetLink::New(name.to_owned())
    } else {
        mentioned.push(key);
        PetLink::None
    }
}

/// 정정 대상: 번호(1부터, 뷰의 순서)가 가리키는 현재 사실들. 목록 밖의 번호와 되풀이는 버린다.
fn superseded(view: &MemoryView, numbers: &[i32]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for number in numbers {
        let Some(note) = usize::try_from(*number)
            .ok()
            .and_then(|n| n.checked_sub(1))
            .and_then(|index| view.notes.get(index))
        else {
            continue;
        };
        if !ids.contains(&note.id) {
            ids.push(note.id.clone());
        }
    }
    ids
}

fn name_key(name: &str) -> String {
    name.trim().to_lowercase()
}

/// 글 안의 숫자 덩어리(앞의 0 은 뗀다). "2025년 3월 14일" → {2025, 3, 14}.
fn numbers(text: &str) -> BTreeSet<String> {
    text.split(|c: char| !c.is_ascii_digit())
        .filter(|run| !run.is_empty())
        .map(|run| {
            let trimmed = run.trim_start_matches('0');
            if trimmed.is_empty() { "0" } else { trimmed }.to_owned()
        })
        .collect()
}
