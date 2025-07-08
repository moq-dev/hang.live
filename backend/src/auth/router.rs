use axum::{
	extract::{Path, Query, State},
	response::{Json, Redirect},
	routing::get,
	Router,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
	auth::{Provider, Token},
	AppState, Result,
};

pub fn router() -> Router<AppState> {
	Router::new()
		.route("/auth/{provider}", get(oauth_login))
		.route("/auth/{provider}/callback", get(oauth_callback))
		.route("/auth/providers", get(get_providers))
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
	code: String,
	state: String,
}

#[derive(TS, Debug, Serialize, Deserialize)]
#[ts(export, export_to = "generated.ts")]
struct AuthProviders {
	names: Vec<String>,
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

	let now = std::time::SystemTime::now();
	let expires_at = now + std::time::Duration::from_secs(60 * 60 * 24 * 365);

	// Create JWT token for auth
	let token = Token {
		id: user.id,
		expires_at,
		issued_at: now,
	};
	let jwt_token = state.auth.encode(&token)?;

	// Create redirect URL with token and user data as query parameters
	let mut redirect_url = state.config.oidc.frontend_url;

	redirect_url.query_pairs_mut().append_pair("token", &jwt_token);

	Ok(Redirect::to(redirect_url.as_str()))
}

async fn get_providers(State(state): State<AppState>) -> Result<Json<AuthProviders>> {
	let names = state
		.oauth
		.get_available_providers()
		.into_iter()
		.map(|p| p.name)
		.collect();

	Ok(Json(AuthProviders { names }))
}
