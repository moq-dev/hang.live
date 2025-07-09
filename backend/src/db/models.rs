use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{auth::OAuthUser, avatars::default_avatar, Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
	pub id: Uuid,
	pub email: String,
	pub name: String,
	pub avatar: String,
	pub created_at: DateTime<Utc>,
	pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserOAuthProvider {
	pub user_id: Uuid,
	pub provider_name: String,
	pub provider_user_id: String,
	pub linked_at: DateTime<Utc>,
	pub updated_at: DateTime<Utc>,
}

impl User {
	pub async fn create(pool: &PgPool, email: &str, name: &str) -> Result<Self> {
		let user = sqlx::query_as!(
			User,
			r#"
            INSERT INTO users (email, name)
            VALUES ($1, $2)
            RETURNING id, email, name, avatar, created_at, updated_at
            "#,
			email,
			name,
		)
		.fetch_one(pool)
		.await?;

		Ok(user)
	}

	pub async fn create_with_provider(pool: &PgPool, info: &OAuthUser) -> Result<Self> {
		let mut tx = pool.begin().await?;

		let avatar = info.avatar.clone().unwrap_or_else(default_avatar);

		// Create user
		let user = sqlx::query_as!(
			User,
			r#"
			INSERT INTO users (email, name, avatar)
			VALUES ($1, $2, $3)
			RETURNING id, email, name, avatar, created_at, updated_at
			"#,
			info.email,
			info.name,
			avatar,
		)
		.fetch_one(&mut *tx)
		.await?;

		// Link OAuth provider
		sqlx::query!(
			r#"
			INSERT INTO user_oauth_providers (user_id, provider_name, provider_user_id)
			VALUES ($1, $2, $3)
			"#,
			user.id,
			info.provider,
			info.provider_id,
		)
		.execute(&mut *tx)
		.await?;

		tx.commit().await?;
		Ok(user)
	}

	pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Self> {
		sqlx::query_as!(
			User,
			"SELECT id, email, name, avatar, created_at, updated_at FROM users WHERE id = $1",
			id
		)
		.fetch_optional(pool)
		.await?
		.ok_or(Error::UnknownUser)
	}

	pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>> {
		let user = sqlx::query_as!(
			User,
			"SELECT id, email, name, avatar, created_at, updated_at FROM users WHERE email = $1",
			email
		)
		.fetch_optional(pool)
		.await?;

		Ok(user)
	}

	pub async fn find_by_provider_id(pool: &PgPool, provider: &str, provider_id: &str) -> Result<Option<Self>> {
		let user = sqlx::query_as!(
			User,
			r#"
			SELECT u.id, u.email, u.name, u.avatar, u.created_at, u.updated_at FROM users u
			JOIN user_oauth_providers uop ON u.id = uop.user_id
			WHERE uop.provider_name = $1 AND uop.provider_user_id = $2
			"#,
			provider,
			provider_id,
		)
		.fetch_optional(pool)
		.await?;

		Ok(user)
	}

	pub async fn link_provider(pool: &PgPool, user_id: Uuid, provider: &str, provider_id: &str) -> Result<()> {
		// Insert or update the OAuth provider link
		sqlx::query!(
			r#"
			INSERT INTO user_oauth_providers (user_id, provider_name, provider_user_id)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id, provider_name)
			DO UPDATE SET provider_user_id = $3, updated_at = NOW()
			"#,
			user_id,
			provider,
			provider_id,
		)
		.execute(pool)
		.await?;

		Ok(())
	}

	pub async fn update_avatar(pool: &PgPool, id: Uuid, avatar: &str) -> Result<()> {
		sqlx::query!(
			"UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2",
			avatar,
			id
		)
		.execute(pool)
		.await?;

		Ok(())
	}

	pub async fn get_oauth_providers(pool: &PgPool, user_id: Uuid) -> Result<Vec<UserOAuthProvider>> {
		let providers = sqlx::query_as!(
			UserOAuthProvider,
			"SELECT user_id, provider_name, provider_user_id, linked_at, updated_at FROM user_oauth_providers WHERE user_id = $1 ORDER BY linked_at",
			user_id
		)
		.fetch_all(pool)
		.await?;

		Ok(providers)
	}
}
