use openidconnect::{
	core::{CoreClient, CoreProviderMetadata, CoreResponseType, CoreUserInfoClaims},
	reqwest::async_http_client,
	AccessToken, AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
	OAuth2TokenResponse, RedirectUrl, Scope,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{auth::Error as AuthError, config::Config, db::User, Error, Result};

#[derive(Debug, Clone)]
pub struct Provider {
	pub name: String,
}

impl Provider {
	pub fn from_str(s: &str) -> Option<Self> {
		// This will now be dynamic based on configuration
		Some(Self { name: s.to_lowercase() })
	}

	pub fn as_str(&self) -> &str {
		&self.name
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
	clients: HashMap<String, CoreClient>,
	// Store OAuth states in memory for simplicity
	// In production, you'd want to use Redis or a database
	oauth_states: std::sync::Arc<std::sync::Mutex<HashMap<String, String>>>,
}

impl OAuthService {
	pub async fn new(config: &Config) -> Result<Self> {
		let mut clients = HashMap::new();

		for (provider_name, provider_config) in &config.oidc.providers {
			let issuer_url = IssuerUrl::new(provider_config.issuer_url.clone())
				.map_err(|e| Error::Config(anyhow::anyhow!("Invalid issuer URL for {}: {}", provider_name, e)))?;

			let provider_metadata = CoreProviderMetadata::discover_async(issuer_url, async_http_client)
				.await
				.map_err(|e| {
					Error::Config(anyhow::anyhow!(
						"Failed to discover OpenID metadata for {}: {}",
						provider_name,
						e
					))
				})?;

			let client_id = ClientId::new(provider_config.client_id.clone());
			let client_secret = ClientSecret::new(provider_config.client_secret.clone());

			let redirect_url = config.oidc.api_url.join(&format!("auth/{}/callback", provider_name))?;
			let redirect_url = RedirectUrl::new(redirect_url.to_string())
				.map_err(|e| Error::Config(anyhow::anyhow!("Invalid redirect URL for {}: {}", provider_name, e)))?;

			let client = CoreClient::from_provider_metadata(provider_metadata, client_id, Some(client_secret))
				.set_redirect_uri(redirect_url);

			clients.insert(provider_name.clone(), client);
		}

		Ok(Self {
			clients,
			oauth_states: std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())),
		})
	}

	pub fn get_auth_url(&self, provider: Provider) -> Result<String> {
		let client = self
			.clients
			.get(&provider.name)
			.ok_or_else(|| Error::Auth(AuthError::Unauthorized))?;

		let (auth_url, csrf_token, _nonce) = client
			.authorize_url(
				AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
				CsrfToken::new_random,
				Nonce::new_random,
			)
			.add_scope(Scope::new("openid".to_string()))
			.add_scope(Scope::new("email".to_string()))
			.add_scope(Scope::new("profile".to_string()))
			.url();

		// Store CSRF token for validation
		{
			let mut states = self.oauth_states.lock().unwrap();
			states.insert(csrf_token.secret().clone(), provider.name.clone());
		}

		Ok(auth_url.to_string())
	}

	pub async fn exchange_code(&self, provider: Provider, code: &str, state: &str) -> Result<String> {
		let client = self
			.clients
			.get(&provider.name)
			.ok_or_else(|| Error::Auth(AuthError::Unauthorized))?;

		// Validate CSRF token
		{
			let mut states = self.oauth_states.lock().unwrap();
			if states.remove(state).is_none() {
				return Err(Error::Auth(AuthError::Unauthorized));
			}
		}

		let token_result = client
			.exchange_code(AuthorizationCode::new(code.to_string()))
			.request_async(async_http_client)
			.await
			.map_err(|e| Error::ExternalService(format!("Failed to exchange code for token: {}", e)))?;

		Ok(token_result.access_token().secret().clone())
	}

	pub async fn get_user_info(&self, provider: Provider, access_token_str: &str) -> Result<OAuthUser> {
		let client = self
			.clients
			.get(&provider.name)
			.ok_or_else(|| Error::Auth(AuthError::Unauthorized))?;

		// Use the openidconnect client's user_info method
		let access_token = AccessToken::new(access_token_str.to_string());

		let userinfo_request = client
			.user_info(access_token, None)
			.map_err(|e| Error::ExternalService(format!("Failed to create userinfo request: {}", e)))?;

		let user_info_claims: CoreUserInfoClaims = userinfo_request
			.request_async(async_http_client)
			.await
			.map_err(|e| Error::ExternalService(format!("Failed to get user info: {}", e)))?;

		// Serialize the claims to JSON for easier field access
		let user_info: serde_json::Value = serde_json::to_value(&user_info_claims)
			.map_err(|e| Error::ExternalService(format!("Failed to serialize user info: {}", e)))?;

		// Extract user information in a provider-agnostic way
		let sub = user_info
			.get("sub")
			.and_then(|v| v.as_str())
			.ok_or_else(|| Error::ExternalService("Missing 'sub' field in user info".to_string()))?;

		let email = user_info
			.get("email")
			.and_then(|v| v.as_str())
			.ok_or_else(|| Error::ExternalService("Missing 'email' field in user info".to_string()))?;

		let name = user_info
			.get("name")
			.or_else(|| user_info.get("given_name"))
			.or_else(|| user_info.get("nickname"))
			.and_then(|v| v.as_str())
			.unwrap_or(email); // Fallback to email if no name

		let avatar_url = user_info
			.get("picture")
			.or_else(|| user_info.get("avatar_url"))
			.and_then(|v| v.as_str())
			.map(|s| s.to_string());

		Ok(OAuthUser {
			provider: provider.name,
			provider_id: sub.to_string(),
			email: email.to_string(),
			name: name.to_string(),
			avatar_url,
		})
	}

	pub async fn authenticate_or_create_user(&self, pool: &sqlx::PgPool, oauth_user: &OAuthUser) -> Result<User> {
		// Try to find by provider ID first
		let user = User::find_by_provider_id(pool, &oauth_user.provider, &oauth_user.provider_id).await?;

		if let Some(user) = user {
			return Ok(user);
		}

		// If not found by provider ID, try to find by email and link the account
		if let Some(user) = User::find_by_email(pool, &oauth_user.email).await? {
			// Link the OAuth account to existing user
			User::link_provider(pool, user.id, &oauth_user.provider, &oauth_user.provider_id).await?;

			// Reload user to get updated provider_ids
			let updated_user = User::find_by_id(pool, user.id).await?;
			return Ok(updated_user);
		}

		// User doesn't exist, create new user
		User::create_with_provider(
			pool,
			&oauth_user.email,
			&oauth_user.name,
			&oauth_user.provider,
			&oauth_user.provider_id,
		)
		.await
	}

	pub fn get_available_providers(&self) -> Vec<Provider> {
		self.clients
			.keys()
			.map(|name| Provider { name: name.clone() })
			.collect()
	}
}
