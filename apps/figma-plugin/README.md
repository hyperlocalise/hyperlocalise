# Hyperlocalise Figma plugin

Figma plugin that signs in with Hyperlocalise OAuth, extracts text from the
current selection or page, creates translation jobs, generates translations,
and pulls them back onto the file.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A Hyperlocalise workspace with a native project
- WorkOS AuthKit redirect URI: `{APP_URL}/auth/figma/callback`

## Quick start

```bash
cd apps/figma-plugin
vp install
HYPERLOCALISE_APP_URL=http://localhost:3000 vp run dev
```

Vite writes `dist/ui.html` and `dist/code.js`. Import the plugin in Figma using `manifest.json`.

1. In Figma, go to **Plugins → Development → Import plugin from manifest…**
2. Select `apps/figma-plugin/manifest.json`.
3. Run **Plugins → Development → Hyperlocalise**.
4. Sign in, choose a project, extract text, then create a job or pull translations.

Use `vp check --fix` for formatting, oxlint, and TypeScript checks. Use `vp test` for Vitest.

Production bundles:

```bash
vp run build
```

## Workflow

1. **Sign in** — PKCE OAuth popup against Hyperlocalise AuthKit.
2. **Choose a project** — extracted text uploads to this Hyperlocalise project.
3. **Extract text** — reads the current selection, or the whole page if nothing is selected.
4. **Create job** — uploads extracted segments as `figma/files/{fileKey}/pages/{pageId}.json`.
5. **Generate** — enqueues the translation job. The plugin shows a page job card and polls while the job is queued or running; Close and the rest of the panel stay usable.
6. **Pull** — applies the selected locale back onto matching text nodes. Jobs that need review are pullable when output files exist.

Each page stores `{ projectId, jobId, sourcePath }` in page plugin data (`hyperlocalise:binding:v1`). On boot and page change, the plugin asks Hyperlocalise for the latest job for that Figma file and page. The server is the source of truth: a newer job overwrites the binding, and no job clears it. `lastJobId` in client storage is only a local pointer.

**Open in Hyperlocalise** on the job card opens `/org/{slug}/projects/{projectId}/jobs/{jobId}`.

## WorkOS setup

Register `https://<your-app-host>/auth/figma/callback` (and
`http://localhost:3000/auth/figma/callback` for local development) as an AuthKit
redirect URI. Optional env on the web app:

```
WORKOS_FIGMA_REDIRECT_URI=http://localhost:3000/auth/figma/callback
```

Replace the placeholder `id` in `manifest.json` with your plugin ID from the Figma Community when publishing.

## License

Licensed under the Business Source License 1.1. See [LICENSE](./LICENSE).
