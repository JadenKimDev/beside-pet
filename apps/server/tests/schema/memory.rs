//! 장기기억 테이블(`pets`, `memory_notes`, `memory_optouts`)과 뷰 `current_memory`: 칸, 닫힌 값, 세션 삭제의 연쇄.

use sqlx::Row;

use crate::db::TestSchema;

async fn columns(schema: &TestSchema, relation: &str) -> Vec<String> {
    sqlx::query(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    )
    .bind(schema.name())
    .bind(relation)
    .fetch_all(&schema.pool)
    .await
    .unwrap()
    .iter()
    .map(|row| row.get::<String, _>(0))
    .collect()
}

/// 지어낸 계정의 세션 하나.
async fn insert_session(schema: &TestSchema, id: &str) {
    schema
        .exec(&format!(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile) \
             VALUES ('{id}', 'owner-m', 1, 0, 0, false, '{{}}'::jsonb)"
        ))
        .await;
}

async fn insert_pet(schema: &TestSchema, id: &str, session: &str, status: &str) -> bool {
    sqlx::query(
        "INSERT INTO pets (id, owner_id, name, status, loss_type, source_session_id, said_at) \
         VALUES ($1, 'owner-m', '보리', $2, NULL, $3, '2026-10-22T01:00:00Z')",
    )
    .bind(id)
    .bind(status)
    .bind(session)
    .execute(&schema.pool)
    .await
    .is_ok()
}

async fn insert_note(
    schema: &TestSchema,
    id: &str,
    session: &str,
    seq: i32,
    kind: &str,
    pet: Option<&str>,
    said_at: &str,
) -> bool {
    sqlx::query(
        "INSERT INTO memory_notes (id, owner_id, session_id, seq, kind, pet_id, text, extracted_by, said_at) \
         VALUES ($1, 'owner-m', $2, $3, $4, $5, '산책을 좋아했다', 'rule', $6::timestamptz)",
    )
    .bind(id)
    .bind(session)
    .bind(seq)
    .bind(kind)
    .bind(pet)
    .bind(said_at)
    .execute(&schema.pool)
    .await
    .is_ok()
}

async fn count(schema: &TestSchema, sql: &'static str) -> i64 {
    sqlx::query(sql)
        .fetch_one(&schema.pool)
        .await
        .unwrap()
        .get::<i64, _>(0)
}

#[tokio::test]
async fn memory_tables_and_view_have_their_columns() {
    let schema = TestSchema::open().await;
    assert_eq!(
        columns(&schema, "pets").await,
        [
            "id",
            "owner_id",
            "name",
            "status",
            "loss_type",
            "source_session_id",
            "said_at",
            "created_at"
        ]
    );
    let notes = [
        "id",
        "owner_id",
        "session_id",
        "seq",
        "kind",
        "pet_id",
        "text",
        "extracted_by",
        "superseded_by",
        "said_at",
        "created_at",
    ];
    assert_eq!(columns(&schema, "memory_notes").await, notes);
    assert_eq!(columns(&schema, "current_memory").await, notes);
    assert_eq!(
        columns(&schema, "memory_optouts").await,
        ["owner_id", "session_id", "seq", "at"]
    );
    schema.close().await;
}

#[tokio::test]
async fn owner_id_has_the_sessions_type_and_nullable_columns_are_the_named_ones() {
    let schema = TestSchema::open().await;
    let rows = sqlx::query(
        "SELECT table_name::text, column_name::text, data_type::text, is_nullable::text \
         FROM information_schema.columns WHERE table_schema = $1 \
         AND table_name IN ('pets', 'memory_notes', 'memory_optouts') ORDER BY table_name, ordinal_position",
    )
    .bind(schema.name())
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let mut nullable = Vec::new();
    for r in &rows {
        let (table, column, ty, null): (String, String, String, String) =
            (r.get(0), r.get(1), r.get(2), r.get(3));
        if column == "owner_id" {
            assert_eq!(ty, "character varying", "{table}.owner_id");
        }
        if null == "YES" {
            nullable.push(format!("{table}.{column}"));
        }
    }
    assert_eq!(
        nullable,
        [
            "memory_notes.pet_id",
            "memory_notes.superseded_by",
            "pets.loss_type"
        ]
    );
    schema.close().await;
}

#[tokio::test]
async fn kind_and_status_are_closed_sets() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-m1").await;
    assert!(insert_pet(&schema, "pet-ok", "sess-m1", "deceased").await);
    assert!(insert_pet(&schema, "pet-ok2", "sess-m1", "living").await);
    assert!(!insert_pet(&schema, "pet-bad", "sess-m1", "missing").await);
    for (i, kind) in [
        "pet",
        "person",
        "object",
        "place",
        "date",
        "ritual",
        "preference",
    ]
    .iter()
    .enumerate()
    {
        let id = format!("note-{kind}");
        assert!(
            insert_note(
                &schema,
                &id,
                "sess-m1",
                i as i32,
                kind,
                None,
                "2026-10-22T01:00:00Z"
            )
            .await,
            "{kind} 가 안 들어갔다"
        );
    }
    for kind in ["health", "job", ""] {
        assert!(
            !insert_note(
                &schema,
                "note-bad",
                "sess-m1",
                9,
                kind,
                None,
                "2026-10-22T01:00:00Z"
            )
            .await,
            "{kind} 가 들어갔다"
        );
    }
    schema.close().await;
}

#[tokio::test]
async fn memory_extract_is_a_call_purpose() {
    let schema = TestSchema::open().await;
    for purpose in ["reply", "crisis", "report", "judge", "memory_extract"] {
        sqlx::query(
            "INSERT INTO llm_calls (id, at, provider, model, purpose, prompt_version, duration_ms, outcome) \
             VALUES ($1, now(), 'anthropic', 'claude-haiku-5-5', $2, '0.1.0', 10, 'ok')",
        )
        .bind(format!("call-{purpose}"))
        .bind(purpose)
        .execute(&schema.pool)
        .await
        .unwrap_or_else(|e| panic!("{purpose}: {e}"));
    }
    schema.close().await;
}

#[tokio::test]
async fn current_memory_drops_superseded_and_orders_by_pet_then_recent() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-m2").await;
    assert!(insert_pet(&schema, "pet-a", "sess-m2", "deceased").await);
    assert!(insert_pet(&schema, "pet-b", "sess-m2", "living").await);
    assert!(
        insert_note(
            &schema,
            "n-old",
            "sess-m2",
            1,
            "pet",
            Some("pet-a"),
            "2026-10-01T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-new",
            "sess-m2",
            3,
            "pet",
            Some("pet-a"),
            "2026-10-03T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-mid",
            "sess-m2",
            2,
            "place",
            Some("pet-a"),
            "2026-10-02T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-b",
            "sess-m2",
            4,
            "ritual",
            Some("pet-b"),
            "2026-10-04T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-none",
            "sess-m2",
            5,
            "person",
            None,
            "2026-10-05T00:00:00Z"
        )
        .await
    );
    schema
        .exec("UPDATE memory_notes SET superseded_by = 'n-new' WHERE id = 'n-old'")
        .await;
    let ids: Vec<String> = sqlx::query("SELECT id FROM current_memory")
        .fetch_all(&schema.pool)
        .await
        .unwrap()
        .iter()
        .map(|r| r.get(0))
        .collect();
    assert_eq!(ids, ["n-new", "n-mid", "n-b", "n-none"]);
    // 옛 행은 남는다(정정은 무효화이지 삭제가 아니다).
    assert_eq!(count(&schema, "SELECT count(*) FROM memory_notes").await, 5);
    schema.close().await;
}

#[tokio::test]
async fn superseded_by_and_pet_id_must_point_at_existing_rows() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-m3").await;
    assert!(
        !insert_note(
            &schema,
            "n-x",
            "sess-m3",
            1,
            "pet",
            Some("pet-none"),
            "2026-10-01T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-y",
            "sess-m3",
            1,
            "pet",
            None,
            "2026-10-01T00:00:00Z"
        )
        .await
    );
    let bad = sqlx::query("UPDATE memory_notes SET superseded_by = 'n-none' WHERE id = 'n-y'")
        .execute(&schema.pool)
        .await;
    assert!(bad.is_err(), "없는 행을 가리켰다");
    assert!(
        !insert_note(
            &schema,
            "n-z",
            "sess-none",
            1,
            "pet",
            None,
            "2026-10-01T00:00:00Z"
        )
        .await
    );
    schema.close().await;
}

#[tokio::test]
async fn deleting_a_session_cascades_to_its_memory() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-del").await;
    insert_session(&schema, "sess-keep").await;
    assert!(insert_pet(&schema, "pet-del", "sess-del", "deceased").await);
    assert!(
        insert_note(
            &schema,
            "n-del",
            "sess-del",
            1,
            "pet",
            Some("pet-del"),
            "2026-10-01T00:00:00Z"
        )
        .await
    );
    // 다른 세션의 사실이 지워질 아이와 정정을 가리켜도 세션 삭제는 막히지 않는다.
    assert!(
        insert_note(
            &schema,
            "n-keep",
            "sess-keep",
            1,
            "place",
            Some("pet-del"),
            "2026-10-02T00:00:00Z"
        )
        .await
    );
    assert!(
        insert_note(
            &schema,
            "n-keep-old",
            "sess-keep",
            0,
            "date",
            None,
            "2026-09-30T00:00:00Z"
        )
        .await
    );
    schema
        .exec("UPDATE memory_notes SET superseded_by = 'n-del' WHERE id = 'n-keep-old'")
        .await;
    schema
        .exec(
            "INSERT INTO memory_optouts (owner_id, session_id, seq, at) VALUES \
             ('owner-m', 'sess-del', 2, '2026-10-01T00:00:00Z'), ('owner-m', 'sess-keep', 3, '2026-10-02T00:00:00Z')",
        )
        .await;
    schema
        .exec("DELETE FROM sessions WHERE id = 'sess-del'")
        .await;
    assert_eq!(count(&schema, "SELECT count(*) FROM pets").await, 0);
    assert_eq!(
        count(
            &schema,
            "SELECT count(*) FROM memory_notes WHERE session_id = 'sess-del'"
        )
        .await,
        0
    );
    assert_eq!(
        count(
            &schema,
            "SELECT count(*) FROM memory_optouts WHERE session_id = 'sess-del'"
        )
        .await,
        0
    );
    let kept = sqlx::query(
        "SELECT id, pet_id, superseded_by FROM memory_notes WHERE session_id = 'sess-keep' ORDER BY id",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, Option<String>, Option<String>)> = kept
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2)))
        .collect();
    assert_eq!(
        got,
        [
            ("n-keep".to_owned(), None, None),
            ("n-keep-old".to_owned(), None, None)
        ]
    );
    assert_eq!(
        count(&schema, "SELECT count(*) FROM memory_optouts").await,
        1
    );
    schema.close().await;
}

#[tokio::test]
async fn an_optout_is_one_row_per_utterance() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-o").await;
    let sql = "INSERT INTO memory_optouts (owner_id, session_id, seq, at) \
               VALUES ('owner-m', 'sess-o', 4, '2026-10-01T00:00:00Z')";
    schema.exec(sql).await;
    assert!(
        sqlx::query(sql).execute(&schema.pool).await.is_err(),
        "같은 발화의 옵트아웃이 두 행이다"
    );
    schema.close().await;
}
