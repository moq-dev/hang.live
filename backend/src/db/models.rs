use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
	pub id: Uuid,
	pub email: String,
	pub name: String,
	pub avatar_url: Option<String>,
	pub google_id: Option<String>,
	pub created_at: DateTime<Utc>,
	pub updated_at: DateTime<Utc>,
}

impl User {
	pub async fn create(pool: &PgPool, email: &str, name: &str) -> Result<Self> {
		let user = sqlx::query_as!(
			User,
			r#"
            INSERT INTO users (email, name)
            VALUES ($1, $2)
            RETURNING *
            "#,
			email,
			name,
		)
		.fetch_one(pool)
		.await?;

		Ok(user)
	}

	pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Self> {
		sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", id)
			.fetch_optional(pool)
			.await?
			.ok_or(Error::UnknownUser)
	}

	pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>> {
		let user = sqlx::query_as!(User, "SELECT * FROM users WHERE email = $1", email)
			.fetch_optional(pool)
			.await?;

		Ok(user)
	}

	pub async fn find_by_google_id(pool: &PgPool, google_id: &str) -> Result<Option<Self>> {
		let user = sqlx::query_as!(User, "SELECT * FROM users WHERE google_id = $1", google_id)
			.fetch_optional(pool)
			.await?;

		Ok(user)
	}

	pub async fn update_avatar_url(pool: &PgPool, id: Uuid, avatar_url: &str) -> Result<()> {
		sqlx::query!(
			"UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
			avatar_url,
			id
		)
		.execute(pool)
		.await?;

		Ok(())
	}
}
