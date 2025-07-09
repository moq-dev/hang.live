terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    bucket = "hang-live-state"
    prefix = "terraform/state"
  }
}

# Provider configuration
provider "google" {
  project = "hang-live"
  region  = "us-central1"
}

# Production infrastructure
module "api" {
  source = "../../api"

  # General configuration
  project  = "hang-live"
  region      = "us-central1"

  # Monitoring configuration
  alert_email = "kixelated@gmail.com"

  # Database configuration (production settings)
  db_tier               = "db-f1-micro"       # Start small, can scale up
  db_availability_type  = "REGIONAL"          # Keep regional for production
  db_disk_size         = 20                   # Start smaller (was 50)
  db_disk_max_size     = 200                  # Reasonable max (was 500)
  deletion_protection  = true

  # Storage configuration
  storage_force_destroy = false
  cors_origins          = ["https://hang.live"]

  # Application configuration - start conservative
  container_cpu     = "1000m"                 # Moderate CPU (was 2000m)
  container_memory  = "512Mi"                 # Moderate memory (was 1Gi)
  max_scale        = 10                       # Lower scale limit (was 50)
  api_url          = "https://api.hang.live"
  frontend_url     = "https://hang.live"

  # OAuth providers
  google_client_id     = "632186286103-p5k3rhlsq1bgkku7dluko4nlv4ca4hao.apps.googleusercontent.com"
  google_client_secret = "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"
  discord_client_id    = "1389725440020840548"
  discord_client_secret = "5aFK47Syy2nPGzgwrzRa4shQZWYQEwHo"
}
