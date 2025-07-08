use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey};
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, TimestampSeconds};
use uuid::Uuid;

use axum::{extract::FromRequestParts, http::request::Parts};
use axum_extra::{
	headers::{authorization::Bearer, Authorization},
	TypedHeader,
};

use crate::AppState;

use super::{Error, Result};

#[serde_as]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Token {
	#[serde(rename = "sub")]
	pub id: Uuid,

	#[serde_as(as = "TimestampSeconds")]
	#[serde(rename = "exp")]
	pub expires_at: std::time::SystemTime,

	#[serde_as(as = "TimestampSeconds")]
	#[serde(rename = "iat")]
	pub issued_at: std::time::SystemTime,
}

impl axum::extract::FromRequestParts<AppState> for Token {
	type Rejection = Error;

	async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self> {
		// Extract Authorization header
		let bearer = match TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, state).await {
			Ok(TypedHeader(Authorization(bearer))) => bearer,
			Err(err) => {
				tracing::warn!(?err, "failed to extract Authorization header");
				return Err(Error::Unauthorized);
			}
		};

		match state.auth.decode(bearer.token()) {
			Ok(token) => Ok(token),
			Err(err) => {
				tracing::warn!(?err, "failed to decode Authorization token");
				Err(Error::Unauthorized)
			}
		}
	}
}

impl axum::extract::OptionalFromRequestParts<AppState> for Token {
	type Rejection = Error;

	async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Option<Self>> {
		let bearer = match Option::<TypedHeader<Authorization<Bearer>>>::from_request_parts(parts, state).await {
			Ok(Some(TypedHeader(Authorization(bearer)))) => bearer,
			Ok(None) => return Ok(None),
			Err(err) => {
				tracing::warn!(?err, "failed to extract Authorization header");
				return Err(Error::Unauthorized);
			}
		};

		match state.auth.decode(bearer.token()) {
			Ok(token) => Ok(Some(token)),
			Err(err) => {
				tracing::warn!(?err, "failed to decode Authorization token");
				Err(Error::Unauthorized)
			}
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

	pub fn encode(&self, token: &Token) -> Result<String> {
		let header = jsonwebtoken::Header {
			alg: Algorithm::HS256,
			kid: None,
			..Default::default()
		};

		let token = jsonwebtoken::encode(&header, &token, &self.encoding_key)?;
		Ok(token)
	}

	pub fn decode(&self, token: &str) -> Result<Token> {
		let mut validation = jsonwebtoken::Validation::default();
		validation.required_spec_claims = Default::default();
		validation.validate_exp = false;

		let token = jsonwebtoken::decode::<Token>(token, &self.decoding_key, &validation)?;
		Ok(token.claims)
	}
}
