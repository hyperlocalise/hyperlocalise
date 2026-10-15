# Hyperlocalise Figma plugin

Figma plugin that connects a Hyperlocalise workspace, collects source text from
selected pages, starts translation jobs, and applies one locale at a time back
onto stamped text nodes.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)
- A Hyperlocalise workspace with a native project
- A Figma **connection** (Integrations), plus OAuth in production or a
  localhost **connection token**
- Token scopes `files:read`, `files:write`, `jobs:read`, and `jobs:write`

## Quick start

```bash
cd apps/figma-plugin
vp install
cp .env.example .env   # set HYPERLOCALISE_APP_URL=http://localhost:3000
vp run dev
```

Vite writes `dist/ui.html` and `dist/code.js`. Import the plugin in Figma using `manifest.json`.

1. In Figma, go to **Plugins → Development → Import plugin from manifest…**
2. Select `apps/figma-plugin/manifest.json`.
3. Run **Plugins → Development → Hyperlocalise**.
4. Connect (OAuth, or paste a localhost connection token), pick a project, then
   Upload / Apply / Translate.

Use `vp check --fix` for formatting, oxlint, and TypeScript checks. Use `vp test` for Vitest.

Production bundles:

```bash
vp run build
```

## Workflow

Same shape as the Canva app: collect source, then translate, then apply.

1. **Connect** — OAuth in production (`X-Hyperlocalise-Access-Token`). On
   `localhost`, paste a connection token from workspace Integrations.
2. **Choose a project** — source and target locales come from that native
   project. `zh-CN` is not `zh-TW`.
3. **Upload** — collects **source-locale** segments as
   `figma/files/{fileKey}/{page-title-slug}-{pageId}.json` (one stored file per
   page). Upload does **not** create a translation job and does not show
   “Waiting to translate…”. The plugin remaps canvas text to stored source
   (`GET …/figma/translations?locale={sourceLocale}`) by stamp key and known
   applied variants before collect, so a page already showing a target locale
   still uploads English (or the project source). Apply the source locale first
   if Upload is gated.
4. **Translate** — starts a job from the collected file when pages are already
   uploaded. First-time Translate collects and generates in one request. The
   plugin polls only while a generate job is running, then Apply runs for that
   locale.
5. **Apply** — writes **one** selected locale. `sourceByKey` is the stored
   source file, not live canvas text. Stamped nodes (`figma.k.*`) get that
   locale’s translation, or reset to stored source when the string is missing
   or still a multi-word English leftover. A second target locale cannot leave
   the first language on untranslated layers.

Each page stores `{ projectId, jobId, sourcePath }` in page plugin data
(`hyperlocalise:binding:v1`). On boot and page change, the plugin asks
Hyperlocalise for the latest job for that Figma file and page. The server is
the source of truth. `lastJobId` in client storage is only a local pointer.

**Open in Hyperlocalise** on the job card opens
`/org/{slug}/projects/{projectId}/jobs/{jobId}`.

Replace the placeholder `id` in `manifest.json` with your plugin ID from the
Figma Community when publishing. The plugin icon is set in Figma’s plugin
listing, not in Hyperlocalise Integrations.

## License

Licensed under the Business Source License 1.1. See [LICENSE](./LICENSE).
