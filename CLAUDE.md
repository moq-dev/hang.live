# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hang is a real-time communication platform that combines **closed-source application logic** with **open-source media streaming libraries**:

- **Frontend**: SolidJS + Vite + Tailwind CSS v4 + Tauri (desktop)
- **Backend**: Cloudflare Workers + Hono + tRPC + Drizzle ORM
- **Real-time**: WebTransport + MOQ (Media over QUIC)
- **Package Manager**: bun with workspaces

### Open Source vs Closed Source

- **Closed Source**: The `hang` application (opinionated conferencing UI and business logic)
- **Open Source**: [moq](https://github.com/moq-dev/moq) (generic media streaming libraries, consumed as npm packages)

## Essential Commands

```bash
# Development
just dev

# Build & Deploy
just build
just deploy live

# Code Quality
just check
just fix
```

## Architecture

### MOQ Libraries — **Open Source**
Published npm packages from [moq](https://github.com/moq-dev/moq):
- **Packages**: `@moq/lite`, `@moq/hang`, `@moq/signals`, `@moq/publish`, `@moq/watch`, `@moq/token`
- **Relay**: `moq-relay` binary provided via nix flake for local development (`dev/relay/`)

### Frontend (`/app`) - **Closed Source**
Hang-specific conferencing UI and application logic:
- **Entry**: `src/index.tsx`
- **Routing**: SPA with `@solidjs/router`
- **State**: SolidJS signals, backed by `@kixelated/signals`
- **API Client**: RPC client using Hono RPC in `@hang/api/client`
- **Room Logic**: Core application logic in `room/` folder

### Native App (`/native`) - **Closed Source**
Desktop application using Tauri:
- **Framework**: Tauri v2 with Rust backend
- **Frontend**: Uses the same web app from `/app`

### Backend (`/api`) - **Closed Source**
Hang-specific server and business logic:
- **Entry**: `src/index.ts` - Hono app
- **Routes**: RPC endpoints using Hono RPC
- **Auth**: JWT with OAuth providers in `src/auth.ts`
- **Environment**: Cloudflare Workers with D1 database and R2 storage

### Key Patterns
1. **Type-safe RPC**: Backend and frontend share types
2. **WebTransport Rooms**: Real-time media streaming via MOQ protocol
3. **OAuth Flow**: Authentication with Google/Discord through popup windows
4. **Edge-first**: All backend services run on Cloudflare's edge network
5. **MOQ Libraries**: Published npm packages from the open-source moq project

## Development Tips

### Running Locally
- `just dev` runs the API server, app web server, and native Tauri app in parallel
- `just check` runs linting, TypeScript, and Rust checks
- `just fix` fixes formatting and linting issues across all languages

### Working with Media over QUIC
- MOQ libraries are installed from npm (`@moq/*` packages)
- Hang-specific integration in `app/room/` folder
- Local relay server config in `dev/relay/` (uses `moq-relay` from nix flake)
- Uses WebTransport and QUIC under the hood

## Code Style
- **Formatting**: Biome with tabs, 120 line width, double quotes
- **Components**: PascalCase for components, camelCase for functions
- **Imports**: Always use ESM, prefer `import * as ` for namespacing.
- **Async**: Use async/await over promises
- **TypeScript**: Explicitly type variables to avoid `any` inference. Never use `as any` or similar type escape hatches unless explicitly prompted.
- Ask me if you want to try any functionality, and please don't run `just dev` unprompted.