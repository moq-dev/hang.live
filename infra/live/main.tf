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
    key                         = "live/terraform.tfstate"
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
provider "cloudflare" {
  # API token should be set via CLOUDFLARE_API_TOKEN environment variable
  # Account ID should be set via CLOUDFLARE_ACCOUNT_ID environment variable
}

# Production infrastructure
module "api" {
  source = "../api"

  # General configuration
  project               = "hang-live"
  cloudflare_account_id = "dd618f5dbd5da77b8296f1613c301f5c"
  cloudflare_plan       = "pro" # Pro plan for production

  # DNS configuration
  domain_name   = "hang.live"
  zone_id       = var.zone_id # Set to existing zone ID if already managing domain

  # Monitoring configuration
  alert_email = "kixelated@gmail.com"

  # R2 Storage configuration
  cors_origins = ["https://hang.live"]

  # Application configuration
  api_url      = "https://api.hang.live"
  frontend_url = "https://hang.live"

  # Rate limiting (stricter for production)
  rate_limit_threshold = 1000
  rate_limit_period    = 60

  # OAuth providers
  google_client_id      = "632186286103-p5k3rhlsq1bgkku7dluko4nlv4ca4hao.apps.googleusercontent.com"
  google_client_secret  = "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"
  discord_client_id     = "1389725440020840548"
  discord_client_secret = "5aFK47Syy2nPGzgwrzRa4shQZWYQEwHo"

  # Access control (can be enabled for production admin routes)
  enable_access_control = var.enable_access_control
  admin_email           = "kixelated@gmail.com"
  admin_email_domains   = ["gmail.com"]
}

# Variables for this environment
variable "zone_id" {
  description = "Existing Cloudflare Zone ID for hang.live (optional)"
  type        = string
  default     = "" # Leave empty to create new zone
}

variable "enable_access_control" {
  description = "Enable Cloudflare Access for admin routes"
  type        = bool
  default     = false
}
