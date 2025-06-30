use axum::{
    extract::{Multipart, Request, State},
    response::Json,
    routing::{post, get},
    Router,
};
use sqlx::PgPool;

use crate::{
    config::Config,
    db::models::User,
    middleware::ClaimsExt,
    storage::StorageProvider,
    types::UploadUrlResponse,
    AppError, Result,
};

type AppState = (PgPool, StorageProvider, Config);

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/avatars/upload", post(upload_avatar))
        .route("/avatars/upload-url", get(get_upload_url))
}

async fn upload_avatar(
    State((pool, storage, _)): State<AppState>,
    request: Request,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    let user_id = request.user_id()?;

    // Get current user to check for existing avatar
    let user = User::find_by_id(&pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::Validation(format!("Invalid multipart data: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        if name == "avatar" {
            let content_type = field.content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            // Validate content type
            if !content_type.starts_with("image/") {
                return Err(AppError::Validation("File must be an image".to_string()));
            }

            let data = field.bytes().await.map_err(|e| {
                AppError::Validation(format!("Failed to read file data: {}", e))
            })?;

            // Validate file size (max 5MB)
            if data.len() > 5 * 1024 * 1024 {
                return Err(AppError::Validation("File size must be less than 5MB".to_string()));
            }

            // Determine file extension
            let extension = match content_type.as_str() {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/gif" => "gif",
                "image/webp" => "webp",
                _ => return Err(AppError::Validation("Unsupported image format".to_string())),
            };

            // Upload file
            let file_url = storage.upload_file(data.to_vec(), &content_type, extension).await?;

            // Delete old avatar if exists
            if let Some(old_avatar_url) = &user.avatar_url {
                let _ = storage.delete_file(old_avatar_url).await; // Don't fail if deletion fails
            }

            // Update user's avatar URL
            User::update_avatar_url(&pool, user_id, &file_url).await?;

            return Ok(Json(serde_json::json!({
                "message": "Avatar uploaded successfully",
                "avatar_url": file_url
            })));
        }
    }

    Err(AppError::Validation("No avatar file provided".to_string()))
}

async fn get_upload_url(
    State((_, storage, _)): State<AppState>,
    request: Request,
) -> Result<Json<UploadUrlResponse>> {
    let _user_id = request.user_id()?; // Ensure user is authenticated

    // For now, assume JPEG. In a real app, you might want to accept a query parameter
    let (upload_url, file_url) = storage
        .get_presigned_upload_url("image/jpeg", "jpg")
        .await?;

    let response = UploadUrlResponse {
        upload_url,
        file_url,
    };

    Ok(Json(response))
}
