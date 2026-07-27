use async_trait::async_trait;

use crate::ClientError;

#[async_trait]
pub trait AccessTokenProvider: Send + Sync {
    async fn access_token(&self) -> Result<String, ClientError>;
}

#[derive(Clone)]
pub struct StaticAccessToken(pub String);

#[async_trait]
impl AccessTokenProvider for StaticAccessToken {
    async fn access_token(&self) -> Result<String, ClientError> {
        Ok(self.0.clone())
    }
}
