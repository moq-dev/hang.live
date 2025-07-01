use axum::{
	http::StatusCode,
	response::{IntoResponse, Response},
};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
	#[error("Unauthorized")]
	Unauthorized,

	#[error("Invalid token")]
	InvalidToken,

	#[error("Token expired")]
	Expired,

	#[error("JWT error: {0}")]
	Jwt(#[from] jsonwebtoken::errors::Error),
}

impl IntoResponse for Error {
	fn into_response(self) -> Response {
		(StatusCode::UNAUTHORIZED, self.to_string()).into_response()
	}
}
