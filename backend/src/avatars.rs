use axum::{
	extract::{Multipart, State},
	routing::get,
	Json, Router,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use url::Url;

use crate::{account::AccountInfo, auth, db, AppState, Error, Result};

#[derive(TS, Serialize, Deserialize, Debug)]
#[ts(export, export_to = "generated.ts")]
pub struct AccountAvatar {
	pub url: Url,
}

pub fn router() -> Router<AppState> {
	Router::new().route("/account/avatar", get(get_avatar).post(upload_avatar))
}

pub fn default_avatar() -> String {
	let index = rand::rng().random_range(0..50);
	return format!("/avatar/{}.svg", index);
}

async fn upload_avatar(
	State(state): State<AppState>,
	user: auth::Token,
	mut multipart: Multipart,
) -> Result<Json<AccountAvatar>> {
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

		// Determine file extension
		let extension = match content_type.as_str() {
			"image/jpeg" => "jpg",
			"image/png" => "png",
			"image/gif" => "gif",
			"image/webp" => "webp",
			"image/svg+xml" => "svg",
			_ => {
				return Err(Error::Forbidden(
					"Invalid file type. Only JPEG, PNG, GIF, SVG, and WebP are allowed.".to_string(),
				))
			}
		};
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

		// Upload file using the storage provider's method
		let url = state.storage.upload_file(data.to_vec(), extension).await?;

		// Update user's avatar URL in database
		sqlx::query!(
			"UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2",
			url,
			user.id
		)
		.execute(&state.db)
		.await?;

		// Convert any relative URLs to an absolute URL
		let url = state.config.api_url.join(&url).unwrap();
		return Ok(Json(AccountAvatar { url }));
	}

	Err(Error::NotFound("No avatar file found in request".to_string()))
}

async fn get_avatar(State(state): State<AppState>, user: auth::Token) -> Result<Json<AccountAvatar>> {
	let user = db::User::find_by_id(&state.db, user.id).await?;
	let url = AccountInfo::from_db(&user, &state)?.avatar;
	Ok(Json(AccountAvatar { url }))
}
