use axum::{extract::State, response::Json, routing::get, Router};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use url::Url;
use uuid::Uuid;
use validator::Validate;

use crate::{auth, db, AppState, Result};

pub fn router() -> Router<AppState> {
	Router::new().route("/account/info", get(get_account).post(update_account))
}

#[derive(TS, Debug, Serialize, Deserialize)]
#[ts(export, export_to = "generated.ts", optional_fields)]
pub struct AccountInfo {
	pub id: Uuid,
	pub name: String,
	pub avatar: Url,
}

impl AccountInfo {
	pub fn from_db(user: &db::User, state: &AppState) -> Result<Self> {
		// If the avatar starts with /uploads, then it's relative to the API URL.
		// If the avatar withs with /avatar, then it's relative to the frontend URL.
		// If the avatar is a full URL, then it's already correct.
		let avatar = if user.avatar.starts_with("/uploads") {
			state.config.api_url.join(&user.avatar)?
		} else if user.avatar.starts_with("/avatar") {
			state.config.frontend_url.join(&user.avatar)?
		} else {
			Url::parse(&user.avatar)?
		};

		Ok(Self {
			id: user.id,
			name: user.name.clone(),
			avatar,
		})
	}
}

#[derive(TS, Debug, Serialize, Deserialize, Validate)]
#[ts(export, export_to = "generated.ts", optional_fields)]
pub struct AccountUpdate {
	#[validate(length(min = 4, max = 100, message = "Name must be between 4 and 100 characters"))]
	pub name: Option<String>,
	pub avatar: Option<String>,
}

async fn get_account(State(state): State<AppState>, user: auth::Token) -> Result<Json<AccountInfo>> {
	let user = db::User::find_by_id(&state.db, user.id).await?;
	let response = AccountInfo::from_db(&user, &state)?;
	Ok(Json(response))
}

// This handler REQUIRES authentication via JWT extractor
async fn update_account(
	State(state): State<AppState>,
	user: auth::Token,
	Json(update): Json<AccountUpdate>,
) -> Result<Json<AccountInfo>> {
	// Validate request
	update.validate()?;

	// Validate avatar if provided - should be relative path or full URL
	if let Some(avatar) = &update.avatar {
		// Validate that the avatar is a relative path or full URL
		state.config.frontend_url.join(avatar)?;
	}

	// Update user with any provided fields (None fields are ignored using COALESCE)
	let user = sqlx::query_as!(
		db::User,
		r#"
		UPDATE users
		SET
			name = COALESCE($1, name),
			avatar = COALESCE($2, avatar),
			updated_at = NOW()
		WHERE id = $3
		RETURNING id, email, name, avatar, created_at, updated_at
		"#,
		update.name.as_deref(),
		update.avatar.as_deref(),
		user.id
	)
	.fetch_one(&state.db)
	.await?;

	let response = AccountInfo::from_db(&user, &state)?;

	Ok(Json(response))
}
