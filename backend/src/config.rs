use std::{collections::HashMap, path::Path};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
	/// The address to access this API server.
	pub api_url: Url,

	/// The address to access the frontend server.
	pub frontend_url: Url,

	pub database_url: String,
	pub jwt_secret: String,
	pub storage: StorageConfig,
	pub oidc: OidcConfig,
	pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcConfig {
	/// The OAuth providers to use.
	pub providers: HashMap<String, OidcProviderConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcProviderConfig {
	pub client_id: String,
	pub client_secret: String,
	pub issuer_url: String,
	pub scopes: Option<Vec<String>>,
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
	},
}

impl Config {
	pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
		// Load the TOML config file:
		let file = std::fs::read_to_string(path.as_ref())?;
		let config = toml::from_str(&file)?;
		Ok(config)
	}
}
