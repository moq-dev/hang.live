use axum::{
    extract::{Query, State},
    response::{Json, Redirect},
    routing::{get, post},
    Router,
};
use sqlx::PgPool;

use crate::{
    auth::{GoogleOAuth, TokenService},
    config::Config,
    db::models::User,
    storage::StorageProvider,
    types::{AuthResponse, GoogleCallbackQuery, UserResponse},
    AppError, Result,
};

type AppState = (PgPool, StorageProvider, Config);

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/google", get(google_auth))
        .route("/auth/google/callback", get(google_callback))
}

async fn google_auth(State((_, _, config)): State<AppState>) -> Result<Redirect> {
    let oauth = GoogleOAuth::new(&config)?;
    let (auth_url, _csrf_token) = oauth.get_auth_url();

    // TODO: Store CSRF token in session/cookie for validation
    // For now, we'll skip CSRF validation for simplicity

    Ok(Redirect::to(&auth_url))
}

async fn google_callback(
    State((pool, _, config)): State<AppState>,
    Query(params): Query<GoogleCallbackQuery>,
) -> Result<Json<AuthResponse>> {
    let oauth = GoogleOAuth::new(&config)?;
    let token_service = TokenService::new(&config.jwt_secret);

    // Exchange authorization code for access token
    let access_token = oauth.exchange_code(&params.code).await?;

    // Get user info from Google
    let google_user = oauth.get_user_info(&access_token).await?;

    // Find or create user
    let user = match User::find_by_google_id(&pool, &google_user.id).await? {
        Some(user) => user,
        None => {
            // Check if user exists with same email
            match User::find_by_email(&pool, &google_user.email).await? {
                Some(mut user) => {
                    // Link Google account to existing user
                    sqlx::query!(
                        "UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2",
                        google_user.id,
                        user.id
                    )
                    .execute(&pool)
                    .await?;

                    user.google_id = Some(google_user.id);
                    user
                }
                None => {
                    // Create new user
                    User::create(&pool, &google_user.email, &google_user.name, Some(&google_user.id)).await?
                }
            }
        }
    };

    // Create JWT token
    let jwt_token = token_service.create_user_token(user.id, &user.email, &user.name, 24 * 7)?; // 1 week

    let response = AuthResponse {
        user: UserResponse {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            created_at: user.created_at.to_rfc3339(),
        },
        token: jwt_token,
    };

    Ok(Json(response))
}
