//! 보관함: 소프트 삭제와 되살림. 세션과 리포트를 보관함으로 옮기고, 지운 세션을 찾아 소유자를 확인하고, 되살리고, 보관함 목록을 낸다.
//! 행을 지우는 파기(기동 때)는 맡지 않는다(ADR-0036).

use super::access::NOT_OWNER;
use super::service::SupportFlow;
use crate::shared::ApiError;
use crate::support::session::{Session, SessionSnapshot};
use crate::support::store::DeletedSession;
use crate::support::{DeletedSessionResponse, MindReportResponse, Requester, SessionStateResponse};

/// 보관함이 돌려주는 지운 세션의 수. 3개월치를 넉넉히 덮는다.
const TRASH_LIST_LIMIT: u32 = 100;

/// 지울 리포트나 되살릴 리포트가 없다. 지운 리포트를 읽을 때도 같다(ADR-0036).
const REPORT_NOT_FOUND: &str = "Report not found";

pub(super) fn report_not_found() -> ApiError {
    ApiError::NotFound(REPORT_NOT_FOUND.to_owned())
}

fn session_not_found(id: &str) -> ApiError {
    ApiError::NotFound(format!("Session not found: {id}"))
}

/// 지운 세션의 소유자 확인: 남의 것이면 403, 관리자는 통과(`require` 와 같은 규칙).
fn check_owner(snapshot: &SessionSnapshot, requester: &Requester) -> Result<(), ApiError> {
    if snapshot.owner_id != requester.account_id && !requester.is_admin {
        return Err(ApiError::Forbidden(NOT_OWNER.to_owned()));
    }
    Ok(())
}

fn trash_item(deleted: DeletedSession) -> DeletedSessionResponse {
    let session = Session::rehydrate(deleted.snapshot);
    let profile = session.grief_profile();
    DeletedSessionResponse {
        session_id: session.id().to_owned(),
        started_at: session.started_at(),
        deleted_at: deleted.deleted_at,
        purge_at: deleted.purge_at,
        pet_name: profile.pet_name.clone(),
        preferred_language: profile.language(),
    }
}

impl SupportFlow {
    /// 보관함으로 옮긴다(소프트 삭제). 이미 지운 내 세션이면 그대로 성공한다(멱등).
    pub(super) async fn delete_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<(), ApiError> {
        let sessions = self.parts.sessions.as_ref();
        if sessions.find(session_id).await?.is_none() {
            return self.find_deleted(requester, session_id).await.map(|_| ());
        }
        self.find(requester, session_id).await?;
        if !sessions.soft_delete(session_id).await? {
            return Err(session_not_found(session_id));
        }
        Ok(())
    }

    /// 지운 세션 하나. 없거나 살아 있으면 404, 남의 것이면 403.
    async fn find_deleted(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<SessionSnapshot, ApiError> {
        let snapshot = self
            .parts
            .sessions
            .find_deleted(session_id)
            .await?
            .ok_or_else(|| session_not_found(session_id))?;
        check_owner(&snapshot, requester)?;
        Ok(snapshot)
    }

    /// 되살리고 상태를 낸다. 살아 있는 세션이면 그대로 낸다.
    pub(super) async fn restore_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<SessionStateResponse, ApiError> {
        let sessions = self.parts.sessions.as_ref();
        if sessions.find(session_id).await?.is_none() {
            self.find_deleted(requester, session_id).await?;
            if !sessions.restore(session_id).await? {
                return Err(session_not_found(session_id));
            }
        }
        Ok(self.find(requester, session_id).await?.state_response())
    }

    pub(super) async fn list_trash(
        &self,
        requester: &Requester,
    ) -> Result<Vec<DeletedSessionResponse>, ApiError> {
        let deleted = self
            .parts
            .sessions
            .list_deleted(&requester.account_id, TRASH_LIST_LIMIT)
            .await?;
        Ok(deleted.into_iter().map(trash_item).collect())
    }

    /// 리포트만 지운다. 아직 쓰지 않았거나 이미 지웠으면 404.
    pub(super) async fn delete_report_of(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<(), ApiError> {
        self.find(requester, session_id).await?;
        if !self.parts.sessions.delete_report(session_id).await? {
            return Err(report_not_found());
        }
        Ok(())
    }

    /// 지운 리포트를 되살려 저장된 그대로 낸다(다시 쓰지 않는다).
    pub(super) async fn restore_report_of(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<MindReportResponse, ApiError> {
        self.find(requester, session_id).await?;
        if !self.parts.sessions.restore_report(session_id).await? {
            return Err(report_not_found());
        }
        let session = self.find(requester, session_id).await?;
        session
            .report()
            .map(|stored| stored.to_response(session.started_at()))
            .ok_or_else(report_not_found)
    }
}
