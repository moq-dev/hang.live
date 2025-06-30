use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppError, Result};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
	pub sub: String, // user_id
	pub email: String,
	pub name: String,
	pub exp: i64,
	pub iat: i64,
	pub room_id: Option<String>, // Optional for room-specific tokens
}

#[derive(Debug, Clone)]
pub struct TokenService {
	encoding_key: EncodingKey,
	decoding_key: DecodingKey,
}

impl TokenService {
	pub fn new(secret: &str) -> Self {
		Self {
			encoding_key: EncodingKey::from_secret(secret.as_bytes()),
			decoding_key: DecodingKey::from_secret(secret.as_bytes()),
		}
	}

	pub fn create_user_token(&self, user_id: Uuid, email: &str, name: &str, expires_in_hours: i64) -> Result<String> {
		let now = Utc::now();
		let exp = now + Duration::hours(expires_in_hours);

		let claims = Claims {
			sub: user_id.to_string(),
			email: email.to_string(),
			name: name.to_string(),
			exp: exp.timestamp(),
			iat: now.timestamp(),
			room_id: None,
		};

		let token = encode(&Header::default(), &claims, &self.encoding_key)?;
		Ok(token)
	}

	pub fn create_room_token(
		&self,
		user_id: Uuid,
		email: &str,
		name: &str,
		room_id: Uuid,
		expires_in_minutes: i64,
	) -> Result<String> {
		let now = Utc::now();
		let exp = now + Duration::minutes(expires_in_minutes);

		let claims = Claims {
			sub: user_id.to_string(),
			email: email.to_string(),
			name: name.to_string(),
			exp: exp.timestamp(),
			iat: now.timestamp(),
			room_id: Some(room_id.to_string()),
		};

		let token = encode(&Header::default(), &claims, &self.encoding_key)?;
		Ok(token)
	}

	pub fn verify_token(&self, token: &str) -> Result<Claims> {
		let mut validation = Validation::new(Algorithm::HS256);
		validation.set_audience(&["hang-api"]);
		validation.set_issuer(&["hang-api"]);

		// Remove audience and issuer validation for now to keep it simple
		validation.validate_aud = false;
		validation.validate_iss = false;

		let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
			.map_err(|e| AppError::Auth(format!("Invalid token: {}", e)))?;

		// Check if token is expired
		let now = Utc::now().timestamp();
		if token_data.claims.exp < now {
			return Err(AppError::Auth("Token expired".to_string()));
		}

		Ok(token_data.claims)
	}

	pub fn verify_room_token(&self, token: &str, expected_room_id: Uuid) -> Result<Claims> {
		let claims = self.verify_token(token)?;

		match &claims.room_id {
			Some(room_id) => {
				if room_id != &expected_room_id.to_string() {
					return Err(AppError::Auth("Invalid room token".to_string()));
				}
			}
			None => return Err(AppError::Auth("Not a room token".to_string())),
		}

		Ok(claims)
	}
}
