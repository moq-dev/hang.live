# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hang is a real-time communication platform that combines **closed-source application logic** with **open-source media streaming libraries**:

- **Frontend**: SolidJS + Vite + Tailwind CSS v4 + Tauri (desktop)
- **Backend**: Cloudflare Workers + Hono + tRPC + Drizzle ORM
- **Real-time**: WebTransport + MOQ (Media over QUIC)
- **Package Manager**: bun with workspaces

### Open Source vs Closed Source

This repository contains:
- **Closed Source**: The `hang` application (opinionated conferencing UI and business logic)
- **Open Source**: The `moq/` submodule (generic media streaming libraries)

The `moq` submodule contains generic, reusable libraries for media streaming that should remain framework-agnostic and broadly applicable.

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

### MOQ Submodule (`/moq/`) - **Open Source**
Generic media streaming libraries linked as a git submodule:
- **Location**: Git submodule from https://github.com/kixelated/moq (moq-preview branch)
- **Purpose**: Generic, framework-agnostic media streaming over WebTransport/QUIC
- **Languages**: TypeScript and Rust implementations
- **Packages**: `@kixelated/moq`, `@kixelated/hang`, `@kixelated/signals`, `@kixelated/moq-token`

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
5. **Submodule Linking**: MOQ libraries linked via git submodule and bun workspaces

## Development Tips

### Running Locally
- `just dev` runs the API server, app web server, and native Tauri app in parallel
- `just check` runs linting, TypeScript, and Rust checks
- `just fix` fixes formatting and linting issues across all languages

### Working with the MOQ Submodule
- **Location**: `./moq/` (git submodule)
- **Branch**: `moq-preview`
- **Dependencies**: Automatically linked via bun workspace configuration
- **Updates**: Use `git submodule update --remote` to sync with upstream

### Working with Media over QUIC
- Generic MOQ implementation in the `moq/` submodule
- Hang-specific integration in `app/room/` folder
- Uses WebTransport and QUIC under the hood

## Code Style
- **Formatting**: Biome with tabs, 120 line width, double quotes
- **Components**: PascalCase for components, camelCase for functions
- **Imports**: Always use ESM, prefer `import * as ` for namespacing.
- **Async**: Use async/await over promises
- **TypeScript**: Explicitly type variables to avoid `any` inference
- Ask me if you want to try any functionality, and please don't run `just dev` unprompted.