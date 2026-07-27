use std::sync::Arc;

use cliptown_client_rust::{CliptownClientBuilder, StaticAccessToken};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn list_clips_sends_bearer_token() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/clips"))
        .and(header("authorization", "Bearer token"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({"items": [], "next_cursor": null})),
        )
        .mount(&server)
        .await;
    let client = CliptownClientBuilder::new(server.uri())
        .token_provider(Arc::new(StaticAccessToken("token".into())))
        .build()
        .unwrap();
    let page = client.list_clips(None, 10).await.unwrap();
    assert!(page.items.is_empty());
}
