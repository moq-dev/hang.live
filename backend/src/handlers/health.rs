use axum::{response::Json, routing::get, Router};
use chrono::Utc;

use crate::{
	auth::{OAuthService, UserService},
	config::Config,
	storage::StorageProvider,
	types::HealthResponse,
};

pub fn router() -> Router<(sqlx::PgPool, StorageProvider, Config, OAuthService, UserService)> {
	Router::new().route("/health", get(health_check))
}

async fn health_check() -> Json<HealthResponse> {
	Json(HealthResponse {
		status: "ok".to_string(),
		timestamp: Utc::now().to_rfc3339(),
		version: env!("CARGO_PKG_VERSION").to_string(),
	})
}
