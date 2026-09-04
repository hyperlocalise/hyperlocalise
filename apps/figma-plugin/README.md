# Hyperlocalise Figma plugin

Figma plugin that connects with a Hyperlocalise personal access token, extracts
text from the current selection or page, creates translation jobs, generates
translations, and pulls them back onto the file.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A Hyperlocalise workspace with a native project
- A personal access token with `files:read` and `jobs:read`, plus `files:write`
  and `jobs:write` to create jobs (`jobs:write` is enough to generate an
  existing job)

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
4. Paste a personal access token from Hyperlocalise **Settings → API keys**, choose a project, extract text, then create a job or pull translations.

Use `vp check --fix` for formatting, oxlint, and TypeScript checks. Use `vp test` for Vitest.

Production bundles:

```bash
vp run build
```

## Workflow

1. **Connect** — paste a personal access token. The plugin sends it only as `x-api-key`.
2. **Choose a project** — extracted text uploads to this Hyperlocalise project in the token's organization.
3. **Extract text** — reads the current selection, or the whole page if nothing is selected.
4. **Create job** — uploads extracted segments as `figma/files/{fileKey}/pages/{pageId}.json`.
5. **Generate** — enqueues the translation job. The plugin shows a page job card and polls while the job is queued or running; Close and the rest of the panel stay usable.
6. **Pull** — applies the selected locale back onto matching text nodes. Jobs that need review are pullable when output files exist.

Each page stores `{ projectId, jobId, sourcePath }` in page plugin data (`hyperlocalise:binding:v1`). On boot and page change, the plugin asks Hyperlocalise for the latest job for that Figma file and page. The server is the source of truth: a newer job overwrites the binding, and no job clears it. `lastJobId` in client storage is only a local pointer.

**Open in Hyperlocalise** on the job card opens `/org/{slug}/projects/{projectId}/jobs/{jobId}`.

Stored WorkOS sealed sessions from earlier plugin versions are cleared on boot. Reconnect with a personal access token.

Replace the placeholder `id` in `manifest.json` with your plugin ID from the Figma Community when publishing.

## License

Licensed under the Business Source License 1.1. See [LICENSE](./LICENSE).
