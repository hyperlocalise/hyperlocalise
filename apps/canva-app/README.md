# Hyperlocalise Canva App

Canva design editor app that collects one JSON file per page, generates each project language, and applies translations back onto the design.

## What it does

1. **Select pages** from the full design (all editable pages are selected by default).
2. **Collect texts** to upload one JSON source file for one selected page, or for every selected page.
3. **Generate translation** per project target locale (one file job per page file in the latest collect).
4. **Add to design** on the source language row to restore collected copy, or on a target row to write that translation. Each row can apply one page or every matching page.

The Canva app calls `hyperlocalise-web` at `/api/integrations/canva` (`/collect`, `/locales`, `/jobs`, `/translations`). There is no separate Canva backend to deploy.

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

Product steps live in [Localize Canva](../../docs/platform/connections/canva.mdx).

In the Hyperlocalise web app, create a **Canva connection** for your workspace:

1. Choose an API key with `files:read`, `files:write`, `jobs:read`, and `jobs:write`.
2. Local development only: copy the one-time **connection token** shown after creation. The published Canva app uses OAuth only.

Set these values in `.env`:

- `CANVA_BACKEND_HOST` — Hyperlocalise web app origin (`http://localhost:3000` in development)
- `CANVA_APP_ID` — your Canva app ID for JWT verification
- `CANVA_APP_ORIGIN` — app origin from Developer Portal → Settings → Security when required

### OAuth (Connect Hyperlocalise)

Hyperlocalise is the OAuth authorization server. In the [Developer Portal](https://www.canva.com/developers/apps) Authentication settings, set:

| Portal field             | Value                                |
| ------------------------ | ------------------------------------ |
| Authorization server URL | `{ORIGIN}/api/oauth/canva/authorize` |
| Token exchange URL       | `{ORIGIN}/api/oauth/canva/token`     |

Use your public Hyperlocalise web origin for `{ORIGIN}` (production or a tunnel for local OAuth). Copy Canva’s **Client ID** and **Client secret** into `CANVA_OAUTH_CLIENT_ID` and `CANVA_OAUTH_CLIENT_SECRET` on `hyperlocalise-web`, along with `HYPERLOCALISE_PUBLIC_APP_URL`. Full steps: [Canva app OAuth](../../docs/contributing/canva-app-oauth.mdx).

For local dev without a tunnel, paste a **connection token** from workspace Integrations instead of OAuth.

In the Canva app UI:

- **Connect Hyperlocalise** (OAuth). A connection-token paste field appears only in local development.
- **Collect texts** — select pages, then upload one JSON file per page. Each text box is one string keyed by its source text (`canva.t.<hash>`). If the design already shows a translation, Upload still sends the Hyperlocalise source string.
- **Translate** — for the chosen target language: if selected pages are not uploaded yet, uploads source text (when the design shows the project source locale) and starts translation in one request; otherwise starts a job from the last upload. Waits for the job, then applies to the design. Use **Upload** when you only want to sync source without translating.
- **Apply** — pull locale strings from Hyperlocalise and write them onto boxes that still match uploaded source text or a known translation. Pages uploaded with older positional keys need a fresh Upload.

Each collected page is stored at `canva/designs/<design-slug>/page-<n>.json`, starting at `page-1.json`. The slug is the Canva design title. Untitled designs fall back to the design id.

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
