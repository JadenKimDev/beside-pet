use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

use super::router;
use crate::safety::safety_resources;

#[tokio::test]
async fn 자원_목록을_인증_없이_준다() {
    let app: Router = router::<()>().with_state(());
    let response = app
        .oneshot(
            Request::get("/v1/safety/resources")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body, serde_json::to_value(safety_resources()).unwrap());
}
