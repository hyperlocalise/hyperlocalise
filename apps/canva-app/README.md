# Hyperlocalise Canva App

Canva design editor app that extracts text from selected pages, uploads a JSON translation file to Hyperlocalise, runs a localization job, and polls for translated content.

## What it does

1. **Browse pages** from the current design without signing in.
2. **Sign in** with Hyperlocalise OAuth when you are ready to localize.
3. **Choose** a workspace and project inside the Canva panel.
4. **Extract** text from the selected pages.
5. **Translate** through a Hyperlocalise file job scoped to your user account.
6. **Poll** job status until translations are ready.

The Canva app calls `hyperlocalise-web` at `/api/integrations/canva/*` and `/api/oauth/canva/*`. There is no separate Canva backend to deploy.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A running Hyperlocalise web app with Canva OAuth configured

## Quick start

```bash
cd apps/canva-app
vp install
cp .env.template .env
vp run start
```

The Canva frontend runs at `http://localhost:8080`. Set `CANVA_BACKEND_HOST` to your Hyperlocalise web app origin, for example `http://localhost:3000`.

Use `vp check --fix` for formatting, linting, and TypeScript checks. Use `vp test` for Vitest.

Production bundles for the Canva Developer Portal:

```bash
vp run bundle
```

## Configure Hyperlocalise

In the Hyperlocalise web app, open **Integrations** and follow the **Canva** setup instructions. You will need:

- `CANVA_OAUTH_CLIENT_ID` and `CANVA_OAUTH_CLIENT_SECRET` on the Hyperlocalise server
- `CANVA_OAUTH_REDIRECT_URIS` including `https://www.canva.com/apps/oauth/authorized`
- `CANVA_APP_ID` for Canva JWT verification

In the Canva Developer Portal, register Hyperlocalise as an OAuth provider using the authorization, token, and revocation URLs shown on the Integrations page.

Set these values in the Canva app `.env`:

- `CANVA_BACKEND_HOST` — Hyperlocalise web app origin (`http://localhost:3000` in development)
- `CANVA_APP_ID` — your Canva app ID (must match Hyperlocalise `CANVA_APP_ID`)

In the Canva app UI:

- **Sign in to Hyperlocalise** — starts OAuth via Canva `auth.initOauth()`
- **Organization / Project** — choose where jobs are created
- **Pages to localize** — select editable pages
- **Target locales** — locales to translate into

Each design is stored at a stable source path: `canva/designs/<design-id>.json`.

## Preview in Canva

1. Create an app in the [Developer Portal](https://www.canva.com/developers/apps).
2. Configure OAuth with the Hyperlocalise endpoints from the Integrations page.
3. Set **Development URL** to `http://localhost:8080`.
4. Click **Preview** and open the app in the Canva editor.

See the [Canva Apps SDK docs](https://www.canva.dev/docs/apps/) for HTTPS, HMR, and deployment details.

## Project structure

```
apps/canva-app/
├── src/
│   ├── index.tsx
│   └── intents/design_editor/
│       ├── app.tsx               # OAuth + localization workflow UI
│       ├── oauth.ts              # Canva OAuth client wrapper
│       ├── hyperlocalise-client.ts
│       ├── design-content.ts     # Page list + text extraction
│       └── settings.ts           # Local preferences
```
