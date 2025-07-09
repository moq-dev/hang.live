use std::net::SocketAddr;

use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
	/// The address to access this API server.
	///
	/// This is needed in order to perform oauth redirects and currently, to serve uploaded avatars.
	/// TODO: Switch avatars over to a CDN backed by the storage provider.
	pub api_url: Url,

	/// The secret used to sign JWT tokens for API authentication.
	pub api_secret: String,

	/// Listen address for the API server.
	pub api_bind: SocketAddr,

	/// The address to access the frontend server.
	///
	/// This is needed to perform oauth redirects and currently, to serve static avatars.
	/// TODO: Take ownership of these static avatars, serving them from the same CDN as uploaded avatars.
	pub frontend_url: Url,

	/// The URL to the postgres database.
	pub database_url: String,

	/// The type of storage to use.
	pub storage_type: ConfigStorageType,
	pub storage_bucket: String,

	/// OAuth providers to use.
	pub openid_discord: Option<ConfigOpenID>,
	pub openid_google: Option<ConfigOpenID>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOpenID {
	pub client_id: String,
	pub client_secret: String,
	pub issuer_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigStorageType {
	Disk,
	//S3,
	Gcs,
}
