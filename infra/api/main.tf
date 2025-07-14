terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Random JWT secret
resource "random_password" "api_secret" {
  length  = 64
  special = false
}

# D1 Database (SQLite)
resource "cloudflare_d1_database" "main" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-api-db"
}

# R2 Bucket for uploads/avatars
resource "cloudflare_r2_bucket" "uploads" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-uploads"
  location   = "WNAM"
}

# Workers script with proper configuration
resource "cloudflare_workers_script" "api" {
  account_id  = var.cloudflare_account_id
  script_name = "${var.project}-api"
  content     = file("${path.module}/worker-placeholder.js")

  # Allow Wrangler to update the content and bindings
  lifecycle {
    ignore_changes = [content, d1_database_binding, r2_bucket_binding, plain_text_binding]
  }
}

# D1 Database binding for Workers
resource "cloudflare_workers_d1_database_binding" "api_db" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "DB"
  database_id = cloudflare_d1_database.main.id
}

# R2 Bucket binding for Workers
resource "cloudflare_workers_r2_bucket_binding" "api_storage" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "STORAGE"
  bucket_name = cloudflare_r2_bucket.uploads.name
}

# Environment variables for Workers
resource "cloudflare_workers_plain_text_binding" "environment" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "ENVIRONMENT"
  text        = "production"
}

resource "cloudflare_workers_plain_text_binding" "api_url" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "API_URL"
  text        = var.api_url
}

resource "cloudflare_workers_plain_text_binding" "app_url" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "APP_URL"
  text        = var.frontend_url
}

resource "cloudflare_workers_plain_text_binding" "jwt_secret" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "JWT_SECRET"
  text        = random_password.api_secret.result
}

resource "cloudflare_workers_plain_text_binding" "discord_client_id" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "DISCORD_CLIENT_ID"
  text        = var.discord_client_id
}

resource "cloudflare_workers_plain_text_binding" "discord_client_secret" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "DISCORD_CLIENT_SECRET"
  text        = var.discord_client_secret
}

resource "cloudflare_workers_plain_text_binding" "google_client_id" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "GOOGLE_CLIENT_ID"
  text        = var.google_client_id
}

resource "cloudflare_workers_plain_text_binding" "google_client_secret" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "GOOGLE_CLIENT_SECRET"
  text        = var.google_client_secret
}

resource "cloudflare_workers_plain_text_binding" "database_url" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "DATABASE_URL"
  text        = "d1://${cloudflare_d1_database.main.id}"
}

resource "cloudflare_workers_plain_text_binding" "storage_type" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "STORAGE_TYPE"
  text        = "r2"
}

resource "cloudflare_workers_plain_text_binding" "storage_bucket" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  name        = "STORAGE_BUCKET"
  text        = cloudflare_r2_bucket.uploads.name
}

# Custom domain for Workers
resource "cloudflare_workers_custom_domain" "api" {
  account_id = var.cloudflare_account_id
  hostname   = "api.${var.domain_name}"
  service    = cloudflare_workers_script.api.script_name
  zone_id    = var.zone_id
  environment = "production"
}

# DNS record for API subdomain (fallback)
resource "cloudflare_record" "api" {
  zone_id = var.zone_id
  name    = "api"
  value   = "192.0.2.1" # Placeholder IP - Workers will handle this
  type    = "A"
  ttl     = 1
  proxied = true
}

# Outputs for deployment scripts
output "d1_database_id" {
  description = "D1 Database ID for Wrangler configuration"
  value       = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  description = "D1 Database name for Wrangler configuration"
  value       = cloudflare_d1_database.main.name
}

output "r2_bucket_name" {
  description = "R2 Bucket name for Wrangler configuration"
  value       = cloudflare_r2_bucket.uploads.name
}

output "jwt_secret" {
  description = "Generated JWT secret for Workers environment"
  value       = random_password.api_secret.result
  sensitive   = true
}

output "api_domain" {
  description = "API domain for Workers deployment"
  value       = "api.${var.domain_name}"
}

output "workers_script_name" {
  description = "Workers script name for deployment"
  value       = cloudflare_workers_script.api.script_name
}
