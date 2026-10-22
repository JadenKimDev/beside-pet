// 소프트 삭제(보관함)와 되살리기, 리포트의 따로 지우기, 3개월 파기와 주인별 연쇄 삭제. 이름과 문장은 모두 지어낸 것이다.

use chrono::{DateTime, Duration, Months, Utc};

use super::super::super::memory::{NewNote, NewPet, NoteKind, PetStatus};
use super::super::purge::TRASH_RETENTION_MONTHS;
use super::super::{PgMemoryStore, TrashPurge};
use super::{SessionsSchema, closed_with_report, minute, snapshot};

impl SessionsSchema {
    /// 그 세션의 `deleted_at`·`report_deleted_at`, 그리고 `report` 칸이 차 있는가(본문은 읽지 않는다).
    async fn deletion_of(&self, id: &str) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>, bool) {
        sqlx::query_as(
            "SELECT deleted_at, report_deleted_at, report IS NOT NULL FROM sessions WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    async fn set_deleted_at(&self, id: &str, at: DateTime<Utc>) {
        sqlx::query("UPDATE sessions SET deleted_at = $2 WHERE id = $1")
            .bind(id)
            .bind(at)
            .execute(&self.pool)
            .await
            .unwrap();
    }

    async fn set_report_deleted_at(&self, id: &str, at: DateTime<Utc>) {
        sqlx::query("UPDATE sessions SET report_deleted_at = $2 WHERE id = $1")
            .bind(id)
            .bind(at)
            .execute(&self.pool)
            .await
            .unwrap();
    }

    /// 그 세션이 출처인 기억 행 수: (memory_notes, memory_optouts, pets).
    async fn memory_of(&self, session: &str) -> (i64, i64, i64) {
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

    /// 소유자의 모든 행 수: (sessions, messages, turns, turn_analyses, memory_notes, memory_optouts, pets).
    async fn owner_rows(&self, owner: &str) -> (i64, i64, i64, i64, i64, i64, i64) {
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM sessions WHERE owner_id = $1), \
                    (SELECT count(*) FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = $1)), \
                    (SELECT count(*) FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = $1)), \
                    (SELECT count(*) FROM turn_analyses WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = $1)), \
                    (SELECT count(*) FROM memory_notes WHERE owner_id = $1), \
                    (SELECT count(*) FROM memory_optouts WHERE owner_id = $1), \
                    (SELECT count(*) FROM pets WHERE owner_id = $1)",
        )
        .bind(owner)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }
}

fn memory(db: &SessionsSchema) -> PgMemoryStore {
    PgMemoryStore::new(db.pool.clone())
}

/// 세션에 아이 하나, 사실 하나, 옵트아웃 하나를 남긴다. 아이 이름은 지어낸 것이다.
async fn remember_in(db: &SessionsSchema, owner: &str, session: &str, pet: &str) {
    let memory = memory(db);
    let pet = memory
        .upsert_pet(&NewPet {
            owner_id: owner.to_owned(),
            name: pet.to_owned(),
            status: PetStatus::Deceased,
            loss_type: None,
            source_session_id: session.to_owned(),
            said_at: minute(1),
        })
        .await
        .unwrap();
    memory
        .insert_note(
            &NewNote {
                owner_id: owner.to_owned(),
                session_id: session.to_owned(),
                seq: 1,
                kind: NoteKind::Place,
                pet_id: Some(pet.id),
                text: format!("made-up fact in {session}"),
                extracted_by: "rule".to_owned(),
                said_at: minute(1),
            },
            &[],
        )
        .await
        .unwrap();
    memory
        .record_optout(&super::super::super::memory::MemoryOptout {
            owner_id: owner.to_owned(),
            session_id: session.to_owned(),
            seq: 2,
            at: minute(2),
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn 소프트_삭제는_행과_메시지와_기억을_남기고_읽기에서_뺀다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let gone = snapshot("s-gone", "owner-a", 0);
    let kept = snapshot("s-kept", "owner-a", 10);
    store.save(&gone).await.unwrap();
    store.save(&kept).await.unwrap();
    remember_in(&db, "owner-a", "s-gone", "Bori").await;

    assert!(store.soft_delete("s-gone").await.unwrap());
    let (deleted_at, report_deleted_at, _) = db.deletion_of("s-gone").await;
    assert!(deleted_at.is_some());
    assert_eq!(report_deleted_at, None);
    assert_eq!(db.rows_of("s-gone").await, (1, 3, 2, 2), "행은 남는다");
    assert_eq!(db.memory_of("s-gone").await, (1, 1, 1), "기억 행도 남는다");

    assert_eq!(
        store.find("s-gone").await.unwrap(),
        None,
        "지운 세션은 없음과 같다"
    );
    assert_eq!(
        store.find_by_owner("owner-a", 20).await.unwrap(),
        vec![kept.clone()]
    );
    let (latest, _) = store.latest_by_owner("owner-a").await.unwrap().unwrap();
    assert_eq!(latest.id, "s-kept");
    assert_eq!(store.find_deleted("s-gone").await.unwrap(), Some(gone));
    assert_eq!(store.find_deleted("s-kept").await.unwrap(), None);
    db.close().await;
}

#[tokio::test]
async fn 소프트_삭제는_멱등이고_처음_시각이_남는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store.save(&snapshot("s-1", "owner-a", 0)).await.unwrap();
    assert!(store.soft_delete("s-1").await.unwrap());
    let earlier = minute(0);
    db.set_deleted_at("s-1", earlier).await;
    assert!(
        store.soft_delete("s-1").await.unwrap(),
        "이미 지운 세션도 있다"
    );
    assert_eq!(db.deletion_of("s-1").await.0, Some(earlier));
    assert!(
        !store.soft_delete("s-none").await.unwrap(),
        "없는 세션은 없다"
    );
    db.close().await;
}

#[tokio::test]
async fn 직전_세션과_세션_유무는_지운_세션을_보지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store.save(&snapshot("s-old", "owner-a", 0)).await.unwrap();
    store
        .save(&snapshot("s-new", "owner-a", 100))
        .await
        .unwrap();
    store.soft_delete("s-new").await.unwrap();
    let (latest, _) = store.latest_by_owner("owner-a").await.unwrap().unwrap();
    assert_eq!(latest.id, "s-old", "지운 세션은 직전 세션이 아니다");
    store.soft_delete("s-old").await.unwrap();
    assert_eq!(store.latest_by_owner("owner-a").await.unwrap(), None);
    assert!(!store.has_sessions("owner-a").await.unwrap());
    db.close().await;
}

#[tokio::test]
async fn 되살리면_목록과_기억에_돌아온다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let session = snapshot("s-1", "owner-a", 0);
    store.save(&session).await.unwrap();
    store.save(&snapshot("s-2", "owner-a", 10)).await.unwrap();
    remember_in(&db, "owner-a", "s-1", "Bori").await;
    let before = memory(&db).view("owner-a").await.unwrap();
    assert_eq!((before.pets.len(), before.notes.len()), (1, 1));

    store.soft_delete("s-1").await.unwrap();
    let hidden = memory(&db).view("owner-a").await.unwrap();
    assert!(
        hidden.pets.is_empty(),
        "지운 세션이 출처인 아이는 기억 블록에 없다"
    );
    assert!(
        hidden.notes.is_empty(),
        "지운 세션의 사실은 기억 블록에 없다"
    );

    assert!(store.restore("s-1").await.unwrap());
    assert_eq!(db.deletion_of("s-1").await.0, None);
    assert_eq!(store.find("s-1").await.unwrap(), Some(session));
    assert_eq!(store.find_by_owner("owner-a", 20).await.unwrap().len(), 2);
    assert_eq!(memory(&db).view("owner-a").await.unwrap(), before);

    assert!(
        store.restore("s-1").await.unwrap(),
        "살아 있는 세션은 그대로다"
    );
    assert!(!store.restore("s-none").await.unwrap());
    db.close().await;
}

#[tokio::test]
async fn 지운_세션의_아이도_살아_있는_사실이_가리키면_보인다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store.save(&snapshot("s-1", "owner-a", 0)).await.unwrap();
    store.save(&snapshot("s-2", "owner-a", 10)).await.unwrap();
    remember_in(&db, "owner-a", "s-1", "Bori").await;
    // 다음 세션에서 같은 아이를 다시 말했다: 같은 이름이라 같은 아이 행을 가리킨다.
    remember_in(&db, "owner-a", "s-2", "Bori").await;
    store.soft_delete("s-1").await.unwrap();

    let view = memory(&db).view("owner-a").await.unwrap();
    assert_eq!(view.pets.len(), 1);
    assert_eq!(view.notes.len(), 1);
    assert_eq!(view.notes[0].session_id, "s-2");
    db.close().await;
}

#[tokio::test]
async fn 보관함은_지운_세션만_지운_시각과_파기_시각과_함께_낸다() {
    assert_eq!(TRASH_RETENTION_MONTHS, 3);
    let db = SessionsSchema::open().await;
    let store = db.store();
    let first = snapshot("s-first", "owner-a", 0);
    let second = snapshot("s-second", "owner-a", 10);
    store.save(&first).await.unwrap();
    store.save(&second).await.unwrap();
    store
        .save(&snapshot("s-alive", "owner-a", 20))
        .await
        .unwrap();
    store
        .save(&snapshot("s-other", "owner-b", 0))
        .await
        .unwrap();
    store.soft_delete("s-other").await.unwrap();
    db.set_deleted_at("s-first", minute(100)).await;
    db.set_deleted_at("s-second", minute(50)).await;

    let trash = store.list_deleted("owner-a", 20).await.unwrap();
    let ids: Vec<&str> = trash.iter().map(|item| item.snapshot.id.as_str()).collect();
    assert_eq!(ids, ["s-first", "s-second"], "늦게 지운 것부터");
    assert_eq!(trash[0].snapshot, first);
    assert_eq!(trash[0].deleted_at, minute(100));
    assert_eq!(trash[0].purge_at, minute(100) + Months::new(3));
    assert_eq!(trash[1].deleted_at, minute(50));
    assert_eq!(store.list_deleted("owner-a", 1).await.unwrap().len(), 1);
    assert!(store.list_deleted("owner-c", 20).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn 리포트를_지우면_칸은_남고_읽기는_없음이며_되살리면_같은_리포트다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let closed = closed_with_report("s-1", "owner-a", 0);
    store.save(&closed).await.unwrap();
    store
        .save(&snapshot("s-open", "owner-a", 10))
        .await
        .unwrap();

    assert!(store.delete_report("s-1").await.unwrap());
    let (deleted_at, report_deleted_at, has_report) = db.deletion_of("s-1").await;
    assert_eq!(deleted_at, None, "대화는 남는다");
    assert!(report_deleted_at.is_some());
    assert!(has_report, "리포트 칸은 남는다");
    let read = store.find("s-1").await.unwrap().unwrap();
    assert_eq!(read.report, None, "지운 리포트는 없음으로 읽힌다");
    assert_eq!(
        store.find_by_owner("owner-a", 20).await.unwrap()[1].report,
        None
    );
    let deleted = store.deleted_reports(&["s-1", "s-open"]).await.unwrap();
    assert_eq!(deleted.into_iter().collect::<Vec<_>>(), ["s-1"]);

    // 지운 리포트가 있는 세션을 다시 저장해도 칸은 지워지지 않는다.
    store.save(&read).await.unwrap();
    assert!(db.deletion_of("s-1").await.2);

    assert!(
        !store.delete_report("s-1").await.unwrap(),
        "이미 지운 리포트는 없다"
    );
    assert!(
        !store.delete_report("s-open").await.unwrap(),
        "리포트가 없는 세션"
    );
    assert!(!store.delete_report("s-none").await.unwrap());

    assert!(store.restore_report("s-1").await.unwrap());
    assert_eq!(store.find("s-1").await.unwrap(), Some(closed));
    assert!(store.deleted_reports(&["s-1"]).await.unwrap().is_empty());
    assert!(
        !store.restore_report("s-1").await.unwrap(),
        "지운 리포트가 없다"
    );
    assert!(!store.restore_report("s-open").await.unwrap());
    db.close().await;
}

#[tokio::test]
async fn 파기는_3개월_지난_보관만_지우고_안의_것은_둔다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let now = minute(0) + Duration::days(400);
    let cutoff = now - Months::new(3);
    for id in ["s-old", "s-edge", "s-recent", "s-alive"] {
        store.save(&snapshot(id, "owner-a", 0)).await.unwrap();
    }
    for id in ["r-old", "r-recent"] {
        store
            .save(&closed_with_report(id, "owner-a", 0))
            .await
            .unwrap();
    }
    remember_in(&db, "owner-a", "s-old", "Bori").await;
    remember_in(&db, "owner-a", "s-recent", "Kongi").await;
    db.set_deleted_at("s-old", cutoff - Duration::days(1)).await;
    // 꼭 3개월이면 아직 둔다(그보다 오래돼야 지운다).
    db.set_deleted_at("s-edge", cutoff).await;
    db.set_deleted_at("s-recent", now - Duration::days(10))
        .await;
    db.set_report_deleted_at("r-old", cutoff - Duration::days(1))
        .await;
    db.set_report_deleted_at("r-recent", now - Duration::days(10))
        .await;

    assert_eq!(
        store.purge_trash(now).await.unwrap(),
        TrashPurge {
            reports: 1,
            sessions: 1
        }
    );
    assert_eq!(db.rows_of("s-old").await, (0, 0, 0, 0));
    assert_eq!(db.memory_of("s-old").await, (0, 0, 0));
    assert_eq!(db.rows_of("s-edge").await, (1, 3, 2, 2));
    assert_eq!(db.rows_of("s-recent").await, (1, 3, 2, 2));
    assert_eq!(db.memory_of("s-recent").await, (1, 1, 1));
    assert_eq!(db.rows_of("s-alive").await, (1, 3, 2, 2));
    assert_eq!(
        db.deletion_of("r-old").await,
        (None, None, false),
        "리포트 칸이 빈다"
    );
    assert_eq!(db.rows_of("r-old").await.0, 1, "대화는 남는다");
    let (_, recent_report_at, recent_has_report) = db.deletion_of("r-recent").await;
    assert!(recent_report_at.is_some() && recent_has_report);

    assert_eq!(
        store.purge_trash(now).await.unwrap(),
        TrashPurge {
            reports: 0,
            sessions: 0
        }
    );
    db.close().await;
}

#[tokio::test]
async fn 주인별_삭제는_그_사람의_대화와_기억을_모두_지운다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store
        .save(&closed_with_report("s-a1", "owner-a", 0))
        .await
        .unwrap();
    store.save(&snapshot("s-a2", "owner-a", 10)).await.unwrap();
    store.save(&snapshot("s-b", "owner-b", 0)).await.unwrap();
    remember_in(&db, "owner-a", "s-a1", "Bori").await;
    remember_in(&db, "owner-a", "s-a2", "Kongi").await;
    remember_in(&db, "owner-b", "s-b", "Bori").await;
    store.soft_delete("s-a2").await.unwrap();
    let other_before = db.owner_rows("owner-b").await;

    assert_eq!(store.delete_by_owner("owner-a").await.unwrap(), 2);
    assert_eq!(db.owner_rows("owner-a").await, (0, 0, 0, 0, 0, 0, 0));
    assert_eq!(db.owner_rows("owner-b").await, other_before);
    assert_eq!(store.delete_by_owner("owner-a").await.unwrap(), 0);
    db.close().await;
}
