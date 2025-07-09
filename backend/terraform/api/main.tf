terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Enable required Google Cloud APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",                    # Cloud Run
    "sqladmin.googleapis.com",              # Cloud SQL
    "storage.googleapis.com",               # Cloud Storage
    "vpcaccess.googleapis.com",             # VPC Access (for connectors)
    "servicenetworking.googleapis.com",     # Service Networking (for private connections)
    "compute.googleapis.com",               # Compute Engine (for VPC)
    "monitoring.googleapis.com",            # Cloud Monitoring
    "cloudresourcemanager.googleapis.com",  # Resource Manager
  ])

  project = var.project
  service = each.value

  disable_on_destroy = false  # Keep APIs enabled even if Terraform is destroyed
}

# Computed values
locals {
  container_image = "gcr.io/${var.project}/api:latest"
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Random JWT secret
resource "random_password" "api_secret" {
  length  = 64
  special = false
}

# VPC Network for private networking
resource "google_compute_network" "vpc" {
  name                    = "api-vpc"
  auto_create_subnetworks = true

  depends_on = [google_project_service.required_apis]
}

# Private service connection for Cloud SQL
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]

  depends_on = [google_project_service.required_apis]
}

# Reserved IP range for private services
resource "google_compute_global_address" "private_ip_address" {
  name          = "api-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

# VPC Connector for Cloud Run
resource "google_vpc_access_connector" "connector" {
  name          = "api-connector"
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name
  region        = var.region

  depends_on = [google_project_service.required_apis]
}

# Cloud SQL Database
resource "google_sql_database_instance" "main" {
  name             = "api"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier                  = var.db_tier
    availability_type     = var.db_availability_type
    disk_type             = "PD_SSD"
    disk_size             = var.db_disk_size
    disk_autoresize       = true
    disk_autoresize_limit = var.db_disk_max_size

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      location                       = var.region
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = var.db_backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false  # Disable public IP
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    database_flags {
      name  = "log_statement"
      value = var.db_log_statement
    }
  }

  deletion_protection = var.deletion_protection
  depends_on         = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required_apis
  ]
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "user" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Cloud Storage bucket for avatars/uploads
resource "google_storage_bucket" "uploads" {
  name          = "${var.project}-uploads"
  location      = var.storage_location
  force_destroy = var.storage_force_destroy

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  uniform_bucket_level_access = true

  depends_on = [google_project_service.required_apis]
}

# Service account for Cloud Run
resource "google_service_account" "cloudrun" {
  account_id   = "cloudrun"
  display_name = "Cloud Run Service Account"
}

# Grant service account access to storage bucket
resource "google_storage_bucket_iam_member" "cloudrun_storage" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloudrun.email}"
}

# Grant service account access to Cloud SQL
resource "google_project_iam_member" "cloudrun_sql" {
  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

# Cloud Run service
resource "google_cloud_run_service" "api" {
  name     = "api"
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.cloudrun.email

      containers {
        image = local.container_image

        ports {
          container_port = var.container_port
        }

        # Core application configuration
        env {
          name  = "API_BIND"
          value = "0.0.0.0:${var.container_port}"
        }

        env {
          name  = "DATABASE_URL"
          value = "postgresql://${google_sql_user.user.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${google_sql_database.database.name}?sslmode=require"
        }

        env {
          name  = "API_SECRET"
          value = random_password.api_secret.result
        }

        # Application URLs
        env {
          name  = "API_URL"
          value = var.api_url
        }

        env {
          name  = "FRONTEND_URL"
          value = var.frontend_url
        }

        # Storage configuration
        env {
          name  = "STORAGE_TYPE"
          value = "gcs"
        }

        env {
          name  = "STORAGE_BUCKET"
          value = google_storage_bucket.uploads.name
        }

        # OAuth providers
        env {
          name  = "OPENID_GOOGLE_CLIENT_ID"
          value = var.google_client_id
        }

        env {
          name  = "OPENID_GOOGLE_CLIENT_SECRET"
          value = var.google_client_secret
        }

        env {
          name  = "OPENID_GOOGLE_ISSUER_URL"
          value = "https://accounts.google.com"
        }

        env {
          name  = "OPENID_DISCORD_CLIENT_ID"
          value = var.discord_client_id
        }

        env {
          name  = "OPENID_DISCORD_CLIENT_SECRET"
          value = var.discord_client_secret
        }

        env {
          name  = "OPENID_DISCORD_ISSUER_URL"
          value = "https://discord.com"
        }

        resources {
          limits = {
            cpu    = var.container_cpu
            memory = var.container_memory
          }
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"      = tostring(var.max_scale)
        "run.googleapis.com/cloudsql-instances" = google_sql_database_instance.main.connection_name
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.connector.name
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_sql_database_instance.main,
    google_service_account.cloudrun,
    google_storage_bucket.uploads,
    google_project_service.required_apis
  ]
}

# Make Cloud Run service public
resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_service.api.location
  project  = google_cloud_run_service.api.project
  service  = google_cloud_run_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Monitoring and Alerting
resource "google_monitoring_notification_channel" "email" {
  display_name = "Email Notifications"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.required_apis]
}

# Alert for high CPU usage on Cloud Run
resource "google_monitoring_alert_policy" "cloudrun_cpu_high" {
  display_name = "Cloud Run CPU High"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilization high"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_service.api.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Alert for high memory usage on Cloud Run
resource "google_monitoring_alert_policy" "cloudrun_memory_high" {
  display_name = "Cloud Run Memory High"
  combiner     = "OR"

  conditions {
    display_name = "Memory utilization high"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_service.api.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Alert for high instance count (approaching max scale)
resource "google_monitoring_alert_policy" "cloudrun_instance_count_high" {
  display_name = "Cloud Run Instance Count High"
  combiner     = "OR"

  conditions {
    display_name = "Instance count approaching max"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_service.api.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.max_scale * 0.8  # Alert at 80% of max scale

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Alert for database CPU usage
resource "google_monitoring_alert_policy" "database_cpu_high" {
  display_name = "Database CPU High"
  combiner     = "OR"

  conditions {
    display_name = "Database CPU utilization high"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project}:${google_sql_database_instance.main.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Alert for database memory usage
resource "google_monitoring_alert_policy" "database_memory_high" {
  display_name = "Database Memory High"
  combiner     = "OR"

  conditions {
    display_name = "Database memory utilization high"

    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project}:${google_sql_database_instance.main.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  alert_strategy {
    auto_close = "1800s"
  }
}
