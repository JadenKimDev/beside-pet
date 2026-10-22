//! 기억 블록: 소유자의 현재 사실을 발화 시스템 프롬프트의 "About this person" 블록으로 바꾼다. 매 턴 들어간다.
//!
//! 지금 세션의 아이와 아이 없는 사실을 먼저 종류마다 한 줄로 두고, 다른 아이의 사실은 그 뒤에 아이마다 한 줄
//! (`About 이름 (상태): …`, 최근 말한 순)로 둔다. 사실은 모두 합쳐 `MAX_FACTS` 개까지이고, 넘치면 다른 아이의 오래된
//! 것부터, 그다음 지금 세션 쪽의 오래된 것을 뺀다(검색하지 않는다). 사실이 없으면 블록도 없다.

use super::reply::PromptBlock;
use crate::support::{MemoryNote, MemoryView, NoteKind, Pet, PetStatus};

/// 블록에 넣는 사실의 최대 수.
pub const MAX_FACTS: usize = 50;

/// 블록의 이름(sandbox 턴 추적이 그대로 남긴다).
pub const BLOCK_NAME: &str = "memory";

const HEADER: &str = "About this person (facts they shared; never quote verbatim; never bring up on your own: how the pet died, or anything about their guilt):";

/// `session_pet` 은 지금 세션 프로필의 아이 이름이다. 없거나 저장된 아이가 아니면 모든 아이를 같은 무게로 둔다.
pub fn memory_block(view: &MemoryView, session_pet: Option<&str>) -> Option<PromptBlock> {
    let key = |name: &str| name.trim().to_lowercase();
    let current =
        session_pet.and_then(|name| view.pets.iter().find(|pet| key(&pet.name) == key(name)));
    let mut notes: Vec<&MemoryNote> = view.notes.iter().collect();
    notes.sort_by_key(|note| std::cmp::Reverse(note.said_at));
    // 지금 세션의 아이가 정해지면 다른 아이에 묶인 사실은 아이별 줄로 따로 둔다.
    let (mut facts, mut others): (Vec<&MemoryNote>, Vec<&MemoryNote>) = notes
        .into_iter()
        .partition(|note| match (current, note.pet_id.as_deref()) {
            (Some(pet), Some(pet_id)) => pet.id == pet_id,
            _ => true,
        });
    others.retain(|note| {
        view.pets
            .iter()
            .any(|pet| Some(pet.id.as_str()) == note.pet_id.as_deref())
    });
    facts.truncate(MAX_FACTS);
    others.truncate(MAX_FACTS - facts.len());
    if facts.is_empty() && others.is_empty() {
        return None;
    }

    let mut lines = vec![HEADER.to_owned()];
    match current {
        Some(pet) => {
            lines.push(format!("Pet in this conversation: {}", pet_label(pet)));
            let others: Vec<String> = view
                .pets
                .iter()
                .filter(|other| other.id != pet.id)
                .map(pet_label)
                .collect();
            if !others.is_empty() {
                lines.push(format!("Other pets: {}", others.join(", ")));
            }
        }
        None if !view.pets.is_empty() => {
            let all: Vec<String> = view.pets.iter().map(pet_label).collect();
            lines.push(format!("Pets: {}", all.join(", ")));
        }
        None => {}
    }
    for kind in NoteKind::ALL {
        let texts: Vec<&str> = facts
            .iter()
            .filter(|note| note.kind == kind)
            .map(|note| note.text.as_str())
            .collect();
        if !texts.is_empty() {
            lines.push(format!("- {}: {}", kind.as_str(), texts.join("; ")));
        }
    }
    for pet in &view.pets {
        let texts: Vec<&str> = others
            .iter()
            .filter(|note| note.pet_id.as_deref() == Some(pet.id.as_str()))
            .map(|note| note.text.as_str())
            .collect();
        if !texts.is_empty() {
            lines.push(format!("About {}: {}", pet_label(pet), texts.join("; ")));
        }
    }
    Some(PromptBlock {
        name: BLOCK_NAME,
        text: lines.join("\n"),
    })
}

fn pet_label(pet: &Pet) -> String {
    let status = match pet.status {
        PetStatus::Deceased => "passed away",
        PetStatus::Living => "living",
    };
    format!("{} ({status})", pet.name)
}

#[cfg(test)]
mod tests;
