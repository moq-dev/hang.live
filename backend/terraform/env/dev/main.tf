terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    bucket = "hang-now-state"
    prefix = "terraform/state"
  }
}

# Provider configuration
provider "google" {
  project = "hang-now"
  region  = "us-central1"
}

# Staging infrastructure
module "api" {
  source = "../../api"

  # General configuration
  project  = "hang-now"
  region      = "us-central1"

  # Monitoring configuration
  alert_email = "kixelated@gmail.com"

  # Database configuration - cheapest possible
  db_tier               = "db-f1-micro"       # Cheapest tier
  db_availability_type  = "ZONAL"             # Cheaper than REGIONAL
  db_disk_size         = 10                   # Minimum disk size
  db_disk_max_size     = 50                   # Lower max to prevent runaway costs
  deletion_protection  = false                # Allow easy cleanup

  # Storage configuration
  storage_force_destroy = true
  cors_origins         = ["https://hang.now"]

  # Application configuration - minimal resources
  container_cpu     = "250m"                  # Very low CPU (was 1000m)
  container_memory  = "256Mi"                 # Minimal memory (was 512Mi)
  max_scale        = 3                        # Low scale limit (was 10)
  api_url          = "https://api.hang.now"
  frontend_url     = "https://hang.now"

  # OAuth providers
  # TODO: Figure out a better way to store secrets
  google_client_id     = "1093943946174-915g0a9jpu7gih5emghmtabhge29qgg2.apps.googleusercontent.com"
  google_client_secret = "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"
  discord_client_id    = "1392629623812259940"
  discord_client_secret = "bps97yMNROIhml22zeJIySo0CP6ZBAYF"
}
