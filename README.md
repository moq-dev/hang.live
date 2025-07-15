# Hang

A real-time communication platform built with Tauri, SolidJS, and Cloudflare Workers.

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Rust (for Tauri)

### Setup

```bash
pnpm install
```

### Development

```bash
# Start both app and API server
pnpm dev

# Or start individually
pnpm --filter @hang/live run dev
pnpm --filter @hang/api-server run dev
```

## Deployment

This project uses Cloudflare Workers for the API and Cloudflare Pages for the web app.

### Staging Deployment

```bash
pnpm deploy:staging
```

This will deploy to:
- App: https://hang.now
- API: https://api.hang.now

### Live Deployment

```bash
pnpm deploy:live
```

This will deploy to:
- App: https://hang.live
- API: https://api.hang.live

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
