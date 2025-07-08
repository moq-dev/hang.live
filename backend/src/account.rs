use axum::{extract::State, response::Json, routing::get, Router};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;
use validator::Validate;

use crate::{auth, db, AppState, Result};

pub fn router() -> Router<AppState> {
	Router::new().route("/account/info", get(get_account).patch(update_account))
}

#[derive(TS, Debug, Serialize, Deserialize)]
#[ts(export, export_to = "generated.ts", optional_fields)]
pub struct AccountInfo {
	pub id: Uuid,
	pub name: String,
	pub avatar: Option<String>,
}

#[derive(TS, Debug, Serialize, Deserialize, Validate)]
#[ts(export, export_to = "generated.ts", optional_fields)]
pub struct AccountUpdate {
	#[validate(length(min = 4, max = 100, message = "Name must be between 4 and 100 characters"))]
	pub name: Option<String>,
}

async fn get_account(State(state): State<AppState>, user: auth::Token) -> Result<Json<AccountInfo>> {
	let user = db::User::find_by_id(&state.db, user.id).await?;

	let response = AccountInfo {
		id: user.id,
		name: user.name,
		avatar: user.avatar_url,
	};

	Ok(Json(response))
}

// This handler REQUIRES authentication via JWT extractor
async fn update_account(
	State(state): State<AppState>,
	user: auth::Token,
	Json(update_request): Json<AccountUpdate>,
) -> Result<Json<AccountInfo>> {
	// Validate request
	update_request.validate()?;

	let mut user = db::User::find_by_id(&state.db, user.id).await?;

	// Update user if name is provided
	if let Some(name) = &update_request.name {
		user = sqlx::query_as!(
			db::User,
			"UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
			name,
			user.id
		)
		.fetch_one(&state.db)
		.await?;
	}

	let response = AccountInfo {
		id: user.id,
		name: user.name,
		avatar: user.avatar_url,
	};

	Ok(Json(response))
}
