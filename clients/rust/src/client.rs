use std::sync::Arc;

use cliptown_interfaces_rust::{ClipEnvelope, SearchRequest};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AccessTokenProvider, ClientError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipPage {
    pub items: Vec<ClipEnvelope>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRequest {
    pub mutations: Vec<ClipEnvelope>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub cursor: Option<String>,
    pub limit: u32,
}

pub struct CliptownClientBuilder {
    endpoint: String,
    token_provider: Option<Arc<dyn AccessTokenProvider>>,
    http: reqwest::Client,
}

impl CliptownClientBuilder {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            token_provider: None,
            http: reqwest::Client::new(),
        }
    }

    pub fn token_provider(mut self, provider: Arc<dyn AccessTokenProvider>) -> Self {
        self.token_provider = Some(provider);
        self
    }

    pub fn build(self) -> Result<CliptownClient, ClientError> {
        let endpoint = self.endpoint.trim_end_matches('/').to_owned();
        if !endpoint.starts_with("https://")
            && !endpoint.starts_with("http://127.0.0.1")
            && !endpoint.starts_with("http://localhost")
        {
            return Err(ClientError::Configuration(
                "endpoint must use HTTPS outside localhost".into(),
            ));
        }
        Ok(CliptownClient {
            endpoint,
            token_provider: self.token_provider.ok_or_else(|| {
                ClientError::Configuration("token provider is required".into())
            })?,
            http: self.http,
        })
    }
}

pub struct CliptownClient {
    endpoint: String,
    token_provider: Arc<dyn AccessTokenProvider>,
    http: reqwest::Client,
}

impl CliptownClient {
    async fn request(
        &self,
        method: reqwest::Method,
        path: &str,
    ) -> Result<reqwest::RequestBuilder, ClientError> {
        let token = self.token_provider.access_token().await?;
        Ok(self
            .http
            .request(method, format!("{}{}", self.endpoint, path))
            .bearer_auth(token)
            .header("accept", "application/json"))
    }

    async fn decode<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, ClientError> {
        let status = response.status();
        if !status.is_success() {
            return Err(ClientError::Api {
                status: status.as_u16(),
                body: response.text().await.unwrap_or_default(),
            });
        }
        Ok(response.json().await?)
    }

    pub async fn list_clips(
        &self,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<ClipPage, ClientError> {
        if !(1..=500).contains(&limit) {
            return Err(ClientError::Configuration(
                "limit must be from 1 through 500".into(),
            ));
        }
        let mut request = self
            .request(reqwest::Method::GET, "/v1/clips")
            .await?
            .query(&[("limit", limit.to_string())]);
        if let Some(cursor) = cursor {
            request = request.query(&[("cursor", cursor)]);
        }
        self.decode(request.send().await?).await
    }

    pub async fn put_clip(
        &self,
        clip: &ClipEnvelope,
        idempotency_key: Option<&str>,
    ) -> Result<ClipEnvelope, ClientError> {
        clip.validate().map_err(ClientError::Configuration)?;
        let key = idempotency_key
            .map(str::to_owned)
            .unwrap_or_else(|| Uuid::now_v7().to_string());
        if !(16..=128).contains(&key.len()) {
            return Err(ClientError::Configuration(
                "idempotency key must contain from 16 through 128 characters".into(),
            ));
        }
        let response = self
            .request(
                reqwest::Method::PUT,
                &format!("/v1/clips/{}", clip.clip_id),
            )
            .await?
            .header("idempotency-key", key)
            .json(clip)
            .send()
            .await?;
        self.decode(response).await
    }

    pub async fn delete_clip(&self, clip_id: Uuid) -> Result<(), ClientError> {
        let response = self
            .request(
                reqwest::Method::DELETE,
                &format!("/v1/clips/{clip_id}"),
            )
            .await?
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(ClientError::Api {
                status: status.as_u16(),
                body: response.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }

    pub async fn search(&self, request: &SearchRequest) -> Result<ClipPage, ClientError> {
        let response = self
            .request(reqwest::Method::POST, "/v1/search")
            .await?
            .json(request)
            .send()
            .await?;
        self.decode(response).await
    }

    pub async fn push(&self, request: &PushRequest) -> Result<serde_json::Value, ClientError> {
        if request.mutations.len() > 500 {
            return Err(ClientError::Configuration(
                "a sync push may contain at most 500 mutations".into(),
            ));
        }
        let response = self
            .request(reqwest::Method::POST, "/v1/sync/push")
            .await?
            .json(request)
            .send()
            .await?;
        self.decode(response).await
    }

    pub async fn pull(&self, request: &PullRequest) -> Result<serde_json::Value, ClientError> {
        if !(1..=500).contains(&request.limit) {
            return Err(ClientError::Configuration(
                "limit must be from 1 through 500".into(),
            ));
        }
        let response = self
            .request(reqwest::Method::POST, "/v1/sync/pull")
            .await?
            .json(request)
            .send()
            .await?;
        self.decode(response).await
    }
}
