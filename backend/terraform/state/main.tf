terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "project" {
  description = "GCP Project ID"
  type        = string
}

# Create GCS bucket for dev environment state
resource "google_storage_bucket" "state" {
  name          = "${var.project}-state"
  location      = "US-CENTRAL1"
  force_destroy = false
  project       = var.project

  # Enable versioning for state safety
  versioning {
    enabled = true
  }

  # Lifecycle policy to manage old versions
  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }

  # Uniform bucket-level access
  uniform_bucket_level_access = true
}

# Optional: Create IAM binding to restrict access to the prod bucket
resource "google_storage_bucket_iam_binding" "state_access" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.admin"

  members = [
    # Add your team members here
    "user:kixelated@gmail.com",
    # "user:teammate@example.com",
  ]
}
