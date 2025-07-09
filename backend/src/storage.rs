use std::sync::Arc;

use object_store::{gcp::GoogleCloudStorageBuilder, local::LocalFileSystem, path::Path as ObjectPath, ObjectStore};
use tokio::fs;
use uuid::Uuid;

use crate::{
	config::{Config, ConfigStorageType},
	Error, Result,
};

#[derive(Clone)]
pub struct StorageProvider {
	store: Arc<dyn ObjectStore>,
	base_url: String,
}

impl StorageProvider {
	pub async fn new(config: &Config) -> Result<Self> {
		match &config.storage_type {
			ConfigStorageType::Disk => {
				// Ensure the directory exists
				fs::create_dir_all(&config.storage_bucket)
					.await
					.map_err(|e| Error::Storage(format!("Failed to create storage directory: {e}")))?;

				let store: Arc<dyn ObjectStore> = Arc::new(LocalFileSystem::new_with_prefix(&config.storage_bucket)?);

				Ok(StorageProvider {
					store,
					base_url: "/uploads/".to_string(),
				})
			}
			/*
			ConfigStorage::S3 {
				bucket,
				region,
				access_key_id,
				secret_access_key,
				endpoint,
			} => {
				let mut builder = AmazonS3Builder::new().with_bucket_name(bucket).with_region(region);

				// Use custom credentials if provided
				if let (Some(access_key), Some(secret_key)) = (access_key_id, secret_access_key) {
					builder = builder
						.with_access_key_id(access_key)
						.with_secret_access_key(secret_key);
				}

				// Use custom endpoint if provided (for MinIO, LocalStack, etc.)
				if let Some(endpoint_url) = endpoint {
					builder = builder.with_endpoint(endpoint_url).with_allow_http(true);
				}

				let store: Arc<dyn ObjectStore> = Arc::new(
					builder
						.build()
						.map_err(|e| Error::Storage(format!("Failed to create S3 client: {e}")))?,
				);

				let base_url = if let Some(endpoint) = endpoint {
					// For custom endpoints (like MinIO), construct URL manually
					format!("{}/{}", endpoint.trim_end_matches('/'), bucket)
				} else {
					// Standard S3 URL format
					format!("https://{bucket}.s3.{region}.amazonaws.com")
				};

				Ok(StorageProvider { store, base_url })
			}
			*/
			ConfigStorageType::Gcs => {
				let store: Arc<dyn ObjectStore> = Arc::new(
					GoogleCloudStorageBuilder::new()
						.with_bucket_name(&config.storage_bucket)
						.build()?,
				);

				let base_url = format!("https://storage.googleapis.com/{}", config.storage_bucket);

				Ok(StorageProvider { store, base_url })
			}
		}
	}

	pub async fn upload_file(&self, data: Vec<u8>, extension: &str) -> Result<String> {
		let filename = format!("{}.{}", Uuid::new_v4(), extension);
		let path = ObjectPath::from(filename.clone());

		tracing::info!(?filename, ?path, ?self.base_url, "Uploading file");

		self.store.put(&path, data.into()).await?;

		let url = format!("{}/{}", self.base_url, filename);
		Ok(url)
	}

	pub async fn delete_file(&self, url: &str) -> Result<()> {
		let name = url
			.strip_prefix(&self.base_url)
			.ok_or(Error::Storage("Invalid file URL".to_string()))?;

		let path = ObjectPath::from(name);

		tracing::info!(?name, ?path, ?self.base_url, "Deleting file");

		self.store
			.delete(&path)
			.await
			.map_err(|e| Error::Storage(format!("Failed to delete file: {e}")))?;

		Ok(())
	}
}
