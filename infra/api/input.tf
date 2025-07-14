# General variables
variable "project" {
  description = "Project name for resource naming"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "cloudflare_plan" {
  description = "Cloudflare plan for the zone"
  type        = string
  default     = "free"
}

# DNS configuration
variable "domain_name" {
  description = "Domain name for the API (e.g., hang.live)"
  type        = string
}

variable "zone_id" {
  description = "Cloudflare Zone ID"
  type        = string
}

# Monitoring configuration
variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = "kixelated@gmail.com"
}


variable "cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
}

# Application configuration
variable "api_url" {
  description = "API URL"
  type        = string
}

variable "frontend_url" {
  description = "Frontend URL"
  type        = string
}

# Rate limiting configuration
variable "rate_limit_threshold" {
  description = "Rate limit threshold (requests per period)"
  type        = number
  default     = 1000
}

variable "rate_limit_period" {
  description = "Rate limit period in seconds"
  type        = number
  default     = 60
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
}

variable "discord_client_secret" {
  description = "Discord OAuth Client Secret"
  type        = string
  sensitive   = true
}

# Access control configuration
variable "enable_access_control" {
  description = "Enable Cloudflare Access for admin routes"
  type        = bool
  default     = false
}

variable "admin_email" {
  description = "Admin email for access control"
  type        = string
  default     = "kixelated@gmail.com"
}

variable "admin_email_domains" {
  description = "List of admin email domains for access control"
  type        = list(string)
  default     = ["kixelated@gmail.com"]
}
