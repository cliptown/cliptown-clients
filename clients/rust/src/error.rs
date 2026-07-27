#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("authentication token unavailable: {0}")]
    Authentication(String),
    #[error("HTTP transport failed: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("server returned {status}: {body}")]
    Api { status: u16, body: String },
    #[error("invalid client configuration: {0}")]
    Configuration(String),
}
