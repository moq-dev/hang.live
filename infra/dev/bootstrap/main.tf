terraform {
  required_version = ">= 1.5"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {}

module "bootstrap" {
  source                = "../../bootstrap"
  project               = "hang-now"
  cloudflare_account_id = "dd618f5dbd5da77b8296f1613c301f5c"
}
