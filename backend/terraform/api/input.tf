# General variables
variable "project" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

# Monitoring configuration
variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = "alerts@hang.live"
}

# Database configuration
variable "database_name" {
  description = "Database name"
  type        = string
  default     = "hang"
}

variable "database_user" {
  description = "Database user"
  type        = string
  default     = "hang_user"
}

variable "db_tier" {
  description = "Database instance tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_availability_type" {
  description = "Database availability type"
  type        = string
  default     = "ZONAL"
}

variable "db_disk_size" {
  description = "Database disk size in GB"
  type        = number
  default     = 20
}

variable "db_disk_max_size" {
  description = "Database maximum disk size in GB"
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 7
}

variable "db_log_statement" {
  description = "Database log statement level"
  type        = string
  default     = "all"
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection"
  type        = bool
  default     = false
}

# Storage configuration
variable "storage_location" {
  description = "Storage bucket location"
  type        = string
  default     = "US"
}

variable "storage_force_destroy" {
  description = "Whether to force destroy storage bucket"
  type        = bool
  default     = true
}

variable "cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["*"]
}

# Application configuration
variable "container_port" {
  description = "Container port"
  type        = number
  default     = 3001
}

variable "container_cpu" {
  description = "Container CPU allocation"
  type        = string
  default     = "1000m"
}

variable "container_memory" {
  description = "Container memory allocation"
  type        = string
  default     = "512Mi"
}

variable "max_scale" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "api_url" {
  description = "API URL"
  type        = string
}

variable "frontend_url" {
  description = "Frontend URL"
  type        = string
}

# OAuth providers
variable "google_client_id" {
  description = "Google OAuth Client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  sensitive   = true
}

variable "discord_client_id" {
  description = "Discord OAuth Client ID"
  type        = string
  default     = ""
}

variable "discord_client_secret" {
  description = "Discord OAuth Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}
