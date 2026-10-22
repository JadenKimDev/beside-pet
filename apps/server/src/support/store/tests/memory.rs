// 기억 저장(`pets`·`memory_notes`·`memory_optouts`, 뷰 `current_memory`)과 세션 삭제의 연쇄, 보존 기간 파기.
// 이름과 문장은 모두 지어낸 것이다.

use chrono::{DateTime, Duration, Utc};
use sqlx::{AssertSqlSafe, Executor};

use super::super::super::memory::{
    MemoryNote, MemoryOptout, NewNote, NewPet, NoteKind, Pet, PetStatus,
};
use super::super::super::request::LossType;
use super::super::memory::MEMORY_RETENTION_MONTHS;
use super::super::{PgMemoryStore, StoreError};
use super::{SessionsSchema, minute, snapshot};

impl SessionsSchema {
    fn memory(&self) -> PgMemoryStore {
        PgMemoryStore::new(self.pool.clone())
    }

    /// 그 세션이 출처인 기억 행 수: (memory_notes, memory_optouts, pets).
    async fn memory_rows_of(&self, session: &str) -> (i64, i64, i64) {
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM memory_notes WHERE session_id = $1), \
                    (SELECT count(*) FROM memory_optouts WHERE session_id = $1), \
                    (SELECT count(*) FROM pets WHERE source_session_id = $1)",
        )
        .bind(session)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    /// 소유자의 기억 행 수: (memory_notes, memory_optouts, pets).
    async fn memory_rows_of_owner(&self, owner: &str) -> (i64, i64, i64) {
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM memory_notes WHERE owner_id = $1), \
                    (SELECT count(*) FROM memory_optouts WHERE owner_id = $1), \
                    (SELECT count(*) FROM pets WHERE owner_id = $1)",
        )
        .bind(owner)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }
}

fn new_pet(owner: &str, session: &str, name: &str, at: i64) -> NewPet {
    NewPet {
        owner_id: owner.to_owned(),
        name: name.to_owned(),
        status: PetStatus::Deceased,
        loss_type: Some(LossType::Illness),
        source_session_id: session.to_owned(),
        said_at: minute(at),
    }
}

fn new_note(owner: &str, session: &str, seq: i32, kind: NoteKind, at: i64) -> NewNote {
    NewNote {
        owner_id: owner.to_owned(),
        session_id: session.to_owned(),
        seq,
        kind,
        pet_id: None,
        text: format!("made-up fact {seq}"),
        extracted_by: "model:0.1.0".to_owned(),
        said_at: minute(at),
    }
}

async fn superseded_by(db: &SessionsSchema, id: &str) -> Option<String> {
    let (value,): (Option<String>,) =
        sqlx::query_as("SELECT superseded_by FROM memory_notes WHERE id = $1")
            .bind(id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    value
}

#[tokio::test]
async fn 아이는_같은_소유자의_같은_이름이면_그_행을_돌려준다() {
    let db = SessionsSchema::open().await;
    db.store()
        .save(&snapshot("s-1", "owner-a", 0))
        .await
        .unwrap();
    db.store()
        .save(&snapshot("s-2", "owner-a", 10))
        .await
        .unwrap();
    db.store()
        .save(&snapshot("s-b", "owner-b", 0))
        .await
        .unwrap();
    let memory = db.memory();

    let first = memory
        .upsert_pet(&new_pet("owner-a", "s-1", "Dotori", 1))
        .await
        .unwrap();
    assert_eq!(
        first,
        Pet {
            id: first.id.clone(),
            name: "Dotori".to_owned(),
            status: PetStatus::Deceased,
            loss_type: Some(LossType::Illness),
            source_session_id: "s-1".to_owned(),
            said_at: minute(1),
        }
    );
    assert!(!first.id.is_empty());

    let again = memory
        .upsert_pet(&NewPet {
            status: PetStatus::Living,
            loss_type: None,
            ..new_pet("owner-a", "s-2", "Dotori", 11)
        })
        .await
        .unwrap();
    assert_eq!(again, first, "같은 이름은 새 행이 아니고 처음 행 그대로다");

    let other = memory
        .upsert_pet(&new_pet("owner-b", "s-b", "Dotori", 1))
        .await
        .unwrap();
    assert_ne!(other.id, first.id, "다른 소유자는 같은 이름이라도 따로다");
    let living = memory
        .upsert_pet(&NewPet {
            status: PetStatus::Living,
            loss_type: None,
            ..new_pet("owner-a", "s-2", "Chestnut", 12)
        })
        .await
        .unwrap();
    assert_eq!(living.status, PetStatus::Living);
    assert_eq!(living.loss_type, None);
    assert_eq!(db.memory_rows_of_owner("owner-a").await, (0, 0, 2));
    db.close().await;
}

#[tokio::test]
async fn 보기는_소유자의_아이들과_무효화되지_않은_사실을_최근_말한_순으로_준다() {
    let db = SessionsSchema::open().await;
    db.store()
        .save(&snapshot("s-1", "owner-a", 0))
        .await
        .unwrap();
    db.store()
        .save(&snapshot("s-b", "owner-b", 0))
        .await
        .unwrap();
    let memory = db.memory();
    let dotori = memory
        .upsert_pet(&new_pet("owner-a", "s-1", "Dotori", 1))
        .await
        .unwrap();
    let chestnut = memory
        .upsert_pet(&new_pet("owner-a", "s-1", "Chestnut", 3))
        .await
        .unwrap();
    let older = memory
        .insert_note(
            &NewNote {
                pet_id: Some(dotori.id.clone()),
                ..new_note("owner-a", "s-1", 1, NoteKind::Ritual, 1)
            },
            &[],
        )
        .await
        .unwrap();
    let newer = memory
        .insert_note(&new_note("owner-a", "s-1", 3, NoteKind::Place, 3), &[])
        .await
        .unwrap();
    memory
        .insert_note(&new_note("owner-b", "s-b", 1, NoteKind::Person, 5), &[])
        .await
        .unwrap();

    assert_eq!(
        older,
        MemoryNote {
            id: older.id.clone(),
            session_id: "s-1".to_owned(),
            seq: 1,
            kind: NoteKind::Ritual,
            pet_id: Some(dotori.id.clone()),
            text: "made-up fact 1".to_owned(),
            said_at: minute(1),
        }
    );
    let view = memory.view("owner-a").await.unwrap();
    assert_eq!(view.pets, vec![dotori, chestnut]);
    assert_eq!(view.notes, vec![newer, older]);

    let nobody = memory.view("owner-z").await.unwrap();
    assert!(nobody.pets.is_empty() && nobody.notes.is_empty());
    db.close().await;
}

#[tokio::test]
async fn 정정은_새_행이고_옛_행은_superseded_by_로_남는다() {
    let db = SessionsSchema::open().await;
    db.store()
        .save(&snapshot("s-1", "owner-a", 0))
        .await
        .unwrap();
    db.store()
        .save(&snapshot("s-b", "owner-b", 0))
        .await
        .unwrap();
    let memory = db.memory();
    let old = memory
        .insert_note(&new_note("owner-a", "s-1", 1, NoteKind::Date, 1), &[])
        .await
        .unwrap();
    let foreign = memory
        .insert_note(&new_note("owner-b", "s-b", 1, NoteKind::Date, 1), &[])
        .await
        .unwrap();

    let fixed = memory
        .insert_note(
            &new_note("owner-a", "s-1", 3, NoteKind::Date, 3),
            &[old.id.clone(), foreign.id.clone()],
        )
        .await
        .unwrap();

    assert_eq!(
        memory.view("owner-a").await.unwrap().notes,
        vec![fixed.clone()]
    );
    assert_eq!(superseded_by(&db, &old.id).await, Some(fixed.id.clone()));
    assert_eq!(
        superseded_by(&db, &foreign.id).await,
        None,
        "다른 소유자의 행은 무효화하지 않는다"
    );
    assert_eq!(memory.view("owner-b").await.unwrap().notes, vec![foreign]);
    assert_eq!(db.memory_rows_of_owner("owner-a").await, (2, 0, 0));
    db.close().await;
}

#[tokio::test]
async fn 사실을_넣다_실패하면_무효화도_남지_않는다() {
    let db = SessionsSchema::open().await;
    db.store()
        .save(&snapshot("s-1", "owner-a", 0))
        .await
        .unwrap();
    let memory = db.memory();
    let old = memory
        .insert_note(&new_note("owner-a", "s-1", 1, NoteKind::Date, 1), &[])
        .await
        .unwrap();

    // 없는 세션을 가리키면 FK 로 실패한다.
    let failed = memory
        .insert_note(
            &new_note("owner-a", "s-missing", 3, NoteKind::Date, 3),
            std::slice::from_ref(&old.id),
        )
        .await;
    assert!(matches!(failed, Err(StoreError::Database(_))), "{failed:?}");
    assert_eq!(superseded_by(&db, &old.id).await, None);
    assert_eq!(memory.view("owner-a").await.unwrap().notes, vec![old]);
    db.close().await;
}

#[tokio::test]
async fn 옵트아웃은_같은_발화면_한_행이다() {
    let db = SessionsSchema::open().await;
    db.store()
        .save(&snapshot("s-1", "owner-a", 0))
        .await
        .unwrap();
    let memory = db.memory();
    let optout = MemoryOptout {
        owner_id: "owner-a".to_owned(),
        session_id: "s-1".to_owned(),
        seq: 1,
        at: minute(1),
    };
    memory.record_optout(&optout).await.unwrap();
    memory.record_optout(&optout).await.unwrap();
    memory
        .record_optout(&MemoryOptout {
            seq: 3,
            at: minute(3),
            ..optout.clone()
        })
        .await
        .unwrap();
    assert_eq!(db.memory_rows_of("s-1").await, (0, 2, 0));
    db.close().await;
}

/// 두 세션에 걸친 기억: s-gone 이 아이와 사실과 옵트아웃의 출처이고, s-kept 의 사실이 그 아이를 가리킨다.
async fn two_sessions_of_memory(db: &SessionsSchema) -> (Pet, MemoryNote) {
    db.store()
        .save(&snapshot("s-gone", "owner-a", 0))
        .await
        .unwrap();
    db.store()
        .save(&snapshot("s-kept", "owner-a", 10))
        .await
        .unwrap();
    let memory = db.memory();
    let pet = memory
        .upsert_pet(&new_pet("owner-a", "s-gone", "Dotori", 1))
        .await
        .unwrap();
    memory
        .insert_note(&new_note("owner-a", "s-gone", 1, NoteKind::Object, 1), &[])
        .await
        .unwrap();
    memory
        .record_optout(&MemoryOptout {
            owner_id: "owner-a".to_owned(),
            session_id: "s-gone".to_owned(),
            seq: 1,
            at: minute(1),
        })
        .await
        .unwrap();
    let kept = memory
        .insert_note(
            &NewNote {
                pet_id: Some(pet.id.clone()),
                ..new_note("owner-a", "s-kept", 1, NoteKind::Ritual, 11)
            },
            &[],
        )
        .await
        .unwrap();
    (pet, kept)
}

#[tokio::test]
async fn 세션을_지우면_그_세션이_출처인_기억이_사라진다() {
    let db = SessionsSchema::open().await;
    let (_, kept) = two_sessions_of_memory(&db).await;

    db.store().delete("s-gone").await.unwrap();
    assert_eq!(db.memory_rows_of("s-gone").await, (0, 0, 0));
    assert_eq!(db.rows_of("s-gone").await, (0, 0, 0, 0));
    let view = db.memory().view("owner-a").await.unwrap();
    assert!(view.pets.is_empty());
    assert_eq!(
        view.notes,
        vec![MemoryNote {
            pet_id: None,
            ..kept
        }],
        "다른 세션의 사실은 남고 지워진 아이를 가리키던 칸만 빈다"
    );
    db.close().await;
}

#[tokio::test]
async fn 세션_삭제는_외래_키의_연쇄가_없어도_기억을_지운다() {
    let db = SessionsSchema::open().await;
    two_sessions_of_memory(&db).await;
    // 트랜잭션이 기억 테이블을 명시해 지우는지 보려고 세션을 가리키는 연쇄를 걷어 낸다.
    db.pool
        .execute(AssertSqlSafe(
            "ALTER TABLE memory_notes DROP CONSTRAINT memory_notes_session_id_fkey; \
             ALTER TABLE memory_optouts DROP CONSTRAINT memory_optouts_session_id_fkey; \
             ALTER TABLE pets DROP CONSTRAINT pets_source_session_id_fkey;"
                .to_owned(),
        ))
        .await
        .unwrap();

    db.store().delete("s-gone").await.unwrap();
    assert_eq!(db.memory_rows_of("s-gone").await, (0, 0, 0));
    assert_eq!(db.memory_rows_of("s-kept").await, (1, 0, 0));
    db.close().await;
}

/// 그 소유자의 모든 세션의 마지막 갱신을 `at` 으로 옮긴다(저장은 늘 now() 로 적는다).
async fn touch_sessions(db: &SessionsSchema, owner: &str, at: DateTime<Utc>) {
    sqlx::query("UPDATE sessions SET updated_at = $2 WHERE owner_id = $1")
        .bind(owner)
        .bind(at)
        .execute(&db.pool)
        .await
        .unwrap();
}

/// 한 소유자의 세션 하나에 아이, 사실, 옵트아웃 한 행씩.
async fn remember(db: &SessionsSchema, owner: &str, session: &str) {
    db.store().save(&snapshot(session, owner, 0)).await.unwrap();
    let memory = db.memory();
    memory
        .upsert_pet(&new_pet(owner, session, "Dotori", 1))
        .await
        .unwrap();
    memory
        .insert_note(&new_note(owner, session, 1, NoteKind::Place, 1), &[])
        .await
        .unwrap();
    memory
        .record_optout(&MemoryOptout {
            owner_id: owner.to_owned(),
            session_id: session.to_owned(),
            seq: 3,
            at: minute(3),
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn 보존_기간이_지난_계정의_기억만_지우고_세션은_남긴다() {
    assert_eq!(MEMORY_RETENTION_MONTHS, 12);
    let db = SessionsSchema::open().await;
    let now = minute(0) + Duration::days(800);
    let year_ago = now - chrono::Months::new(12);
    remember(&db, "owner-stale", "s-stale").await;
    remember(&db, "owner-mixed", "s-mixed-old").await;
    db.store()
        .save(&snapshot("s-mixed-new", "owner-mixed", 50))
        .await
        .unwrap();
    remember(&db, "owner-edge", "s-edge").await;
    touch_sessions(&db, "owner-stale", year_ago - Duration::days(1)).await;
    touch_sessions(&db, "owner-mixed", year_ago - Duration::days(30)).await;
    sqlx::query("UPDATE sessions SET updated_at = $1 WHERE id = 's-mixed-new'")
        .bind(now - Duration::days(3))
        .execute(&db.pool)
        .await
        .unwrap();
    // 꼭 12개월이면 아직 남긴다(그보다 오래돼야 지운다).
    touch_sessions(&db, "owner-edge", year_ago).await;

    assert_eq!(db.memory().purge_expired(now).await.unwrap(), 3);
    assert_eq!(db.memory_rows_of_owner("owner-stale").await, (0, 0, 0));
    assert_eq!(db.rows_of("s-stale").await.0, 1, "세션은 지우지 않는다");
    assert_eq!(
        db.memory_rows_of_owner("owner-mixed").await,
        (1, 1, 1),
        "최근 세션이 하나라도 있으면 남긴다"
    );
    assert_eq!(db.memory_rows_of_owner("owner-edge").await, (1, 1, 1));
    assert_eq!(db.memory().purge_expired(now).await.unwrap(), 0);
    db.close().await;
}

#[tokio::test]
async fn 모르는_종류와_상태는_읽기_오류다() {
    let db = SessionsSchema::open().await;
    remember(&db, "owner-a", "s-1").await;
    db.pool
        .execute(AssertSqlSafe(
            "ALTER TABLE memory_notes DROP CONSTRAINT memory_notes_kind_check; \
             UPDATE memory_notes SET kind = 'health';"
                .to_owned(),
        ))
        .await
        .unwrap();
    let read = db.memory().view("owner-a").await;
    assert!(matches!(read, Err(StoreError::Database(_))), "{read:?}");
    db.pool
        .execute(AssertSqlSafe(
            "UPDATE memory_notes SET kind = 'place'; \
             ALTER TABLE pets DROP CONSTRAINT pets_status_check; \
             UPDATE pets SET status = 'lost';"
                .to_owned(),
        ))
        .await
        .unwrap();
    let read = db.memory().view("owner-a").await;
    assert!(matches!(read, Err(StoreError::Database(_))), "{read:?}");
    db.close().await;
}
