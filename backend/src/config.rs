use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
	pub database_url: String,
	pub jwt_secret: String,
	pub google_client_id: String,
	pub google_client_secret: String,
	pub storage: StorageConfig,
	pub base_url: String,

	#[serde(default = "default_port")]
	pub port: u16,
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
	pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
		let config = toml_env::initialize::<Config>(toml_env::Args {
			config_path: Some(path.as_ref()),
			..Default::default()
		})
		.context("failed to load config file")?
		.context("no config file found")?;

		Ok(config)
	}
}

fn default_port() -> u16 {
	3000
}
