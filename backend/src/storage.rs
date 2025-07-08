use std::path::Path;

use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::{config::Builder as S3ConfigBuilder, Client as S3Client};
use tokio::fs;
use uuid::Uuid;

use crate::{
	config::{Config, StorageConfig},
	Error, Result,
};

#[derive(Debug, Clone)]
pub enum StorageProvider {
	Local { base_path: String },
	S3 { client: S3Client, bucket: String },
}

impl StorageProvider {
	pub async fn new(config: &Config) -> Result<Self> {
		match &config.storage {
			StorageConfig::Local { base_path } => {
				// Ensure the directory exists
				fs::create_dir_all(base_path)
					.await
					.map_err(|e| Error::Storage(format!("Failed to create storage directory: {}", e)))?;

				Ok(StorageProvider::Local {
					base_path: base_path.clone(),
				})
			}
			StorageConfig::S3 {
				bucket,
				region,
				access_key_id,
				secret_access_key,
				endpoint,
			} => {
				let mut aws_config =
					aws_config::defaults(BehaviorVersion::latest()).region(Region::new(region.clone()));

				// Use custom credentials if provided
				if let (Some(access_key), Some(secret_key)) = (access_key_id, secret_access_key) {
					aws_config = aws_config.credentials_provider(aws_sdk_s3::config::Credentials::new(
						access_key, secret_key, None, None, "hang-api",
					));
				}

				let aws_config = aws_config.load().await;

				let mut s3_config_builder = S3ConfigBuilder::from(&aws_config);

				// Use custom endpoint if provided (for MinIO, LocalStack, etc.)
				if let Some(endpoint_url) = endpoint {
					s3_config_builder = s3_config_builder.endpoint_url(endpoint_url).force_path_style(true);
				}

				let s3_config = s3_config_builder.build();
				let client = S3Client::from_conf(s3_config);

				Ok(StorageProvider::S3 {
					client,
					bucket: bucket.clone(),
				})
			} /*
			  StorageConfig::Gcs { .. } => {
				  // TODO: Implement GCS support
				  Err(Error::Storage("GCS storage not yet implemented".to_string()))
			  }
			  */
		}
	}

	pub async fn upload_file(&self, data: Vec<u8>, content_type: &str, extension: &str) -> Result<String> {
		let filename = format!("{}.{}", Uuid::new_v4(), extension);

		match self {
			StorageProvider::Local { base_path } => {
				let file_path = Path::new(base_path).join(&filename);
				fs::write(&file_path, data)
					.await
					.map_err(|e| Error::Storage(format!("Failed to write file: {}", e)))?;

				Ok(format!("/uploads/{}", filename))
			}
			StorageProvider::S3 { client, bucket } => {
				client
					.put_object()
					.bucket(bucket)
					.key(&filename)
					.body(data.into())
					.content_type(content_type)
					.send()
					.await
					.map_err(|e| Error::Storage(format!("Failed to upload to S3: {}", e)))?;

				Ok(format!("https://{}.s3.amazonaws.com/{}", bucket, filename))
			}
		}
	}

	pub async fn delete_file(&self, file_url: &str) -> Result<()> {
		match self {
			StorageProvider::Local { base_path } => {
				// Extract filename from URL (assumes format /uploads/filename)
				if let Some(filename) = file_url.strip_prefix("/uploads/") {
					let file_path = Path::new(base_path).join(filename);
					if file_path.exists() {
						fs::remove_file(&file_path)
							.await
							.map_err(|e| Error::Storage(format!("Failed to delete file: {}", e)))?;
					}
				}
				Ok(())
			}
			StorageProvider::S3 { client, bucket } => {
				// Extract key from S3 URL
				let key = file_url
					.split('/')
					.last()
					.ok_or_else(|| Error::Storage("Invalid S3 URL".to_string()))?;

				client
					.delete_object()
					.bucket(bucket)
					.key(key)
					.send()
					.await
					.map_err(|e| Error::Storage(format!("Failed to delete from S3: {}", e)))?;

				Ok(())
			}
		}
	}

	pub async fn get_presigned_upload_url(&self, content_type: &str, extension: &str) -> Result<(String, String)> {
		match self {
			StorageProvider::Local { .. } => {
				// For local storage, we'll use direct upload
				Err(Error::Storage(
					"Presigned URLs not supported for local storage".to_string(),
				))
			}
			StorageProvider::S3 { client, bucket } => {
				let filename = format!("{}.{}", Uuid::new_v4(), extension);

				let presigning_config = aws_sdk_s3::presigning::PresigningConfig::expires_in(
					std::time::Duration::from_secs(3600), // 1 hour
				)
				.map_err(|e| Error::Storage(format!("Failed to create presigning config: {}", e)))?;

				let presigned_request = client
					.put_object()
					.bucket(bucket)
					.key(&filename)
					.content_type(content_type)
					.presigned(presigning_config)
					.await
					.map_err(|e| Error::Storage(format!("Failed to create presigned URL: {}", e)))?;

				let final_url = format!("https://{}.s3.amazonaws.com/{}", bucket, filename);

				Ok((presigned_request.uri().to_string(), final_url))
			}
		}
	}
}
