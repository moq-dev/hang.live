use axum::{
	extract::{Query, State},
	response::{Json, Redirect},
	routing::{get, post},
	Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{
	auth::{JwtAuth, OAuthProvider, OAuthService, TokenService, UserService},
	types::{AuthResponse, UserResponse},
	AppState, Result,
};

pub fn router() -> Router<AppState> {
	Router::new()
		.route("/auth/:provider", get(oauth_login))
		.route("/auth/:provider/callback", get(oauth_callback))
		.route("/auth/logout", post(logout))
}

#[derive(Deserialize)]
struct OAuthLoginPath {
	provider: String,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
	code: String,
	state: String,
}

#[derive(Serialize)]
struct LogoutResponse {
	message: String,
}

async fn oauth_login(
	axum::extract::Path(OAuthLoginPath { provider }): axum::extract::Path<OAuthLoginPath>,
	State(state): State<AppState>,
) -> Result<Redirect> {
	let oauth_provider = OAuthProvider::from_str(&provider)
		.ok_or_else(|| crate::Error::Auth(format!("Unsupported OAuth provider: {}", provider)))?;

	let auth_url = oauth_service.get_auth_url(oauth_provider).await?;

	Ok(Redirect::to(&auth_url))
}

async fn oauth_callback(
	axum::extract::Path(OAuthLoginPath { provider }): axum::extract::Path<OAuthLoginPath>,
	Query(params): Query<OAuthCallbackQuery>,
	State(state): State<AppState>,
) -> Result<Json<AuthResponse>> {
	let oauth_provider = OAuthProvider::from_str(&provider)
		.ok_or_else(|| crate::Error::Auth(format!("Unsupported OAuth provider: {}", provider)))?;

	// Exchange authorization code for access token
	let access_token =
		.exchange_code(oauth_provider.clone(), &params.code, &params.state)
		.await?;

	// Get user info from OAuth provider
	let oauth_user = oauth_service.get_user_info(oauth_provider, &access_token).await?;

	// Authenticate or create user
	let user = oauth_service.authenticate_or_create_user(&pool, &oauth_user).await?;

	// Create JWT token
	let token_service = TokenService::new(&config.jwt_secret);
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

async fn logout(_auth: JwtAuth) -> Result<Json<LogoutResponse>> {
	// With JWT tokens, logout is handled client-side by removing the token
	// We could implement a token blacklist here if needed
	Ok(Json(LogoutResponse {
		message: "Logged out successfully. Please remove the token from your client.".to_string(),
	}))
}
