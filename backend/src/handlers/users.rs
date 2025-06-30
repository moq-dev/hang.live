use axum::{
    extract::{Path, Request, State},
    response::Json,
    routing::{get, patch},
    Router,
};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    config::Config,
    db::models::User,
    middleware::ClaimsExt,
    storage::StorageProvider,
    types::{UpdateUserRequest, UserResponse},
    AppError, Result,
};

type AppState = (PgPool, StorageProvider, Config);

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users/me", get(get_current_user).patch(update_current_user))
        .route("/users/:id", get(get_user))
}

async fn get_current_user(
    State((pool, _, _)): State<AppState>,
    request: Request,
) -> Result<Json<UserResponse>> {
    let user_id = request.user_id()?;

    let user = User::find_by_id(&pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let response = UserResponse {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at.to_rfc3339(),
    };

    Ok(Json(response))
}

async fn update_current_user(
    State((pool, _, _)): State<AppState>,
    request: Request,
    Json(update_request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>> {
    let user_id = request.user_id()?;

    // Validate request
    update_request.validate()
        .map_err(|e| AppError::Validation(format!("Validation error: {}", e)))?;

    // Update user if name is provided
    if let Some(name) = &update_request.name {
        sqlx::query!(
            "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
            name,
            user_id
        )
        .execute(&pool)
        .await?;
    }

    // Fetch updated user
    let user = User::find_by_id(&pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let response = UserResponse {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at.to_rfc3339(),
    };

    Ok(Json(response))
}

async fn get_user(
    State((pool, _, _)): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<UserResponse>> {
    let user = User::find_by_id(&pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let response = UserResponse {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at.to_rfc3339(),
    };

    Ok(Json(response))
}
