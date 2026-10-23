//! Claude Code 공급자: 호출마다 이 머신의 `claude -p`(구독)를 자식 프로세스로 띄워 생성, 스트림, 스키마 묶음을 한다.
//!
//! 개발과 실측(chat:eval, QA)에만 쓰고 production 은 Anthropic 공급자다(ADR-0038). Anthropic 경로와 남는 차이:
//! `claude -p` 가 시스템 프롬프트 뒤에 자기 환경 블록을 붙이고, 대화 턴은 글 하나로 펴서 보내고, `max_tokens` 는
//! 글자 수로 자르고, 프로세스를 띄우는 만큼 느리다. 프롬프트와 답의 본문은 로그에 싣지 않는다.

mod output;
mod process;
mod prompt;

use std::path::PathBuf;
use std::sync::Arc;

use futures_util::future::BoxFuture;
use futures_util::stream;
use tokio::io::{AsyncBufReadExt, BufReader, Lines};
use tokio::process::{Child, ChildStdout};

use self::output::StreamDecoder;
use self::process::Invocation;
use self::prompt::Output;
use super::wire;
use super::{Generation, LlmProvider, ProviderStream, StreamEvent, TextModelProvider};
use crate::llm::{GenerationRequest, OutputSchema};
use crate::shared::ApiError;

const PROVIDER: LlmProvider = LlmProvider::ClaudeCode;
/// `claude` 가 드물게 비정상 종료한다(셈 실측에서 60여 번에 한 번). 한 번만 다시 시도한다.
const ATTEMPTS: u32 = 2;

/// 실행 파일만 받는다. 운영은 PATH 의 `claude`, 테스트는 가짜 실행 파일의 경로다. 환경 변수는 읽지 않는다.
pub struct ClaudeCodeProvider {
    program: PathBuf,
}

impl ClaudeCodeProvider {
    pub fn new(program: impl Into<PathBuf>) -> ClaudeCodeProvider {
        ClaudeCodeProvider {
            program: program.into(),
        }
    }

    fn invocation(
        &self,
        model: &str,
        request: &GenerationRequest,
        output: Output,
        schema: Option<&str>,
    ) -> Invocation {
        Invocation {
            program: self.program.clone(),
            args: prompt::args(model, output, schema, request.system.as_deref()),
            prompt: prompt::flatten(&request.messages),
        }
    }

    /// json 결과를 받는 호출. 실패하면 한 번 다시 띄운다.
    fn generate_json(
        &self,
        model: &str,
        request: GenerationRequest,
        schema: Option<String>,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        let invocation = self.invocation(model, &request, Output::Json, schema.as_deref());
        let structured = schema.is_some();
        Box::pin(async move {
            let mut reason = "no attempt";
            for attempt in 1..=ATTEMPTS {
                match run_json(&invocation, structured).await {
                    // 스키마로 묶인 답은 자르면 읽을 수 없으므로 자르지 않는다.
                    Ok(generation) if structured => return Ok(generation),
                    Ok(generation) => {
                        return Ok(Generation {
                            text: prompt::cut(generation.text, request.max_tokens),
                            usage: generation.usage,
                        });
                    }
                    Err(failed) => {
                        log_attempt(failed, attempt);
                        reason = failed;
                    }
                }
            }
            Err(wire::failure(PROVIDER, reason))
        })
    }
}

impl TextModelProvider for ClaudeCodeProvider {
    fn provider(&self) -> LlmProvider {
        PROVIDER
    }

    fn generate(
        &self,
        model: &str,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        self.generate_json(model, request, None)
    }

    fn generate_structured(
        &self,
        model: &str,
        request: GenerationRequest,
        schema: OutputSchema,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        self.generate_json(model, request, Some(schema.0))
    }

    fn stream(&self, model: &str, request: GenerationRequest) -> ProviderStream {
        let invocation = Arc::new(self.invocation(model, &request, Output::StreamJson, None));
        let max_chars = prompt::max_chars(request.max_tokens);
        Box::pin(stream::unfold(Stage::Start { attempt: 1 }, move |stage| {
            let invocation = Arc::clone(&invocation);
            async move { next_event(&invocation, max_chars, stage).await }
        }))
    }
}

/// 한 번 띄워 끝까지 기다리고 json 결과를 읽는다.
async fn run_json(invocation: &Invocation, structured: bool) -> Result<Generation, &'static str> {
    let (mut child, mut stdout) = invocation.spawn()?;
    let mut buffer = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stdout, &mut buffer)
        .await
        .map_err(|_| "cannot read claude output")?;
    process::finished(&mut child).await?;
    output::read_result(&buffer, structured)
}

fn log_attempt(reason: &'static str, attempt: u32) {
    tracing::warn!(
        provider = PROVIDER.as_str(),
        reason,
        attempt,
        "claude -p attempt failed"
    );
}

/// 떠 있는 자식 하나와 그 출력을 읽는 상태.
struct Running {
    child: Child,
    lines: Lines<BufReader<ChildStdout>>,
    decoder: StreamDecoder,
    attempt: u32,
}

enum Stage {
    Start { attempt: u32 },
    Reading(Box<Running>),
    Done,
}

/// 스트림의 다음 이벤트. 글을 하나도 내기 전에 실패하면 한 번 다시 띄우고, 낸 뒤의 실패는 오류 한 건으로 끝낸다.
/// 끝의 토큰 수는 자식이 성공으로 끝난 것을 확인한 뒤에 낸다.
async fn next_event(
    invocation: &Invocation,
    max_chars: usize,
    mut stage: Stage,
) -> Option<(Result<StreamEvent, ApiError>, Stage)> {
    loop {
        let (reason, attempt, wrote_text) = match stage {
            Stage::Done => return None,
            Stage::Start { attempt } => match invocation.spawn() {
                Ok((child, stdout)) => {
                    stage = Stage::Reading(Box::new(Running {
                        child,
                        lines: BufReader::new(stdout).lines(),
                        decoder: StreamDecoder::new(max_chars),
                        attempt,
                    }));
                    continue;
                }
                Err(reason) => (reason, attempt, false),
            },
            Stage::Reading(mut running) => {
                let attempt = running.attempt;
                match running.lines.next_line().await {
                    Ok(Some(line)) => match running.decoder.feed(&line) {
                        Ok(Some(text)) => {
                            return Some((Ok(StreamEvent::Text(text)), Stage::Reading(running)));
                        }
                        Ok(None) => {
                            stage = Stage::Reading(running);
                            continue;
                        }
                        Err(reason) => (reason, attempt, running.decoder.wrote_text()),
                    },
                    Ok(None) => {
                        let Running {
                            mut child, decoder, ..
                        } = *running;
                        let wrote_text = decoder.wrote_text();
                        match process::finished(&mut child)
                            .await
                            .and_then(|()| decoder.finish())
                        {
                            Ok(usage) => {
                                return Some((Ok(StreamEvent::Usage(usage)), Stage::Done));
                            }
                            Err(reason) => (reason, attempt, wrote_text),
                        }
                    }
                    Err(_) => (
                        "unreadable claude output",
                        attempt,
                        running.decoder.wrote_text(),
                    ),
                }
            }
        };
        // 여기서 버려지는 자식은 죽는다(`kill_on_drop`).
        if !wrote_text && attempt < ATTEMPTS {
            log_attempt(reason, attempt);
            stage = Stage::Start {
                attempt: attempt + 1,
            };
            continue;
        }
        return Some((Err(wire::failure(PROVIDER, reason)), Stage::Done));
    }
}
