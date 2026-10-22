//! 기억 저장: `pets`·`memory_notes`·`memory_optouts` 의 SQL. 현재 목록은 뷰 `current_memory` 에서 읽는다.
//!
//! 행은 일어난 사실(아이를 말했다, 사실을 말했다, "기억하지 마"라고 했다)이고 고쳐 쓰지 않는다. 정정만 옛 행의
//! `superseded_by` 를 새 행으로 잇는다. 보존 기간이 지난 계정의 기억은 기동 때 지운다(`purge_expired`).
//! id 는 UUID v4 다. 오류 문구에 본문을 싣지 않는다.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::StoreError;
use super::codec::unknown;
use crate::support::memory::{
    MemoryNote, MemoryOptout, MemoryView, NewNote, NewPet, NoteKind, Pet, PetStatus,
    parse_loss_type,
};

/// 마지막 대화(`sessions.updated_at` 의 최대)에서 이 개월 수가 지난 계정의 기억은 지운다.
pub const MEMORY_RETENTION_MONTHS: i32 = 12;

const PET_COLUMNS: &str = "id, name, status, loss_type, source_session_id, said_at";
const NOTE_COLUMNS: &str = "id, session_id, seq, kind, pet_id, text, said_at";

/// 기억을 읽고 쓰는 곳. 풀을 복제해 들고 다닌다.
#[derive(Debug, Clone)]
pub struct PgMemoryStore {
    pool: PgPool,
}

#[derive(sqlx::FromRow)]
struct PetRow {
    id: String,
    name: String,
    status: String,
    loss_type: Option<String>,
    source_session_id: String,
    said_at: DateTime<Utc>,
}

impl PetRow {
    fn into_pet(self) -> Result<Pet, sqlx::Error> {
        let status =
            PetStatus::parse(&self.status).ok_or_else(|| unknown("pets.status", &self.status))?;
        let loss_type = match self.loss_type {
            Some(text) => {
                Some(parse_loss_type(&text).ok_or_else(|| unknown("pets.loss_type", &text))?)
            }
            None => None,
        };
        Ok(Pet {
            id: self.id,
            name: self.name,
            status,
            loss_type,
            source_session_id: self.source_session_id,
            said_at: self.said_at,
        })
    }
}

#[derive(sqlx::FromRow)]
struct NoteRow {
    id: String,
    session_id: String,
    seq: i32,
    kind: String,
    pet_id: Option<String>,
    text: String,
    said_at: DateTime<Utc>,
}

impl NoteRow {
    fn into_note(self) -> Result<MemoryNote, sqlx::Error> {
        let kind =
            NoteKind::parse(&self.kind).ok_or_else(|| unknown("memory_notes.kind", &self.kind))?;
        Ok(MemoryNote {
            id: self.id,
            session_id: self.session_id,
            seq: self.seq,
            kind,
            pet_id: self.pet_id,
            text: self.text,
            said_at: self.said_at,
        })
    }
}

impl PgMemoryStore {
    pub fn new(pool: PgPool) -> PgMemoryStore {
        PgMemoryStore { pool }
    }

    /// 소유자의 아이들(먼저 말한 순)과 지금 유효한 사실(`current_memory`, 최근 말한 순). 두 읽기는 같은 시점을 본다.
    pub async fn view(&self, owner_id: &str) -> Result<MemoryView, StoreError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .await?;
        let pets: Vec<PetRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {PET_COLUMNS} FROM pets WHERE owner_id = $1 ORDER BY said_at, created_at, id"
        )))
        .bind(owner_id)
        .fetch_all(&mut *tx)
        .await?;
        let notes: Vec<NoteRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {NOTE_COLUMNS} FROM current_memory WHERE owner_id = $1 \
             ORDER BY said_at DESC, seq DESC, created_at DESC, id DESC"
        )))
        .bind(owner_id)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(MemoryView {
            pets: pets
                .into_iter()
                .map(PetRow::into_pet)
                .collect::<Result<_, _>>()?,
            notes: notes
                .into_iter()
                .map(NoteRow::into_note)
                .collect::<Result<_, _>>()?,
        })
    }

    /// 아이를 넣는다. 같은 소유자에 같은 이름이 있으면 넣지 않고 그 행을 돌려준다. 같은 소유자의 동시 넣기는 트랜잭션
    /// 잠금(소유자 id 의 해시)으로 줄 세운다.
    pub async fn upsert_pet(&self, pet: &NewPet) -> Result<Pet, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext('pets:' || $1))")
            .bind(&pet.owner_id)
            .execute(&mut *tx)
            .await?;
        let existing: Option<PetRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {PET_COLUMNS} FROM pets WHERE owner_id = $1 AND name = $2 \
             ORDER BY created_at, id LIMIT 1"
        )))
        .bind(&pet.owner_id)
        .bind(&pet.name)
        .fetch_optional(&mut *tx)
        .await?;
        let row = match existing {
            Some(row) => row,
            None => {
                sqlx::query_as(sqlx::AssertSqlSafe(format!(
                    "INSERT INTO pets (id, owner_id, name, status, loss_type, source_session_id, said_at) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING {PET_COLUMNS}"
                )))
                .bind(Uuid::new_v4().to_string())
                .bind(&pet.owner_id)
                .bind(&pet.name)
                .bind(pet.status.as_str())
                .bind(pet.loss_type.map(|loss| loss.as_str()))
                .bind(&pet.source_session_id)
                .bind(pet.said_at)
                .fetch_one(&mut *tx)
                .await?
            }
        };
        tx.commit().await?;
        Ok(row.into_pet()?)
    }

    /// 사실을 넣고 같은 소유자의 `supersedes` 행 중 아직 유효한 것의 `superseded_by` 를 새 행으로 잇는다. 한 트랜잭션이다.
    pub async fn insert_note(
        &self,
        note: &NewNote,
        supersedes: &[String],
    ) -> Result<MemoryNote, StoreError> {
        let mut tx = self.pool.begin().await?;
        let row: NoteRow = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "INSERT INTO memory_notes (id, owner_id, session_id, seq, kind, pet_id, text, extracted_by, said_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING {NOTE_COLUMNS}"
        )))
        .bind(Uuid::new_v4().to_string())
        .bind(&note.owner_id)
        .bind(&note.session_id)
        .bind(note.seq)
        .bind(note.kind.as_str())
        .bind(&note.pet_id)
        .bind(&note.text)
        .bind(&note.extracted_by)
        .bind(note.said_at)
        .fetch_one(&mut *tx)
        .await?;
        if !supersedes.is_empty() {
            sqlx::query(
                "UPDATE memory_notes SET superseded_by = $1 \
                 WHERE id = ANY($2) AND owner_id = $3 AND superseded_by IS NULL AND id <> $1",
            )
            .bind(&row.id)
            .bind(supersedes)
            .bind(&note.owner_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(row.into_note()?)
    }

    /// 옵트아웃 사건을 남긴다. 같은 (세션, seq) 가 이미 있으면 그대로 둔다.
    pub async fn record_optout(&self, optout: &MemoryOptout) -> Result<(), StoreError> {
        sqlx::query(
            "INSERT INTO memory_optouts (owner_id, session_id, seq, at) VALUES ($1, $2, $3, $4) \
             ON CONFLICT (session_id, seq) DO NOTHING",
        )
        .bind(&optout.owner_id)
        .bind(&optout.session_id)
        .bind(optout.seq)
        .bind(optout.at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// 마지막 대화(소유자의 `sessions.updated_at` 의 최대)가 `at` 에서 `MEMORY_RETENTION_MONTHS` 개월보다 오래된 계정의
    /// 사실, 옵트아웃, 아이를 한 트랜잭션으로 지운다. 세션은 남긴다. 지운 행 수의 합을 돌려준다.
    pub async fn purge_expired(&self, at: DateTime<Utc>) -> Result<u64, StoreError> {
        let mut tx = self.pool.begin().await?;
        let mut purged = 0;
        for table in ["memory_notes", "memory_optouts", "pets"] {
            let deleted = sqlx::query(sqlx::AssertSqlSafe(format!(
                "DELETE FROM {table} WHERE owner_id IN ( \
                   SELECT owner_id FROM sessions GROUP BY owner_id \
                   HAVING max(updated_at) < $1 - make_interval(months => $2))"
            )))
            .bind(at)
            .bind(MEMORY_RETENTION_MONTHS)
            .execute(&mut *tx)
            .await?;
            purged += deleted.rows_affected();
        }
        tx.commit().await?;
        Ok(purged)
    }
}
