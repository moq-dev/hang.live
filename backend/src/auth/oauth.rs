use oauth2::{
	basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
	TokenResponse, TokenUrl,
};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{config::Config, db, Error, Result};

#[derive(Debug, Clone)]
pub enum OAuthProvider {
	Google,
	// Github,
	// Discord,
	// Microsoft,
	// Facebook,
	// Twitter,
}

impl OAuthProvider {
	pub fn from_str(s: &str) -> Option<Self> {
		match s.to_lowercase().as_str() {
			"google" => Some(Self::Google),
			// "github" => Some(Self::Github),
			_ => None,
		}
	}

	pub fn as_str(&self) -> &'static str {
		match self {
			Self::Google => "google",
			// Self::Github => "github",
		}
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthUser {
	pub provider: String,
	pub provider_id: String,
	pub email: String,
	pub name: String,
	pub avatar_url: Option<String>,
}

#[derive(Clone)]
pub struct OAuthService {
	google_client: Option<BasicClient>,
	http_client: HttpClient,
	// Store OAuth states in memory for simplicity
	// In production, you'd want to use Redis or a database
	oauth_states: std::sync::Arc<std::sync::Mutex<HashMap<String, String>>>,
}

impl OAuthService {
	pub fn new(config: &Config) -> Result<Self> {
		let google_client = if !config.google_client_id.is_empty() && !config.google_client_secret.is_empty() {
			let google_client_id = ClientId::new(config.google_client_id.clone());
			let google_client_secret = ClientSecret::new(config.google_client_secret.clone());
			let auth_url = AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
				.map_err(|_| Error::Auth("Invalid authorization endpoint URL".to_string()))?;
			let token_url = TokenUrl::new("https://www.googleapis.com/oauth2/v4/token".to_string())
				.map_err(|_| Error::Auth("Invalid token endpoint URL".to_string()))?;

			// Build redirect URL from base_url
			let redirect_url = format!("{}/auth/google/callback", config.base_url);
			let redirect_url =
				RedirectUrl::new(redirect_url).map_err(|_| Error::Auth("Invalid redirect URL".to_string()))?;

			let client = BasicClient::new(google_client_id)
				.set_client_secret(google_client_secret)
				.set_auth_uri(auth_url)
				.set_token_uri(token_url)
				.set_redirect_uri(redirect_url);

			Some(client)
		} else {
			None
		};

		Ok(Self {
			google_client,
			http_client: HttpClient::new(),
			oauth_states: std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())),
		})
	}

	pub fn get_auth_url(&self, provider: OAuthProvider) -> Result<String> {
		match provider {
			OAuthProvider::Google => {
				let client = self
					.google_client
					.as_ref()
					.ok_or_else(|| Error::Auth("Google OAuth not configured".to_string()))?;

				let (auth_url, csrf_token) = client
					.authorize_url(CsrfToken::new_random)
					.add_scope(Scope::new("openid".to_string()))
					.add_scope(Scope::new("email".to_string()))
					.add_scope(Scope::new("profile".to_string()))
					.url();

				// Store CSRF token for validation
				{
					let mut states = self.oauth_states.lock().unwrap();
					states.insert(csrf_token.secret().clone(), "google".to_string());
				}

				Ok(auth_url.to_string())
			}
		}
	}

	pub async fn exchange_code(&self, provider: OAuthProvider, code: &str, state: &str) -> Result<String> {
		match provider {
			OAuthProvider::Google => {
				let client = self
					.google_client
					.as_ref()
					.ok_or_else(|| Error::Auth("Google OAuth not configured".to_string()))?;

				// Validate CSRF token
				{
					let mut states = self.oauth_states.lock().unwrap();
					if states.remove(state).is_none() {
						return Err(Error::Auth("Invalid or expired OAuth state".to_string()));
					}
				}

				let token_result = client
					.exchange_code(AuthorizationCode::new(code.to_string()))
					.request_async(&self.http_client)
					.await
					.map_err(|e| Error::Auth(format!("Failed to exchange code for token: {}", e)))?;

				Ok(token_result.access_token().secret().clone())
			}
		}
	}

	pub async fn get_user_info(&self, provider: OAuthProvider, access_token: &str) -> Result<OAuthUser> {
		match provider {
			OAuthProvider::Google => {
				let user_info_url = format!(
					"https://www.googleapis.com/oauth2/v2/userinfo?access_token={}",
					access_token
				);

				let response = self
					.http_client
					.get(&user_info_url)
					.send()
					.await
					.map_err(|e| Error::Auth(format!("Failed to get user info: {}", e)))?;

				if !response.status().is_success() {
					return Err(Error::Auth(format!(
						"Failed to get user info: HTTP {}",
						response.status()
					)));
				}

				let user_info: GoogleUserInfo = response
					.json()
					.await
					.map_err(|e| Error::Auth(format!("Failed to parse user info: {}", e)))?;

				Ok(OAuthUser {
					provider: "google".to_string(),
					provider_id: user_info.id,
					email: user_info.email,
					name: user_info.name,
					avatar_url: user_info.picture,
				})
			}
		}
	}

	pub async fn authenticate_or_create_user(&self, pool: &sqlx::PgPool, oauth_user: &OAuthUser) -> Result<User> {
		// Try to find by provider ID first
		let user = if oauth_user.provider == "google" {
			User::find_by_google_id(pool, &oauth_user.provider_id).await?
		} else {
			None // TODO: Add other providers
		};

		if let Some(user) = user {
			return Ok(user);
		}

		// If not found by provider ID, try to find by email and link the account
		if let Some(mut user) = User::find_by_email(pool, &oauth_user.email).await? {
			// Link the OAuth account to existing user
			match oauth_user.provider.as_str() {
				"google" => {
					sqlx::query!(
						"UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2",
						oauth_user.provider_id,
						user.id
					)
					.execute(pool)
					.await?;
					user.google_id = Some(oauth_user.provider_id.clone());
				}
				_ => return Err(Error::Auth("Unsupported OAuth provider for linking".to_string())),
			}
			return Ok(user);
		}

		// User doesn't exist, create new user
		let google_id = if oauth_user.provider == "google" {
			Some(oauth_user.provider_id.clone())
		} else {
			None
		};

		User::create(pool, &oauth_user.email, &oauth_user.name, google_id.as_deref()).await
	}
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleUserInfo {
	pub id: String,
	pub email: String,
	pub name: String,
	pub picture: Option<String>,
}
