use axum::{
	http::StatusCode,
	response::{IntoResponse, Response},
};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
	#[error("db error: {0}")]
	Database(#[from] sqlx::Error),

	#[error("authentication error: {0}")]
	Auth(#[from] crate::auth::Error),

	#[error("Unauthorized")]
	Unauthorized,

	#[error("Not found: {0}")]
	NotFound(String),

	#[error("Unknown user")]
	UnknownUser,

	#[error("Forbidden: {0}")]
	Forbidden(String),

	#[error("Storage error: {0}")]
	Storage(String),

	#[error("External service error: {0}")]
	ExternalService(String),

	#[error("Configuration error: {0}")]
	Config(#[from] anyhow::Error),

	#[error("JSON error: {0}")]
	Json(#[from] serde_json::Error),

	#[error("HTTP error: {0}")]
	Http(#[from] reqwest::Error),

	#[error("JWT error: {0}")]
	Jwt(#[from] jsonwebtoken::errors::Error),

	#[error("Invalid UUID: {0}")]
	Uuid(#[from] uuid::Error),

	#[error("Validation error: {0}")]
	Validation(#[from] validator::ValidationErrors),

	#[error("Multipart error: {0}")]
	Multipart(#[from] axum::extract::multipart::MultipartError),

	#[error("URL error: {0}")]
	Url(#[from] url::ParseError),

	#[error("Object store error: {0}")]
	ObjectStore(#[from] object_store::Error),

	#[error("Internal server error")]
	Internal,
}

impl IntoResponse for Error {
	fn into_response(self) -> Response {
		tracing::warn!(?self, "returning error");
		match self {
			Error::Database(_) => {
				(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()).into_response()
			}
			Error::Auth(msg) => msg.into_response(),
			Error::Jwt(_) => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()).into_response(),
			Error::Validation(msg) => (StatusCode::BAD_REQUEST, msg.to_string()).into_response(),
			Error::NotFound(msg) => (StatusCode::NOT_FOUND, msg).into_response(),
			Error::Forbidden(msg) => (StatusCode::FORBIDDEN, msg).into_response(),
			Error::Storage(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Storage error".to_string()).into_response(),
			Error::ExternalService(_) => {
				(StatusCode::BAD_GATEWAY, "External service error".to_string()).into_response()
			}
			Error::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Configuration error".to_string()).into_response(),
			Error::Json(_) => (StatusCode::BAD_REQUEST, "Invalid JSON".to_string()).into_response(),
			Error::Http(_) => (StatusCode::INTERNAL_SERVER_ERROR, "HTTP error".to_string()).into_response(),
			Error::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()).into_response(),
			Error::Uuid(_) => (StatusCode::BAD_REQUEST, "Invalid UUID".to_string()).into_response(),
			Error::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()).into_response(),
			Error::UnknownUser => (StatusCode::NOT_FOUND, "Unknown user".to_string()).into_response(),
			Error::Multipart(_) => (StatusCode::BAD_REQUEST, "Invalid multipart data".to_string()).into_response(),
			Error::Url(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Invalid URL".to_string()).into_response(),
			Error::ObjectStore(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Storage error".to_string()).into_response(),
		}
	}
}
