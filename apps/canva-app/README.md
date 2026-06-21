# Hyperlocalise Canva App

Canva design editor app that uploads selected pages from a design as a JSON translation file to Hyperlocalise, runs a localization job, and syncs translated text back into the design.

## What it does

1. **Select pages** from the full design (all editable pages are selected by default).
2. **Extract** text from the selected pages (with optional inline formatting preservation).
3. **Upload** a JSON source file to Hyperlocalise via the public API.
4. **Translate** through a Hyperlocalise file job.
5. **Sync** the selected target locale back into the selected Canva pages.

When `HYPERLOCALISE_API_KEY` is not configured, the backend falls back to preview mode and applies simulated translations so you can test the UI flow locally.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A Hyperlocalise project and API key for live translation

## Quick start

```bash
cd apps/canva-app
vp install
cp .env.template .env
vp run start
```

The Canva frontend runs at `http://localhost:8080` and the backend proxy runs at `http://localhost:3001`.

Use `vp check --fix` for formatting, linting, and TypeScript checks. Use `vp test` for Vitest.

Production bundles for the Canva Developer Portal:

```bash
vp run bundle
```

## Configure Hyperlocalise

Set these values in `.env`:

- `HYPERLOCALISE_API_URL` — usually `http://localhost:3000/api/v1` in development
- `HYPERLOCALISE_API_KEY` — API key with `files:read`, `files:write`, `jobs:read`, and `jobs:write`

In the Canva app UI, provide:

- **Project ID** — the Hyperlocalise project to upload into
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
├── backend/
│   ├── server.ts                 # Express proxy for Hyperlocalise + Canva auth
│   ├── hyperlocalise-client.ts   # Upload, job polling, download
│   └── canva-auth.ts             # JWT verification helpers
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
