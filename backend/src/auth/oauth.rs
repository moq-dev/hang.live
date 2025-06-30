use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
    TokenUrl,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::{config::Config, AppError, Result};

#[derive(Debug, Clone)]
pub struct GoogleOAuth {
    client: BasicClient,
    http_client: Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleUserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub verified_email: bool,
}

impl GoogleOAuth {
    pub fn new(config: &Config) -> Result<Self> {
        let google_client_id = ClientId::new(config.google_client_id.clone());
        let google_client_secret = ClientSecret::new(config.google_client_secret.clone());

        let auth_url = AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
            .map_err(|e| AppError::Config(anyhow::anyhow!("Invalid auth URL: {}", e)))?;

        let token_url = TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
            .map_err(|e| AppError::Config(anyhow::anyhow!("Invalid token URL: {}", e)))?;

        let redirect_url = RedirectUrl::new(format!("{}/auth/google/callback", config.base_url))
            .map_err(|e| AppError::Config(anyhow::anyhow!("Invalid redirect URL: {}", e)))?;

        let client = BasicClient::new(
            google_client_id,
            Some(google_client_secret),
            auth_url,
            Some(token_url),
        )
        .set_redirect_uri(redirect_url);

        Ok(Self {
            client,
            http_client: Client::new(),
        })
    }

    pub fn get_auth_url(&self) -> (String, CsrfToken) {
        let (auth_url, csrf_token) = self
            .client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("openid".to_string()))
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .url();

        (auth_url.to_string(), csrf_token)
    }

    pub async fn exchange_code(&self, code: &str) -> Result<String> {
        let token_result = self
            .client
            .exchange_code(oauth2::AuthorizationCode::new(code.to_string()))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| AppError::ExternalService(format!("Failed to exchange code: {}", e)))?;

        Ok(token_result.access_token().secret().clone())
    }

    pub async fn get_user_info(&self, access_token: &str) -> Result<GoogleUserInfo> {
        let response = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::ExternalService(format!(
                "Failed to get user info: {}",
                error_text
            )));
        }

        let user_info: GoogleUserInfo = response.json().await?;

        if !user_info.verified_email {
            return Err(AppError::Auth("Email not verified".to_string()));
        }

        Ok(user_info)
    }
}
