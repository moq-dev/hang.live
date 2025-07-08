use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use axum::http::request::Parts;
use axum_extra::{
	headers::{authorization::Bearer, Authorization},
	TypedHeader,
};

use crate::AppState;

use super::{Error, Result};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Token {
	#[serde(rename = "sub")]
	pub id: Uuid,

	#[serde(rename = "exp")]
	pub expires_at: Option<i64>,

	#[serde(rename = "iat")]
	pub issued_at: Option<i64>,
}

impl axum::extract::FromRequestParts<AppState> for Token {
	type Rejection = Error;

	async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self> {
		// Extract Authorization header
		let TypedHeader(Authorization(bearer)) = TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, state)
			.await
			.map_err(|_| Error::Unauthorized)?;

		state.auth.decode(bearer.token())
	}
}

impl axum::extract::OptionalFromRequestParts<AppState> for Token {
	type Rejection = Error;

	async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Option<Self>> {
		if let Some(TypedHeader(Authorization(bearer))) =
			TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, state)
				.await
				.map_err(|_| Error::Unauthorized)?
		{
			state.auth.decode(bearer.token()).map(Some)
		} else {
			Ok(None)
		}
	}
}

#[derive(Clone)]
pub struct UserService {
	encoding_key: EncodingKey,
	decoding_key: DecodingKey,
}

impl UserService {
	pub fn new(secret: &str) -> Self {
		Self {
			encoding_key: EncodingKey::from_secret(secret.as_bytes()),
			decoding_key: DecodingKey::from_secret(secret.as_bytes()),
		}
	}

	pub fn encode(&self, user: &Token) -> Result<String> {
		let header = jsonwebtoken::Header {
			alg: Algorithm::HS256,
			kid: None,
			..Default::default()
		};

		let token = jsonwebtoken::encode(&header, &user, &self.encoding_key)?;
		Ok(token)
	}

	pub fn decode(&self, token: &str) -> Result<Token> {
		let mut validation = jsonwebtoken::Validation::default();
		validation.validate_aud = false;
		validation.validate_exp = false;

		let token = jsonwebtoken::decode::<Token>(token, &self.decoding_key, &validation)?;
		Ok(token.claims)
	}
}
