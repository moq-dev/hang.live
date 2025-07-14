terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "project" {
  description = "Project name for resource naming"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

# Create R2 bucket for Terraform state storage
resource "cloudflare_r2_bucket" "state" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-terraform-state"
  location   = "WNAM"
}

# Output the bucket information
output "state_bucket_name" {
  description = "Name of the R2 bucket for Terraform state"
  value       = cloudflare_r2_bucket.state.name
}

output "state_bucket_endpoint" {
  description = "R2 endpoint URL for Terraform backend"
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
}
