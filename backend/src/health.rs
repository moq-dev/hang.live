use axum::{response::Json, routing::get, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::AppState;

pub fn router() -> Router<AppState> {
	Router::new().route("/health", get(health_check))
}

async fn health_check() -> Json<Health> {
	Json(Health {
		status: "ok".to_string(),
		timestamp: Utc::now().to_rfc3339(),
		version: env!("CARGO_PKG_VERSION").to_string(),
	})
}

#[derive(TS, Debug, Serialize, Deserialize)]
#[ts(export, export_to = "generated.ts")]
pub struct Health {
	pub status: String,
	pub timestamp: String,
	pub version: String,
}
