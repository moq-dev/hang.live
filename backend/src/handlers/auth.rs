use axum::{
	extract::{Path, Query, State},
	response::{Json, Redirect},
	routing::{get, post},
	Router,
};
use serde::{Deserialize, Serialize};

use crate::{
	auth::{Provider, User as AuthUser},
	types::UserResponse,
	AppState, Result,
};

pub fn router() -> Router<AppState> {
	Router::new()
		.route("/auth/{provider}", get(oauth_login))
		.route("/auth/{provider}/callback", get(oauth_callback))
		.route("/auth/logout", post(logout))
		.route("/auth/providers", get(get_providers))
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

#[derive(Serialize)]
struct ProvidersResponse {
	providers: Vec<ProviderInfo>,
}

#[derive(Serialize)]
struct ProviderInfo {
	name: String,
}

async fn oauth_login(Path(provider): Path<String>, State(state): State<AppState>) -> Result<Redirect> {
	let oauth_provider =
		Provider::from_str(&provider).ok_or_else(|| crate::Error::Auth(crate::auth::Error::Unauthorized))?;

	let auth_url = state.oauth.get_auth_url(oauth_provider)?;

	Ok(Redirect::to(&auth_url))
}

async fn oauth_callback(
	Path(provider): Path<String>,
	Query(params): Query<OAuthCallbackQuery>,
	State(state): State<AppState>,
) -> Result<Redirect> {
	let oauth_provider =
		Provider::from_str(&provider).ok_or_else(|| crate::Error::Auth(crate::auth::Error::Unauthorized))?;

	// Exchange authorization code for access token
	let access_token = state
		.oauth
		.exchange_code(oauth_provider.clone(), &params.code, &params.state)
		.await?;

	// Get user info from OAuth provider
	let oauth_user = state.oauth.get_user_info(oauth_provider, &access_token).await?;

	// Authenticate or create user
	let user = state.oauth.authenticate_or_create_user(&state.db, &oauth_user).await?;

	// Create JWT token for auth
	let auth_user = AuthUser {
		id: user.id,
		expires_at: None,
		issued_at: None,
	};
	let jwt_token = state.auth.encode(&auth_user)?;

	let user_response = UserResponse {
		id: user.id,
		email: user.email,
		name: user.name,
		avatar_url: user.avatar_url,
		created_at: user.created_at.to_rfc3339(),
	};

	// Create redirect URL with token and user data as query parameters
	let mut redirect_url = state.config.oidc.frontend_url;

	// Serialize user data and URL-encode it
	let user_json = serde_json::to_string(&user_response)
		.map_err(|e| crate::Error::Config(anyhow::anyhow!("Failed to serialize user data: {}", e)))?;
	let encoded_user = urlencoding::encode(&user_json);

	redirect_url
		.query_pairs_mut()
		.append_pair("token", &jwt_token)
		.append_pair("user", &encoded_user);

	Ok(Redirect::to(redirect_url.as_str()))
}

async fn logout(_auth: AuthUser) -> Result<Json<LogoutResponse>> {
	// With JWT tokens, logout is handled client-side by removing the token
	// We could implement a token blacklist here if needed
	Ok(Json(LogoutResponse {
		message: "Logged out successfully.".to_string(),
	}))
}

async fn get_providers(State(state): State<AppState>) -> Result<Json<ProvidersResponse>> {
	let providers = state
		.oauth
		.get_available_providers()
		.into_iter()
		.map(|p| ProviderInfo { name: p.name })
		.collect();

	Ok(Json(ProvidersResponse { providers }))
}
