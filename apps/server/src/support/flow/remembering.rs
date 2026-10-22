//! 기억을 턴에 쓰는 법(ADR-0034): 온보딩 프로필의 아이 한 행, 그리고 답이 끝난 턴 뒤 그 사용자 발화의 추출과 게이트 적용.
//! 추출기 구현은 `memory`(trait)와 `llm` 이, 거르는 규칙은 `memory` 의 게이트가, 부르는 자리는 서비스가 맡는다.
//!
//! 뽑는 것은 답이 끝난(`done`) 턴의 사용자 발화뿐이다. 위기 턴(고정 문구)과 중단·실패한 턴은 뽑지 않는다.
//! 실패는 본문 없는 로그 한 줄이고 대화는 그대로다.

use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::orchestrator::language_code;
use super::parts::FlowParts;
use crate::llm::MEMORY_EXTRACT_PROMPT_VERSION;
use crate::support::session::{Session, TurnStatus};
use crate::support::{
    ExtractInput, GateInput, GateOutcome, GriefProfileRequest, MemoryOptout, MessageRole, NewNote,
    NewPet, PetLink, PetStatus, gate_memory, pet_from_profile,
};

/// 온보딩 프로필의 아이를 넣는다(같은 이름이면 그 행). 실패해도 세션 시작은 잇는다.
pub async fn keep_profile_pet(
    parts: &FlowParts,
    owner_id: &str,
    session_id: &str,
    profile: &GriefProfileRequest,
    at: DateTime<Utc>,
) {
    let Some(pet) = pet_from_profile(owner_id, session_id, profile, at) else {
        return;
    };
    if parts.memory.upsert_pet(&pet).await.is_err() {
        tracing::warn!("could not keep the profile pet; the session starts without it");
    }
}

/// 답이 끝난 사용자 턴 하나의 기억 추출. 부르는 쪽이 턴 지연 밖에서 돌린다.
pub async fn remember_turn(parts: Arc<FlowParts>, session_id: String, turn_id: String) {
    if let Err(step) = remember(&parts, &session_id, &turn_id).await {
        tracing::warn!(
            step,
            "memory extraction stopped; the turn keeps no new memory"
        );
    }
}

/// 뽑을 사용자 발화: 소유자, 전사의 자리(seq), 글, 말한 때, 세션 언어.
struct Utterance {
    owner_id: String,
    seq: i32,
    text: String,
    said_at: DateTime<Utc>,
    language: &'static str,
}

async fn remember(parts: &FlowParts, session_id: &str, turn_id: &str) -> Result<(), &'static str> {
    let Some(utterance) = utterance(parts, session_id, turn_id).await? else {
        return Ok(());
    };
    let view = parts
        .memory
        .view(&utterance.owner_id)
        .await
        .map_err(|_| "read memory")?;
    let extraction = match parts
        .extractor
        .extract(ExtractInput {
            view: &view,
            utterance: &utterance.text,
            seq: utterance.seq,
            language: utterance.language,
            session_id,
        })
        .await
    {
        Ok(extraction) => extraction,
        Err(error) => {
            tracing::warn!(%error, "memory extraction failed; the turn keeps no new memory");
            return Ok(());
        }
    };
    let outcome = gate_memory(GateInput {
        extraction: &extraction,
        session_id,
        seq: utterance.seq,
        utterance: &utterance.text,
        view: &view,
    });
    tracing::info!(
        notes = outcome.notes.len(),
        new_pets = outcome.new_pets.len(),
        dropped = outcome.dropped,
        opt_out = outcome.opt_out,
        "memory extracted"
    );
    keep(parts, session_id, &utterance, outcome).await
}

/// 이 턴의 사용자 발화. 턴이 끝나지 않았거나(실패, 중단, 아직 도는 중), 세션이 위기로 닫혔거나(위기 턴), 사용자 말이 없으면 `None`.
async fn utterance(
    parts: &FlowParts,
    session_id: &str,
    turn_id: &str,
) -> Result<Option<Utterance>, &'static str> {
    let snapshot = parts
        .sessions
        .find(session_id)
        .await
        .map_err(|_| "read session")?
        .ok_or("read session")?;
    let done = snapshot
        .turns
        .iter()
        .any(|turn| turn.id == turn_id && turn.status == TurnStatus::Done);
    let said = snapshot.history.iter().enumerate().find(|(_, message)| {
        message.role == MessageRole::User && message.turn_id.as_deref() == Some(turn_id)
    });
    let Some((index, message)) = said.filter(|_| done) else {
        return Ok(None);
    };
    let seq = i32::try_from(index).map_err(|_| "seq out of range")?;
    let (text, said_at) = (message.text.clone(), message.at);
    let session = Session::rehydrate(snapshot);
    if session.support_level().is_crisis() {
        return Ok(None);
    }
    Ok(Some(Utterance {
        owner_id: session.owner_id().to_owned(),
        seq,
        text,
        said_at,
        language: language_code(session.grief_profile().language()),
    }))
}

/// 게이트의 결과를 저장에 적용한다: 옵트아웃이면 사건 한 행, 아니면 새 아이(곁에 있는 아이)를 넣고 사실마다 넣으며 옛 사실을 잇는다.
async fn keep(
    parts: &FlowParts,
    session_id: &str,
    utterance: &Utterance,
    outcome: GateOutcome,
) -> Result<(), &'static str> {
    if outcome.opt_out {
        return parts
            .memory
            .record_optout(&MemoryOptout {
                owner_id: utterance.owner_id.clone(),
                session_id: session_id.to_owned(),
                seq: utterance.seq,
                at: utterance.said_at,
            })
            .await
            .map_err(|_| "record opt-out");
    }
    let mut made: Vec<(String, String)> = Vec::new();
    for name in outcome.new_pets {
        let pet = parts
            .memory
            .upsert_pet(&NewPet {
                owner_id: utterance.owner_id.clone(),
                name: name.clone(),
                status: PetStatus::Living,
                loss_type: None,
                source_session_id: session_id.to_owned(),
                said_at: utterance.said_at,
            })
            .await
            .map_err(|_| "upsert pet")?;
        made.push((name, pet.id));
    }
    let extracted_by = format!("model:{MEMORY_EXTRACT_PROMPT_VERSION}");
    for note in outcome.notes {
        let pet_id = match note.pet {
            PetLink::None => None,
            PetLink::Known(id) => Some(id),
            PetLink::New(name) => made
                .iter()
                .find(|(made_name, _)| *made_name == name)
                .map(|(_, id)| id.clone()),
        };
        parts
            .memory
            .insert_note(
                &NewNote {
                    owner_id: utterance.owner_id.clone(),
                    session_id: session_id.to_owned(),
                    seq: utterance.seq,
                    kind: note.kind,
                    pet_id,
                    text: note.text,
                    extracted_by: extracted_by.clone(),
                    said_at: utterance.said_at,
                },
                &note.supersedes,
            )
            .await
            .map_err(|_| "insert note")?;
    }
    Ok(())
}
