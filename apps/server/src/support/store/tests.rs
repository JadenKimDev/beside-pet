//! 대화 저장 SQL 의 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 지운다. 값은 모두 지어낸 것이다.

use std::str::FromStr;

use chrono::{DateTime, Duration, TimeZone, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool};

use super::super::request::{DailyStateRequest, GriefPath, LossType, SleepState, TogetherRange};
use super::super::response::{
    KnowledgeRefResponse, MessageRole, MindReportSectionResponse, ReplyPhase, ReportSectionKey,
    SupervisionQuality, SupervisionResponse,
};
use super::super::rules::{
    GriefProfile, MindReport, RiskAssessment, SupportLevel, Task, TaskTransition, TurnAnalysis,
};
use super::super::session::{Message, SessionSnapshot};
use super::{SessionStore, StoreError};
use crate::identity::ChatLanguage;
use crate::shared::{MIGRATOR, test_database_url};

/// 테스트 하나의 스키마. `pool` 은 그 스키마만 본다.
struct SessionsSchema {
    root: PgPool,
    schema: String,
    pool: PgPool,
}

impl SessionsSchema {
    async fn open() -> SessionsSchema {
        let options = PgConnectOptions::from_str(&test_database_url())
            .expect("DATABASE_URL 이 postgres 주소가 아니다")
            .ssl_mode(PgSslMode::Disable);
        let root = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let schema = format!(
            "sessions_test_{}_{}_{}",
            std::process::id(),
            Utc::now().timestamp_micros(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        root.execute(AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
            .await
            .unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options.options([("search_path", schema.as_str())]))
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        SessionsSchema { root, schema, pool }
    }

    fn store(&self) -> SessionStore {
        SessionStore::new(self.pool.clone())
    }

    /// 그 세션의 행 수: (sessions, messages, turn_analyses).
    async fn rows_of(&self, id: &str) -> (i64, i64, i64) {
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM sessions WHERE id = $1), \
                    (SELECT count(*) FROM messages WHERE session_id = $1), \
                    (SELECT count(*) FROM turn_analyses WHERE session_id = $1)",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    async fn close(self) {
        self.pool.close().await;
        self.root
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA \"{}\" CASCADE",
                self.schema
            )))
            .await
            .unwrap();
    }
}

fn minute(n: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap() + Duration::minutes(n)
}

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("Dotori".to_owned()),
        together_range: Some(TogetherRange::FourToSeven),
        loss_type: Some(LossType::Illness),
        situation: None,
        weeks_since_loss: Some(3.0),
        daily_state: Some(DailyStateRequest {
            sleep: Some(SleepState::Disturbed),
            eating: None,
        }),
        preferred_language: Some(ChatLanguage::Ko),
    }
}

fn message(role: MessageRole, text: &str, number: u8, at: i64) -> Message {
    Message {
        role,
        text: text.to_owned(),
        task: task(number),
        at: minute(at),
    }
}

fn analysis(at: i64, from: u8, to: u8, supervised: bool) -> TurnAnalysis {
    TurnAnalysis {
        at: minute(at),
        task: task(to),
        phase: if from == to {
            ReplyPhase::Deepen
        } else {
            ReplyPhase::Task
        },
        risk: RiskAssessment::of(SupportLevel::Safe),
        transition: TaskTransition {
            from: task(from),
            to: task(to),
            advanced: from != to,
            retry_count: 0,
        },
        knowledge: if supervised {
            vec![KnowledgeRefResponse {
                source: "fictional-guide.md".to_owned(),
                tags: vec!["memory".to_owned(), "guilt".to_owned()],
            }]
        } else {
            Vec::new()
        },
        supervision: supervised.then(|| SupervisionResponse {
            evaluated: true,
            quality: SupervisionQuality::Review,
            flags: vec!["tooLong".to_owned()],
            note: Some("made-up note".to_owned()),
        }),
    }
}

/// 전사 셋, 분석 둘의 열린 세션.
fn snapshot(id: &str, owner: &str, started: i64) -> SessionSnapshot {
    SessionSnapshot {
        id: id.to_owned(),
        owner_id: owner.to_owned(),
        started_at: minute(started),
        grief_profile: profile(),
        task: task(2),
        retry_count: 1,
        support_level: SupportLevel::Safe,
        closed: false,
        history: vec![
            message(MessageRole::Assistant, "made-up greeting", 1, started),
            message(MessageRole::User, "made-up answer", 1, started + 1),
            message(MessageRole::Assistant, "made-up reply", 2, started + 2),
        ],
        analyses: vec![
            analysis(started + 1, 1, 2, true),
            analysis(started + 2, 2, 2, false),
        ],
        report: None,
    }
}

fn report(at: i64) -> MindReport {
    MindReport {
        at: minute(at),
        pet_name: "Dotori".to_owned(),
        reached_task: task(3),
        locale: ChatLanguage::Ko,
        sections: vec![
            MindReportSectionResponse {
                key: ReportSectionKey::Journey,
                body: "made-up journey".to_owned(),
            },
            MindReportSectionResponse {
                key: ReportSectionKey::Encouragement,
                body: "made-up encouragement".to_owned(),
            },
        ],
    }
}

/// 닫히고 리포트가 붙은, 위기 판정이 있는 세션.
fn closed_with_report(id: &str, owner: &str, started: i64) -> SessionSnapshot {
    let mut snap = snapshot(id, owner, started);
    snap.task = task(3);
    snap.closed = true;
    snap.support_level = SupportLevel::Crisis;
    snap.analyses.push(TurnAnalysis {
        phase: ReplyPhase::Closing,
        risk: RiskAssessment::of(SupportLevel::Crisis),
        ..analysis(started + 3, 3, 3, false)
    });
    snap.report = Some(report(started + 4));
    snap
}

#[tokio::test]
async fn 저장한_세션을_그대로_되살린다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let open = snapshot("s-open", "owner-a", 0);
    let closed = closed_with_report("s-closed", "owner-a", 10);
    store.save(&open).await.unwrap();
    store.save(&closed).await.unwrap();

    assert_eq!(store.find("s-open").await.unwrap(), Some(open));
    assert_eq!(store.find("s-closed").await.unwrap(), Some(closed));
    assert_eq!(store.find("s-nobody").await.unwrap(), None);
    db.close().await;
}

#[tokio::test]
async fn 빈_세션도_되살린다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut empty = snapshot("s-empty", "owner-a", 0);
    empty.task = Task::ONBOARDING;
    empty.history.clear();
    empty.analyses.clear();
    store.save(&empty).await.unwrap();

    assert_eq!(store.find("s-empty").await.unwrap(), Some(empty));
    assert_eq!(db.rows_of("s-empty").await, (1, 0, 0));
    db.close().await;
}

#[tokio::test]
async fn 두_번_저장해도_같다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let snap = closed_with_report("s-1", "owner-a", 0);
    store.save(&snap).await.unwrap();
    store.save(&snap).await.unwrap();

    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 3, 3));
    db.close().await;
}

#[tokio::test]
async fn 이어_저장하면_바뀐_상태와_새_행이_더해진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    store.save(&snap).await.unwrap();

    snap.history
        .push(message(MessageRole::User, "made-up follow-up", 2, 5));
    snap.analyses.push(analysis(5, 2, 3, true));
    snap.task = task(3);
    snap.retry_count = 0;
    snap.closed = true;
    snap.report = Some(report(6));
    store.save(&snap).await.unwrap();

    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 4, 3));
    db.close().await;
}

#[tokio::test]
async fn 다른_소유자의_같은_id_로는_쓰지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mine = snapshot("s-1", "owner-a", 0);
    store.save(&mine).await.unwrap();

    let mut theirs = closed_with_report("s-1", "owner-b", 30);
    theirs
        .history
        .push(message(MessageRole::User, "made-up intrusion", 3, 31));
    assert!(matches!(
        store.save(&theirs).await,
        Err(StoreError::OwnerMismatch)
    ));
    assert_eq!(store.find("s-1").await.unwrap(), Some(mine));
    assert_eq!(db.rows_of("s-1").await, (1, 3, 2));
    db.close().await;
}

#[tokio::test]
async fn 소유자별_목록은_최신순이고_상한까지다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    // 시작 순서와 저장 순서를 섞는다.
    let starts: Vec<i64> = (0..22).map(|n| (n * 7) % 22).collect();
    for start in &starts {
        store
            .save(&snapshot(&format!("a-{start:02}"), "owner-a", *start * 10))
            .await
            .unwrap();
    }
    let other = closed_with_report("b-1", "owner-b", 500);
    store.save(&other).await.unwrap();

    let listed = store.find_by_owner("owner-a", 20).await.unwrap();
    let ids: Vec<String> = listed.iter().map(|snap| snap.id.clone()).collect();
    let expected: Vec<String> = (2..22).rev().map(|n| format!("a-{n:02}")).collect();
    assert_eq!(ids, expected);
    assert_eq!(listed[0], snapshot("a-21", "owner-a", 210));
    assert_eq!(listed[19], snapshot("a-02", "owner-a", 20));

    assert_eq!(
        store.find_by_owner("owner-b", 20).await.unwrap(),
        vec![other]
    );
    assert!(store.find_by_owner("owner-c", 20).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn 지우면_세_테이블에서_그_세션만_사라진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let gone = closed_with_report("s-gone", "owner-a", 0);
    let kept = snapshot("s-kept", "owner-a", 10);
    store.save(&gone).await.unwrap();
    store.save(&kept).await.unwrap();

    store.delete("s-gone").await.unwrap();
    assert_eq!(db.rows_of("s-gone").await, (0, 0, 0));
    assert_eq!(store.find("s-gone").await.unwrap(), None);
    assert_eq!(db.rows_of("s-kept").await, (1, 3, 2));
    assert_eq!(store.find("s-kept").await.unwrap(), Some(kept.clone()));
    assert_eq!(
        store.find_by_owner("owner-a", 20).await.unwrap(),
        vec![kept]
    );
    // 없는 id 를 지워도 오류가 아니다.
    store.delete("s-gone").await.unwrap();
    db.close().await;
}

#[tokio::test]
async fn 계획과_요약과_전사_칸은_세션_행에_없다() {
    let db = SessionsSchema::open().await;
    let columns: Vec<(String,)> = sqlx::query_as(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = current_schema() AND table_name = 'sessions' ORDER BY column_name",
    )
    .fetch_all(&db.pool)
    .await
    .unwrap();
    let names: Vec<&str> = columns.iter().map(|(name,)| name.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "closed",
            "created_at",
            "grief_profile",
            "id",
            "owner_id",
            "report",
            "retry_count",
            "support_level",
            "task",
            "updated_at",
        ]
    );
    db.close().await;
}

/// 저장한 세션의 한 칸을 SQL 로 망가뜨리면 읽기가 오류를 낸다(기본값으로 넘기지 않는다).
async fn assert_corrupt_read(statement: &str) {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store
        .save(&closed_with_report("s-1", "owner-a", 0))
        .await
        .unwrap();
    sqlx::query(AssertSqlSafe(statement.to_owned()))
        .execute(&db.pool)
        .await
        .unwrap();

    let found = store.find("s-1").await;
    assert!(
        matches!(found, Err(StoreError::Database(_))),
        "{statement}: {found:?}"
    );
    assert!(store.find_by_owner("owner-a", 20).await.is_err());
    db.close().await;
}

#[tokio::test]
async fn 모르는_역할은_읽기_오류다() {
    assert_corrupt_read("UPDATE messages SET role = 'system' WHERE seq = 1").await;
}

#[tokio::test]
async fn 모르는_단계와_감지자는_읽기_오류다() {
    assert_corrupt_read("UPDATE turn_analyses SET phase = 'wander' WHERE seq = 0").await;
    assert_corrupt_read("UPDATE turn_analyses SET risk_detected_by = 'model' WHERE seq = 0").await;
}

#[tokio::test]
async fn 범위_밖의_과제와_수준은_읽기_오류다() {
    assert_corrupt_read("UPDATE sessions SET task = 6").await;
    assert_corrupt_read("UPDATE sessions SET support_level = 0").await;
    assert_corrupt_read("UPDATE messages SET task = -1 WHERE seq = 0").await;
    assert_corrupt_read("UPDATE turn_analyses SET to_task = 9 WHERE seq = 1").await;
    assert_corrupt_read("UPDATE turn_analyses SET retry_count = -1 WHERE seq = 1").await;
}

#[tokio::test]
async fn 모양이_틀린_문서는_읽기_오류다() {
    assert_corrupt_read("UPDATE sessions SET grief_profile = '{\"griefPath\": \"lost\"}'").await;
    assert_corrupt_read("UPDATE sessions SET report = '[]'").await;
    assert_corrupt_read(
        "UPDATE turn_analyses SET supervision = \
         '{\"evaluated\": true, \"quality\": \"great\", \"flags\": []}' WHERE seq = 0",
    )
    .await;
    assert_corrupt_read("UPDATE turn_analyses SET knowledge = '{}' WHERE seq = 0").await;
}
