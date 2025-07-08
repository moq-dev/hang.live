use axum::{
	extract::{Multipart, State},
	response::Json,
	routing::get,
	Router,
};
use rand::Rng;

use crate::{auth, db, AppState, Error, Result};

pub fn router() -> Router<AppState> {
	Router::new().route("/account/avatar", get(get_avatar).post(upload_avatar))
}

pub fn default_avatar() -> String {
	let index = rand::rng().random_range(0..50);
	return format!("/avatars/{}.svg", index);
}

async fn upload_avatar(
	State(state): State<AppState>,
	user: auth::Token,
	mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
	// Get current user to check for existing avatar
	let user = db::User::find_by_id(&state.db, user.id).await?;

	// Process multipart form data
	while let Some(field) = multipart.next_field().await? {
		let name = field.name().unwrap_or("");
		if name != "avatar" {
			continue;
		}

		let _filename = field.file_name().map(|s| s.to_string());
		let content_type = field
			.content_type()
			.map(|s| s.to_string())
			.unwrap_or_else(|| "image/jpeg".to_string());
		let data = field.bytes().await?;

		// Validate file type
		if !["image/jpeg", "image/png", "image/gif", "image/webp"].contains(&content_type.as_str()) {
			return Err(Error::Forbidden(
				"Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.".to_string(),
			));
		}

		// Validate file size (max 5MB)
		if data.len() > 5 * 1024 * 1024 {
			return Err(Error::Forbidden(
				"File size too large. Maximum 5MB allowed.".to_string(),
			));
		}

		// For local storage, extract path from URL
		if user.avatar.starts_with("/uploads/") {
			let _ = state.storage.delete_file(&user.avatar).await; // Ignore errors for old file deletion
		}

		// Determine file extension
		let extension = match content_type.as_str() {
			"image/jpeg" => "jpg",
			"image/png" => "png",
			"image/gif" => "gif",
			"image/webp" => "webp",
			_ => "jpg",
		};

		// Upload file using the storage provider's method
		let upload = state
			.storage
			.upload_file(data.to_vec(), &content_type, extension)
			.await?;

		// Update user's avatar URL in database
		sqlx::query!(
			"UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2",
			upload,
			user.id
		)
		.execute(&state.db)
		.await?;

		return Ok(Json(serde_json::json!({
			"avatar": upload,
			"message": "Avatar uploaded successfully"
		})));
	}

	Err(Error::NotFound("No avatar file found in request".to_string()))
}

async fn get_avatar(State(state): State<AppState>, user: auth::Token) -> Result<Json<serde_json::Value>> {
	let user = db::User::find_by_id(&state.db, user.id).await?;

	Ok(Json(serde_json::json!({
		"avatar": user.avatar,
	})))
}
