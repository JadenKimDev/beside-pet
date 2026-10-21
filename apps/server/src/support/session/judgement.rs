//! 답의 판정(ADR-0031)을 세션의 턴 분석에 적고, 다음 턴의 규칙이 읽을 직전 답의 판정을 돌려준다.

use super::super::Judgement;
use super::super::rules::ReplyJudgement;
use super::{Session, SessionError, TurnStatus};

impl Session {
    /// 끝난(`done`) 턴의 분석에 답의 판정을 적는다(ADR-0031). 이미 적혔으면 새 판정으로 덮는다.
    /// 분석 행에는 턴 id 가 없으므로 턴을 끝낸 시각(`finished_at` = 분석의 `at`, `complete_turn` 이 같은 값을 쓴다)으로 잇는다.
    /// 확률이 0~1 밖이거나 수가 아니면 적지 않고 라벨만 남긴다(저장 칸의 CHECK). 없는 턴은 `TurnNotFound`, 끝나지 않은 턴과
    /// 판정할 답이 없는 턴(분석이 없는 첫 인사, 위기 고정 문구)은 `TurnNotPending` 이고 아무것도 바꾸지 않는다.
    pub fn record_reply_judgement(
        &mut self,
        turn_id: &str,
        judgement: Judgement,
    ) -> Result<(), SessionError> {
        let turn = self.find_turn(turn_id)?;
        let finished_at = match (turn.status, turn.finished_at) {
            (TurnStatus::Done, Some(at)) => at,
            _ => return Err(SessionError::TurnNotPending),
        };
        let analysis = self
            .analyses
            .iter_mut()
            .rev()
            .find(|analysis| analysis.at == finished_at)
            .filter(|analysis| !analysis.risk.level.is_crisis())
            .ok_or(SessionError::TurnNotPending)?;
        let label_probability = judgement
            .label_probability()
            .filter(|probability| (0.0..=1.0).contains(probability));
        analysis.reply = Some(ReplyJudgement {
            label: judgement.label,
            label_probability,
            judge: format!("{}@{}", judgement.judge, judgement.version),
        });
        Ok(())
    }

    /// 이 턴이 세션의 마지막 턴인가. 스트림 턴 뒤의 판정은 그 사이에 다음 턴이 오지 않았을 때만 적는다.
    pub fn is_latest_turn(&self, turn_id: &str) -> bool {
        self.turns.last().is_some_and(|turn| turn.id == turn_id)
    }

    /// 마지막 턴 분석의 판정(직전 답의 판정). 분석이 없거나(첫 턴) 판정이 없으면(끔, 실패, 위기) `None`.
    pub fn last_reply_judgement(&self) -> Option<&ReplyJudgement> {
        self.analyses.last()?.reply.as_ref()
    }
}
