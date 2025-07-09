terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

# Provider configuration
provider "google" {
  project = "hang-live"
  region  = "us-central1"
}

module "state" {
  source = "../../state"
  project = "hang-live"
}
