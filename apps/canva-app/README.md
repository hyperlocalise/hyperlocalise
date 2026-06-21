# Hyperlocalise Canva App

Canva design editor app that uploads selected pages from a design as a JSON translation file to Hyperlocalise, runs a localization job, and syncs translated text back into the design.

## What it does

1. **Select pages** from the full design (all editable pages are selected by default).
2. **Extract** text from the selected pages (with optional inline formatting preservation).
3. **Upload** a JSON source file to Hyperlocalise through the web app integration API.
4. **Translate** through a Hyperlocalise file job using the org's stored API key.
5. **Sync** the selected target locale back into the selected Canva pages.

The Canva app calls `hyperlocalise-web` at `/api/integrations/canva/localize`. There is no separate Canva backend to deploy.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A running Hyperlocalise web app with a Canva connection configured

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

In the Hyperlocalise web app, create a **Canva connection** for your workspace:

1. Choose an API key with `files:read`, `files:write`, `jobs:read`, and `jobs:write`.
2. Set the default project and locales for the connection.
3. Copy the one-time **connection token** shown after creation.

Set these values in `.env`:

- `CANVA_BACKEND_HOST` — Hyperlocalise web app origin (`http://localhost:3000` in development)
- `CANVA_APP_ID` — your Canva app ID for JWT verification

In the Canva app UI, provide:

- **Connection token** — from the Hyperlocalise Canva connection
- **Project ID override** — optional; leave blank to use the connection default
- **Source locale** — language of the current design text
- **Target locales** — comma-separated locale codes (for example `es, fr, de`)
- **Apply locale** — which translated locale to write back into Canva
- **Pages to localize** — choose one or more editable pages from the design

Each design is stored at a stable source path: `canva/designs/<design-id>.json`.

## Preview in Canva

1. Create an app in the [Developer Portal](https://www.canva.com/developers/apps).
2. Set **Development URL** to `http://localhost:8080`.
3. Set `CANVA_APP_ID` in `.env` for JWT verification in production.
4. Click **Preview** and open the app in the Canva editor.

See the [Canva Apps SDK docs](https://www.canva.dev/docs/apps/) for HTTPS, HMR, and deployment details.

## Project structure

```
apps/canva-app/
├── src/
│   ├── index.tsx
│   └── intents/design_editor/
│       ├── app.tsx               # Localization workflow UI
│       ├── design-content.ts     # Extract/apply Canva text
│       ├── hyperlocalise-client.ts
│       ├── segment-file.ts       # JSON file format helpers
│       └── settings.ts             # Saved project/locale settings
├── styles/components.css
├── canva-app.json
└── webpack.config.ts
```

## License

Licensed under the Business Source License 1.1. See [LICENSE](./LICENSE).
