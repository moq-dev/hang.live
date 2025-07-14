# Terraform Remote State Setup Guide

## Overview

Since Cloudflare doesn't have a native Terraform backend, we have several options for remote state. This guide covers the recommended approach using **Cloudflare R2 with S3 backend** and alternatives.

## Option 1: Cloudflare R2 with S3 Backend (Recommended)

Since R2 is S3-compatible, we can use it as a Terraform backend. This keeps everything in the Cloudflare ecosystem.

### Prerequisites

1. **Cloudflare Account** with R2 enabled
2. **R2 API tokens** with appropriate permissions
3. **Terraform** to run the state module

### Step 1: Create R2 Bucket via Terraform State Module

Instead of creating the bucket manually, we use the state module to create it:

```bash
# Navigate to the state module
cd backend/terraform/state

# Create terraform.tfvars
cat > terraform.tfvars << EOF
project = "hang"
cloudflare_account_id = "your-account-id"
EOF

# Initialize and apply (this uses local state initially)
terraform init
terraform plan
terraform apply

# The module will output the bucket name and configuration
terraform output
```

### Step 2: Create R2 API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create a custom token with these permissions:
   - **Account**: `Cloudflare R2:Edit`
   - **Zone Resources**: `Include All zones`

### Step 3: Set Environment Variables

```bash
# For R2 backend authentication
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"

# For Cloudflare provider
export CLOUDFLARE_API_TOKEN="your-cloudflare-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

### Step 4: Update Backend Configuration

The backend configuration is already set up in your environment files:

```hcl
backend "s3" {
  bucket                      = "hang-terraform-state"
  key                         = "dev/terraform.tfstate"  # or "live/terraform.tfstate"
  region                      = "auto"
  endpoint                    = "https://your-account-id.r2.cloudflarestorage.com"
  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_s3_checksum            = true
}
```

**Important**: Replace `your-account-id` with your actual Cloudflare Account ID.

### Step 5: Initialize Backend

```bash
# Navigate to your environment directory
cd backend/terraform/env/dev

# Initialize the backend
terraform init

# If migrating from existing state, Terraform will prompt you
# Answer "yes" to copy existing state to new backend
```

### Step 6: State Migration (if needed)

If you're migrating from GCS:

```bash
# Step 1: Export existing state
terraform state pull > terraform.tfstate.backup

# Step 2: Update backend configuration (already done above)

# Step 3: Initialize new backend
terraform init

# Step 4: When prompted, choose to copy existing state
# Answer "yes" to migrate state
```

## Option 2: AWS S3 Backend

If you prefer AWS S3 or need more mature tooling:

### Setup

```bash
# Create S3 bucket
aws s3 mb s3://hang-terraform-state

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket hang-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket hang-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }
    ]
  }'
```

### Backend Configuration

```hcl
terraform {
  backend "s3" {
    bucket = "hang-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "us-east-1"
  }
}
```

## Option 3: Terraform Cloud

For team collaboration and advanced features:

### Setup

1. Sign up at [Terraform Cloud](https://app.terraform.io)
2. Create organization and workspace
3. Generate API token

### Backend Configuration

```hcl
terraform {
  cloud {
    organization = "your-org"
    workspaces {
      name = "hang-dev"
    }
  }
}
```

### Environment Variables

```bash
export TF_TOKEN_app_terraform_io="your-terraform-cloud-token"
```

## Option 4: Azure Storage Account

If you prefer Azure:

### Setup

```bash
# Create resource group
az group create --name terraform-state --location "East US"

# Create storage account
az storage account create \
  --resource-group terraform-state \
  --name hangtfstate \
  --sku Standard_LRS \
  --encryption-services blob

# Create container
az storage container create \
  --name terraform-state \
  --account-name hangtfstate
```

### Backend Configuration

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state"
    storage_account_name = "hangtfstate"
    container_name       = "terraform-state"
    key                  = "dev.terraform.tfstate"
  }
}
```

## Security Best Practices

### 1. State File Encryption

Always enable encryption for your state backend:

- **R2**: Enabled by default
- **S3**: Use server-side encryption
- **Azure**: Enable encryption at rest
- **Terraform Cloud**: Encrypted by default

### 2. Access Control

- Use least-privilege IAM policies
- Rotate access keys regularly
- Enable MFA for cloud accounts
- Use temporary credentials when possible

### 3. State Locking

Enable state locking to prevent concurrent modifications:

```hcl
# For S3 backend with DynamoDB locking
terraform {
  backend "s3" {
    bucket         = "hang-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
  }
}
```

### 4. Backup Strategy

- Enable versioning on your state bucket
- Regular backups to separate location
- Test restore procedures

## Troubleshooting

### Common Issues

1. **"Backend configuration changed"**
   ```bash
   terraform init -reconfigure
   ```

2. **"State lock timeout"**
   ```bash
   terraform force-unlock LOCK_ID
   ```

3. **"Access denied"**
   - Verify credentials and permissions
   - Check bucket/container exists
   - Validate endpoint URLs

### State Recovery

If state is corrupted or lost:

```bash
# Import existing resources
terraform import cloudflare_zone.main your-zone-id
terraform import cloudflare_workers_script.api api

# Rebuild state file
terraform plan
terraform apply
```

## Migration Script

Here's a script to automate the migration:

```bash
#!/bin/bash

# migrate-state.sh
set -e

echo "Starting Terraform state migration..."

# Backup current state
echo "Backing up current state..."
terraform state pull > state-backup-$(date +%Y%m%d-%H%M%S).json

# Update backend configuration
echo "Updating backend configuration..."
# (Your backend config should already be updated)

# Initialize new backend
echo "Initializing new backend..."
terraform init

echo "Migration complete!"
echo "Please verify with: terraform plan"
```

## Recommended Setup for Your Project

Based on your Cloudflare migration, I recommend:

1. **Use Cloudflare R2** as your state backend
2. **Single bucket** for all environments with different keys
3. **Enable versioning** for state history
4. **Use environment-specific credentials** for security

Your current setup is already configured for this approach. Just:

1. Replace `your-account-id` with your actual Account ID
2. Create the R2 bucket
3. Set up R2 API credentials
4. Run `terraform init` in each environment

This keeps everything in the Cloudflare ecosystem and provides the same reliability as other cloud backends.
