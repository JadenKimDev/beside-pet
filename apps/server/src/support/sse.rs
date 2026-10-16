//! 스트림 턴을 Server-Sent Events 로 보낸다: 이벤트마다 `data: <JSON>\n\n` 한 프레임.
//!
//! 헤더는 첫 이벤트를 받은 뒤에 정한다. 그래서 첫 이벤트 전의 오류(없는 세션, 남의 세션)는 보통의 HTTP 오류이고,
//! 흐르던 중의 오류는 `done` 없이 스트림을 끝내 실패를 알린다(TS 의 `sse-writer.ts` 와 같다).

use std::convert::Infallible;

use axum::body::Body;
use axum::http::header::{CACHE_CONTROL, CONNECTION, CONTENT_TYPE};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::future::ready;
use futures_util::{StreamExt, stream};

use super::{StreamEvent, TurnStream};

const X_ACCEL_BUFFERING: HeaderName = HeaderName::from_static("x-accel-buffering");

pub async fn sse_response(mut events: TurnStream) -> Response {
    let first = match events.next().await {
        Some(Err(error)) => return error.into_response(),
        Some(Ok(event)) => Some(event),
        None => None,
    };
    let rest = events
        .take_while(|item| {
            if let Err(error) = item {
                // 대화 본문은 싣지 않는다. 상태만 남긴다.
                tracing::warn!(status = %error.status(), "SSE 스트림이 도중에 실패해 done 없이 끊는다");
            }
            ready(item.is_ok())
        })
        .filter_map(|item| ready(item.ok()));
    let frames = stream::iter(first)
        .chain(rest)
        .map(|event| Ok::<String, Infallible>(frame(&event)));
    (
        StatusCode::OK,
        [
            (
                CONTENT_TYPE,
                HeaderValue::from_static("text/event-stream; charset=utf-8"),
            ),
            (
                CACHE_CONTROL,
                HeaderValue::from_static("no-cache, no-transform"),
            ),
            (CONNECTION, HeaderValue::from_static("keep-alive")),
            (X_ACCEL_BUFFERING, HeaderValue::from_static("no")),
        ],
        Body::from_stream(frames),
    )
        .into_response()
}

fn frame(event: &StreamEvent) -> String {
    let json =
        serde_json::to_string(event).expect("StreamEvent 는 문자열 키의 값뿐이라 늘 JSON 이 된다");
    format!("data: {json}\n\n")
}

#[cfg(test)]
mod tests;
