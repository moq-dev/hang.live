# Hang API Service

A generic Rust-based API service built with Axum, featuring user authentication, room management, and file uploads. Designed to run on any cloud provider with local development support.

## Features

- **User Authentication**: Google OAuth integration with JWT tokens
- **Room Management**: Create, join, and manage rooms with role-based access
- **Avatar Uploads**: File upload with multiple storage backends (local, S3, GCS)
- **Token Generation**: Generate room-specific tokens for your MoQ integration
- **Cloud Ready**: Terraform configurations for GCP, extensible to AWS/Cloudflare
- **Flexible Development**: Works with local tools or Nix for reproducible environments

## Quick Start

### Prerequisites

**Option 1 (Recommended)**: Use your existing tools
- Rust 1.75+ (via rustup)
- Node.js + pnpm
- **[Nix](https://nixos.org/download.html)** for PostgreSQL (much easier than installing locally)

**Option 2**: Pure Nix (fully reproducible)
- **[Nix](https://nixos.org/download.html)** with flakes enabled

**Option 3**: Manual setup
- Rust 1.75+ and PostgreSQL 15+ (if you prefer full manual control)

### Development Setup

The `justfile` automatically detects what tools you have available and uses them intelligently:

1. **Quick setup:**

```bash
# One-time setup
just setup

# Check what tools are available
just check-tools
```

2. **Start development:**

```bash
# Start PostgreSQL (uses Nix for reliability)
just db-up

# Start API (uses local cargo if available, fallback to Nix)
just api-dev

# In another terminal: start the Tauri app
just dev
```

3. **Or start everything at once:**

```bash
just dev-all
```

### Tool Detection Logic

The development commands intelligently choose the best available tool:

- **Rust commands** (`cargo run`, `cargo test`, etc.): Prefer local installation, fall back to Nix
- **PostgreSQL**: Prefer Nix (most reliable), fall back to local installation
- **Build for production**: Prefer Nix for reproducibility

### Nix Integration (Optional)

If you want the full Nix experience:

```bash
# Enter Nix shell with all tools
nix develop

# Or use direnv for automatic loading
echo "use flake" > .envrc && direnv allow
```

### Manual PostgreSQL Setup

If you have PostgreSQL installed locally:

```bash
# Create database manually
createuser -s hang_user
createdb -O hang_user hang_db

# Set password
psql -d postgres -c "ALTER USER hang_user PASSWORD 'hang_password';"
```

## Development Commands

### Smart Commands (Auto-detect tools)

```bash
# Development
just api-dev          # Run API server
just api-test         # Run tests
just api-fmt          # Format code
just check            # Full project check

# Database
just db-up            # Start PostgreSQL
just db-down          # Stop PostgreSQL
just db-connect       # Connect to database
just db-reset         # Reset database (Nix only)

# Environment
just check-tools      # See what's available
just setup            # One-time setup
```

### Force Specific Tools

```bash
# Force Nix for PostgreSQL
just db-nix-up
just db-nix-down

# Force Docker for PostgreSQL
just db-docker-up
just db-docker-down

# Enter Nix shell
just api-shell
nix develop
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add `http://localhost:3001/auth/google/callback` to authorized redirect URIs
6. Update `src-api/.env` with your credentials

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback

### Users
- `GET /users/me` - Get current user
- `PATCH /users/me` - Update current user
- `GET /users/:id` - Get user by ID

### Rooms
- `GET /rooms` - List public rooms
- `POST /rooms` - Create a room
- `GET /rooms/:id` - Get room details
- `POST /rooms/:id/join` - Join a room
- `DELETE /rooms/:id/leave` - Leave a room
- `POST /rooms/:id/token` - Generate room token
- `GET /rooms/my` - Get user's rooms

### Avatars
- `POST /avatars/upload` - Upload avatar
- `GET /avatars/upload-url` - Get presigned upload URL

### Health
- `GET /health` - Health check

## Configuration

Environment variables (automatically set by Nix dev shell):

```bash
# Database
DATABASE_URL=postgresql://hang_user:hang_password@localhost:5432/hang_db

# JWT Secret (generate a secure random string in production)
JWT_SECRET=your-super-secret-jwt-key

# Base URL for OAuth redirects
BASE_URL=http://localhost:3001

# OpenID Connect Providers (add as needed)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Storage (local, s3, gcs)
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./uploads

# Server
PORT=3001
RUST_LOG=hang_api=debug
```

You can configure multiple OpenID Connect providers in your config file:

```toml
[oidc_providers.google]
client_id = "your-google-client-id"
client_secret = "your-google-client-secret"
issuer_url = "https://accounts.google.com"

[oidc_providers.github]
client_id = "your-github-client-id"
client_secret = "your-github-client-secret"
issuer_url = "https://token.actions.githubusercontent.com"

[oidc_providers.discord]
client_id = "your-discord-client-id"
client_secret = "your-discord-client-secret"
issuer_url = "https://discord.com"
```

## Storage Backends

### Local Storage
```
