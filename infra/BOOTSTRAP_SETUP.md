# Bootstrap Setup Guide

## Overview
This guide walks through setting up the foundational infrastructure for the Hang project.

## Prerequisites
- Cloudflare account with your domain added
- Terraform installed locally

## Step 1: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token" → "Custom token"
3. Configure the token with these permissions:

### Account Permissions
- `Account:Cloudflare R2:Edit` (for state bucket and uploads)
- `Account:Cloudflare D1:Edit` (for database)
- `Account:Cloudflare Workers:Edit` (for workers and KV)

### Zone Permissions
- `Zone:Zone:Edit` (for managing DNS zones)
- `Zone:DNS:Edit` (for DNS records)
- `Zone:Zone Settings:Edit` (for page rules and rate limiting)

### Account Resources
- Include: `dd618f5dbd5da77b8296f1613c301f5c` (your account ID)

### Zone Resources
- Include: All zones (or specific zones if you prefer)

4. Set IP address filtering if desired (optional but recommended)
5. Set TTL (Time to Live) for the token (recommended: 1 year)

## Step 2: Set Environment Variables

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ACCOUNT_ID="dd618f5dbd5da77b8296f1613c301f5c"
export AWS_ACCESS_KEY_ID="your-token-here"  # Same as CLOUDFLARE_API_TOKEN
export AWS_SECRET_ACCESS_KEY="dummy"        # Required but not used
```

## Step 3: Bootstrap Infrastructure

```bash
cd backend/terraform/state
terraform init
terraform plan
terraform apply
```

## Step 4: Configure Other Environments

After bootstrapping, use the state bucket for other environments:

```bash
cd backend/terraform/env/dev
terraform init
terraform plan
terraform apply
```

## Security Notes

- Never commit API tokens to version control
- Use environment variables or terraform.tfvars files (gitignored)
- Rotate tokens periodically
- Use minimum required permissions
- Consider using Cloudflare API token conditions for additional security

## Troubleshooting

### Common Issues
1. **Permission denied**: Check that your token has all required permissions
2. **Account ID mismatch**: Ensure the account ID matches your Cloudflare account
3. **Zone access**: Make sure the token has access to the zones you're managing

### Verifying Token Permissions
You can test your token using the Cloudflare API:

```bash
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
