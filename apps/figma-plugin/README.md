# Figma Text Translation Plugin

Placeholder Figma plugin based on the [esbuild + React sample](https://github.com/figma/plugin-samples/tree/main/esbuild-react) from the Figma plugin samples.

This template demonstrates bulk text editing on the current page, with two modes:

- **Translate with formatting** — preserves styled text segments by translating each segment individually.
- **Translate without formatting** — replaces plain text in each text node.

Translation is simulated with lorem ipsum placeholder text. Replace `getTranslation` in `src/code.ts` with a real translation API when building a production plugin.

## Requirements

- Node.js `^22` or `^24`
- [Vite+](https://vite.plus) (`vp`)

## Quick start

```bash
cd apps/figma-plugin
vp install
vp run dev
```

Vite writes `dist/ui.html` and `dist/code.js`. Import the plugin in Figma using `manifest.json`.

Use `vp check --fix` for formatting, oxlint, and TypeScript checks. Use `vp test` for Vitest.

Production bundles for Figma are built with:

```bash
vp run build
```

## Preview in Figma

1. In Figma, go to **Plugins → Development → Import plugin from manifest…**
2. Select `apps/figma-plugin/manifest.json`.
3. Run the plugin from **Plugins → Development → Hyperlocalise**.

Replace the placeholder `id` in `manifest.json` with your plugin ID from the Figma Community when publishing.

See the [Figma plugin docs](https://www.figma.com/plugin-docs/) for bundling, UI APIs, and deployment details.

## Project structure

```
apps/figma-plugin/
├── src/
│   ├── code.ts                 # Plugin sandbox logic and text translation
│   ├── app.tsx                 # React UI for translation actions
│   ├── ui.tsx                  # UI entry point
│   ├── ui.html                 # UI shell template
│   ├── ui.css                  # Plugin UI styles
│   └── lorem_generator.ts      # Placeholder translation helper
├── manifest.json               # Plugin manifest (main + ui entry points)
├── vite.config.ts              # Vite+ UI build, format, lint, and Vitest
└── vite.code.config.ts         # Vite+ plugin sandbox bundle
```

## License

Licensed under the Business Source License 1.1. See [LICENSE](./LICENSE).
