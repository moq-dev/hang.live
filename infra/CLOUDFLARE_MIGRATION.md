# Cloudflare Migration Guide

## Overview

This guide covers the migration from Google Cloud Platform to Cloudflare, replacing:
- **Cloud Run** → **Containers on Workers**
- **Cloud SQL (PostgreSQL)** → **D1 Database (SQLite)**
- **Cloud Storage** → **R2 Object Storage**
- **Cloud DNS** → **Cloudflare DNS**

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Domain**: Transfer your domain to Cloudflare or use existing Cloudflare-managed domain
3. **Wrangler CLI**: Install for deploying containers to Workers
4. **Terraform**: Version 1.5+ with Cloudflare provider

## Setup Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
wrangler auth login
```

### 2. Get Cloudflare Credentials

```bash
# Get your Account ID from Cloudflare dashboard
wrangler whoami

# Create API token with the following permissions:
# - Zone:Zone:Read
# - Zone:DNS:Edit
# - Account:Cloudflare Workers:Edit
# - Account:D1:Edit
# - Account:R2:Edit
```

### 3. Set up Remote State Backend

**Important**: Since Cloudflare doesn't have a native Terraform backend, we use Cloudflare R2 with the S3 backend. See the detailed guide: `REMOTE_STATE_SETUP.md`

Quick setup:
```bash
# Create R2 bucket for state
wrangler r2 bucket create hang-terraform-state

# Set up R2 API credentials (get from Cloudflare dashboard)
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"
```

### 4. Environment Variables

Set these environment variables:

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export AWS_ACCESS_KEY_ID="your-r2-access-key"      # For R2 backend
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"  # For R2 backend
```

### 5. Update Terraform Variables

Create `terraform.tfvars` in each environment directory:

**For dev environment (`backend/terraform/env/dev/terraform.tfvars`):**
```hcl
cloudflare_account_id = "your-account-id"
zone_id = "your-zone-id"  # Optional: leave empty to create new zone
```

**For live environment (`backend/terraform/env/live/terraform.tfvars`):**
```hcl
cloudflare_account_id = "your-account-id"
zone_id = "your-zone-id"  # Optional: leave empty to create new zone
enable_access_control = false  # Set to true if you want Cloudflare Access
```

## Application Code Changes

### 1. Database Changes (PostgreSQL → SQLite)

**Before (PostgreSQL):**
```rust
// src/db/mod.rs
use sqlx::postgres::PgPool;

pub async fn connect() -> Result<PgPool, sqlx::Error> {
    let database_url = std::env::var("DATABASE_URL")?;
    PgPool::connect(&database_url).await
}
```

**After (SQLite/D1):**
```rust
// src/db/mod.rs
use sqlx::sqlite::SqlitePool;

pub async fn connect() -> Result<SqlitePool, sqlx::Error> {
    // For D1, you'll use the D1 REST API or bindings
    // For local development, use SQLite
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or("sqlite:./dev.db".to_string());
    SqlitePool::connect(&database_url).await
}
```

### 2. Storage Changes (Cloud Storage → R2)

**Before (GCS):**
```rust
// src/storage.rs
use gcp_storage_client::Client;

pub async fn upload_file(bucket: &str, name: &str, data: Vec<u8>) -> Result<(), Error> {
    let client = Client::default();
    client.upload_object(bucket, name, data).await
}
```

**After (R2):**
```rust
// src/storage.rs
use aws_sdk_s3::Client;  // R2 is S3-compatible

pub async fn upload_file(bucket: &str, name: &str, data: Vec<u8>) -> Result<(), Error> {
    let config = aws_config::from_env()
        .endpoint_url("https://your-account-id.r2.cloudflarestorage.com")
        .load()
        .await;
    let client = Client::new(&config);

    client
        .put_object()
        .bucket(bucket)
        .key(name)
        .body(data.into())
        .send()
        .await?;

    Ok(())
}
```

### 3. Environment Variables for Workers

Update your app to use Cloudflare Workers environment bindings:

```rust
// In your Workers environment, you'll access:
// - D1 database via `env.DB` binding
// - R2 bucket via `env.BUCKET` binding
// - KV cache via `env.CACHE` binding
```

## Deployment Process

### 1. Infrastructure Deployment

```bash
# Deploy dev environment
cd backend/terraform/env/dev

# Update the endpoint URL in main.tf with your actual Account ID
# Replace "your-account-id" with your Cloudflare Account ID

# Initialize with new backend
terraform init

# Plan and apply
terraform plan
terraform apply

# Deploy live environment
cd ../live

# Update the endpoint URL in main.tf with your actual Account ID
# Initialize with new backend
terraform init

# Plan and apply
terraform plan
terraform apply
```

### 2. Database Migration

```bash
# Create migration SQL for SQLite
# Convert your PostgreSQL schemas to SQLite equivalents

# Apply migrations to D1
wrangler d1 execute api-db --file=./migrations/001_initial.sql
```

### 3. Container Deployment

Cloudflare's Containers on Workers is still in beta. You'll need to:

1. **Build your container:**
```bash
cd backend
docker build -t your-api .
```

2. **Deploy via Wrangler:**
```bash
# This will be the command once Containers on Workers is GA
wrangler deploy --compatibility-date 2024-01-01
```

**Note:** Until Containers on Workers is fully available, you may need to:
- Rewrite your Rust API as a Workers script
- Use the Workers Runtime API instead of standard HTTP server
- Or wait for the full Containers on Workers rollout

## Configuration Updates

### 1. Update Cargo.toml

```toml
[dependencies]
# Remove Google Cloud dependencies
# google-cloud-storage = "0.x"
# google-cloud-sql = "0.x"

# Add Cloudflare/compatible dependencies
aws-sdk-s3 = "0.x"     # For R2 (S3-compatible)
sqlx = { version = "0.x", features = ["sqlite", "runtime-tokio-rustls"] }
worker = "0.x"         # For Workers runtime (if rewriting as Workers script)
```

### 2. Update Environment Variables

The following environment variables are now managed by Terraform:
- `API_SECRET` - JWT secret
- `STORAGE_TYPE` - Set to "r2"
- `STORAGE_BUCKET` - R2 bucket name
- OAuth client IDs and secrets
- Database connection (via D1 bindings)

## Testing

### 1. Local Development

```bash
# Install D1 locally for development
npm install -g @cloudflare/wrangler

# Create local D1 database
wrangler d1 create local-api-db

# Run migrations
wrangler d1 execute local-api-db --file=./migrations/001_initial.sql

# Update your local .env file
echo "DATABASE_URL=sqlite:./dev.db" >> .env
```

### 2. Testing Deployment

```bash
# Test the Workers deployment
curl https://api.your-domain.com/health

# Test D1 database
wrangler d1 execute api-db --command="SELECT * FROM users LIMIT 5"

# Test R2 storage
wrangler r2 object put your-bucket/test.txt --file=./test.txt
```

## Cost Comparison

### Google Cloud (Previous):
- Cloud Run: ~$0.24/1M requests
- Cloud SQL: ~$7.67/month (db-f1-micro)
- Cloud Storage: ~$0.020/GB/month
- Cloud DNS: ~$0.50/1M queries

### Cloudflare (New):
- Workers: $0.50/1M requests (after 100k free)
- D1: $0.50/1M reads, $1.00/1M writes (after generous free tier)
- R2: $0.015/GB/month (after 10GB free)
- DNS: Free

**Expected savings:** 60-80% reduction in costs for most workloads.

## Migration Checklist

- [ ] Set up Cloudflare account and domain
- [ ] Install Wrangler CLI
- [ ] Update environment variables
- [ ] Deploy Terraform infrastructure
- [ ] Convert PostgreSQL schemas to SQLite
- [ ] Migrate database data
- [ ] Update application code for D1 and R2
- [ ] Test container deployment
- [ ] Update CI/CD pipelines
- [ ] Monitor and validate functionality

## Troubleshooting

### Common Issues:

1. **"Containers on Workers not available"**: This feature is still in beta. Contact Cloudflare support or rewrite as a Workers script.

2. **D1 query limits**: D1 has query size and time limits. Optimize your queries accordingly.

3. **R2 CORS issues**: Configure CORS via Wrangler or API, not just Terraform.

4. **Domain not resolving**: Ensure your domain's nameservers point to Cloudflare.

## Next Steps

1. **Test the infrastructure** with a simple deployment
2. **Migrate your database** schema and data
3. **Update your application** code for the new services
4. **Set up monitoring** and alerting
5. **Optimize** for Cloudflare's edge network

For questions or issues, refer to:
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [R2 Storage Documentation](https://developers.cloudflare.com/r2/)
