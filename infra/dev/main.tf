terraform {
  required_version = ">= 1.5"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket                      = "hang-now-terraform-state" # Created by state module
    key                         = "terraform.tfstate"
    region                      = "auto"
    endpoint                    = "https://dd618f5dbd5da77b8296f1613c301f5c.r2.cloudflarestorage.com" # Replace with actual account ID
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

# Provider configuration
provider "cloudflare" {}

# Development infrastructure
module "api" {
  source = "../api"

  # General configuration
  project               = "hang-now"
  cloudflare_account_id = "dd618f5dbd5da77b8296f1613c301f5c"
  cloudflare_plan       = "free"

  # DNS configuration
  domain_name = "hang.now"
  zone_id     = "e04324eaa166ffecc2dd242d0b07c7b8"

  # Monitoring configuration
  alert_email = "kixelated@gmail.com"

  # R2 Storage configuration
  cors_origins = ["https://hang.now"]

  # Application configuration
  api_url      = "https://api.hang.now"
  frontend_url = "https://hang.now"

  # Rate limiting (more lenient for dev)
  rate_limit_threshold = 2000
  rate_limit_period    = 60

  # OAuth providers
  google_client_id      = "1093943946174-915g0a9jpu7gih5emghmtabhge29qgg2.apps.googleusercontent.com"
  google_client_secret  = "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"
  discord_client_id     = "1392629623812259940"
  discord_client_secret = "bps97yMNROIhml22zeJIySo0CP6ZBAYF"

  # Access control (disabled for dev)
  enable_access_control = false
}
