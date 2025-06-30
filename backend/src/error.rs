use axum::{
	http::StatusCode,
	response::{IntoResponse, Response},
	Json,
};
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Error, Debug)]
pub enum AppError {
	#[error("Database error: {0}")]
	Database(#[from] sqlx::Error),

	#[error("Authentication error: {0}")]
	Auth(String),

	#[error("Validation error: {0}")]
	Validation(String),

	#[error("Not found: {0}")]
	NotFound(String),

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

	#[error("Internal server error")]
	Internal,
}

impl IntoResponse for AppError {
	fn into_response(self) -> Response {
		let (status, error_message) = match self {
			AppError::Database(err) => {
				tracing::error!("Database error: {:?}", err);
				(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
			}
			AppError::Auth(msg) => (StatusCode::UNAUTHORIZED, msg),
			AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg),
			AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
			AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
			AppError::Storage(msg) => {
				tracing::error!("Storage error: {}", msg);
				(StatusCode::INTERNAL_SERVER_ERROR, "Storage error".to_string())
			}
			AppError::ExternalService(msg) => {
				tracing::error!("External service error: {}", msg);
				(StatusCode::BAD_GATEWAY, "External service error".to_string())
			}
			AppError::Config(err) => {
				tracing::error!("Configuration error: {:?}", err);
				(StatusCode::INTERNAL_SERVER_ERROR, "Configuration error".to_string())
			}
			AppError::Json(err) => {
				tracing::error!("JSON error: {:?}", err);
				(StatusCode::BAD_REQUEST, "Invalid JSON".to_string())
			}
			AppError::Http(err) => {
				tracing::error!("HTTP error: {:?}", err);
				(StatusCode::INTERNAL_SERVER_ERROR, "HTTP error".to_string())
			}
			AppError::Jwt(err) => {
				tracing::error!("JWT error: {:?}", err);
				(StatusCode::UNAUTHORIZED, "Invalid token".to_string())
			}
			AppError::Internal => {
				tracing::error!("Internal server error");
				(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
			}
		};

		let body = Json(json!({
			"error": error_message,
		}));

		(status, body).into_response()
	}
}
