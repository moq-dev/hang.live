use axum::{extract::State, response::Json, routing::get, Router};
use validator::Validate;

use crate::{
	auth, db,
	types::{UpdateUserRequest, UserResponse},
	AppState, Result,
};

pub fn router() -> Router<AppState> {
	Router::new().route("/user/me", get(get_current_user).patch(update_current_user))
}

async fn get_current_user(State(state): State<AppState>, user: auth::User) -> Result<Json<UserResponse>> {
	let user = db::User::find_by_id(&state.db, user.id).await?;

	let response = UserResponse {
		id: user.id,
		email: user.email,
		name: user.name,
		avatar_url: user.avatar_url,
		created_at: user.created_at.to_rfc3339(),
	};

	Ok(Json(response))
}

// This handler REQUIRES authentication via JWT extractor
async fn update_current_user(
	State(state): State<AppState>,
	user: auth::User,
	Json(update_request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>> {
	// Validate request
	update_request.validate()?;

	let mut user = db::User::find_by_id(&state.db, user.id).await?;

	// Update user if name is provided
	if let Some(name) = &update_request.name {
		user = sqlx::query_as!(
			db::User,
			"UPDATE users SET name = $1 WHERE id = $2 RETURNING *",
			name,
			user.id
		)
		.fetch_one(&state.db)
		.await?;
	}

	let response = UserResponse {
		id: user.id,
		email: user.email,
		name: user.name,
		avatar_url: user.avatar_url,
		created_at: user.created_at.to_rfc3339(),
	};

	Ok(Json(response))
}
