//! 규칙 추출: 온보딩 프로필에서 아이 한 행을 만든다. 모델을 부르지 않는다.

use chrono::{DateTime, Utc};

use super::{NewPet, PetStatus};
use crate::support::{GriefPath, GriefProfileRequest};

/// 프로필에 아이 이름이 있으면 그 아이(`afterLoss` → 떠난 아이, `beforeLoss` → 곁에 있는 아이). 이름이 비면 `None`.
pub fn pet_from_profile(
    owner_id: &str,
    session_id: &str,
    profile: &GriefProfileRequest,
    said_at: DateTime<Utc>,
) -> Option<NewPet> {
    let name = profile.pet_name.as_deref()?.trim();
    if name.is_empty() {
        return None;
    }
    let status = match profile.grief_path {
        GriefPath::AfterLoss => PetStatus::Deceased,
        GriefPath::BeforeLoss => PetStatus::Living,
    };
    Some(NewPet {
        owner_id: owner_id.to_owned(),
        name: name.to_owned(),
        status,
        loss_type: profile.loss_type,
        source_session_id: session_id.to_owned(),
        said_at,
    })
}
