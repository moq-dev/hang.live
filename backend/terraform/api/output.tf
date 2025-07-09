# Cloud Run service outputs
output "api_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_service.api.status[0].url
}

output "api_service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.api.name
}

# Database outputs
output "database_connection_name" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.main.connection_name
}

output "database_private_ip" {
  description = "Private IP address of the database"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_public_ip" {
  description = "Public IP address of the database"
  value       = google_sql_database_instance.main.public_ip_address
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.database.name
}

output "database_user" {
  description = "Database user"
  value       = google_sql_user.user.name
}

output "database_password" {
  description = "Database password"
  value       = random_password.db_password.result
  sensitive   = true
}

# Storage outputs
output "storage_bucket_name" {
  description = "Name of the storage bucket"
  value       = google_storage_bucket.uploads.name
}

output "storage_bucket_url" {
  description = "URL of the storage bucket"
  value       = google_storage_bucket.uploads.url
}

# Security outputs
output "api_secret" {
  description = "Generated JWT secret"
  value       = random_password.api_secret.result
  sensitive   = true
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloudrun.email
}
