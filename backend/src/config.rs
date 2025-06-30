use std::env;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
	pub database_url: String,
	pub jwt_secret: String,
	pub google_client_id: String,
	pub google_client_secret: String,
	pub storage: StorageConfig,
	pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StorageConfig {
	Local {
		base_path: String,
	},
	S3 {
		bucket: String,
		region: String,
		access_key_id: Option<String>,
		secret_access_key: Option<String>,
		endpoint: Option<String>, // For local development with MinIO
	},
	Gcs {
		bucket: String,
		project_id: String,
	},
}

impl Config {
	pub fn from_env() -> Result<Self> {
		let storage = match env::var("STORAGE_TYPE").as_deref().unwrap_or("local") {
			"local" => StorageConfig::Local {
				base_path: env::var("STORAGE_LOCAL_PATH").unwrap_or_else(|_| "./uploads".to_string()),
			},
			"s3" => StorageConfig::S3 {
				bucket: env::var("STORAGE_S3_BUCKET")?,
				region: env::var("STORAGE_S3_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
				access_key_id: env::var("AWS_ACCESS_KEY_ID").ok(),
				secret_access_key: env::var("AWS_SECRET_ACCESS_KEY").ok(),
				endpoint: env::var("STORAGE_S3_ENDPOINT").ok(),
			},
			"gcs" => StorageConfig::Gcs {
				bucket: env::var("STORAGE_GCS_BUCKET")?,
				project_id: env::var("STORAGE_GCS_PROJECT_ID")?,
			},
			other => anyhow::bail!("Unknown storage type: {}", other),
		};

		Ok(Config {
			database_url: env::var("DATABASE_URL")?,
			jwt_secret: env::var("JWT_SECRET")?,
			google_client_id: env::var("GOOGLE_CLIENT_ID")?,
			google_client_secret: env::var("GOOGLE_CLIENT_SECRET")?,
			base_url: env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3001".to_string()),
			storage,
		})
	}
}
