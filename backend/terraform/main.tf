terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "google_client_id" {
  description = "Google OAuth Client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  sensitive   = true
}

# Provider configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Random JWT secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# Cloud SQL Database
resource "google_sql_database_instance" "main" {
  name             = "hang-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier                  = var.environment == "prod" ? "db-f1-micro" : "db-f1-micro"
    availability_type     = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_type             = "PD_SSD"
    disk_size             = 20
    disk_autoresize       = true
    disk_autoresize_limit = 100

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      location                       = var.region
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
      }
    }

    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0" # Restrict this in production
      }
    }

    database_flags {
      name  = "log_statement"
      value = "all"
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "database" {
  name     = "hang"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "user" {
  name     = "hang_user"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Cloud Storage bucket for avatars
resource "google_storage_bucket" "avatars" {
  name          = "hang-avatars-${var.environment}-${random_id.bucket_suffix.hex}"
  location      = "US"
  force_destroy = var.environment != "prod"

  cors {
    origin          = ["*"] # Restrict this in production
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Cloud Run service
resource "google_cloud_run_service" "api" {
  name     = "hang-api-${var.environment}"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project_id}/hang-api:latest"

        ports {
          container_port = 3001
        }

        env {
          name  = "DATABASE_URL"
          value = "postgresql://${google_sql_user.user.name}:${random_password.db_password.result}@${google_sql_database_instance.main.connection_name}/${google_sql_database.database.name}"
        }

        env {
          name  = "JWT_SECRET"
          value = random_password.jwt_secret.result
        }

        env {
          name  = "GOOGLE_CLIENT_ID"
          value = var.google_client_id
        }

        env {
          name  = "GOOGLE_CLIENT_SECRET"
          value = var.google_client_secret
        }

        env {
          name  = "BASE_URL"
          value = "https://${google_cloud_run_service.api.status[0].url}"
        }

        env {
          name  = "STORAGE_TYPE"
          value = "gcs"
        }

        env {
          name  = "STORAGE_GCS_BUCKET"
          value = google_storage_bucket.avatars.name
        }

        env {
          name  = "STORAGE_GCS_PROJECT_ID"
          value = var.project_id
        }

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"      = var.environment == "prod" ? "10" : "3"
        "run.googleapis.com/cloudsql-instances" = google_sql_database_instance.main.connection_name
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_sql_database_instance.main]
}

# Make Cloud Run service public
resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_service.api.location
  project  = google_cloud_run_service.api.project
  service  = google_cloud_run_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "api_url" {
  value = google_cloud_run_service.api.status[0].url
}

output "database_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "bucket_name" {
  value = google_storage_bucket.avatars.name
}
