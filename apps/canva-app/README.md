# Canva Text Translation App

Placeholder Canva app based on the [text translation example](https://www.canva.dev/docs/apps/examples/text-translation/) from the Canva Apps SDK.

This template demonstrates bulk text editing on the current page using `editContent`, with two modes:

- **Translate with formatting** — preserves inline formatting (bold, italic, etc.) by translating text regions individually.
- **Translate without formatting** — replaces plain text in each richtext element.

Translation is simulated with lorem ipsum placeholder text. Replace `getTranslation` in `src/intents/design_editor/app.tsx` with a real translation API when building a production app.

## Requirements

- Node.js `^22` or `^24`
- npm

## Quick start

```bash
cd apps/canva-app
npm install
npm start
```

The dev server runs at `http://localhost:8080`.

## Preview in Canva

1. Create an app in the [Developer Portal](https://www.canva.com/developers/apps).
2. Set **Development URL** to `http://localhost:8080`.
3. Click **Preview** and open the app in the Canva editor.

See the [Canva Apps SDK docs](https://www.canva.dev/docs/apps/) for HTTPS, HMR, and deployment details.

## Project structure

```
apps/canva-app/
├── src/
│   ├── index.tsx                          # Registers the design editor intent
│   └── intents/design_editor/
│       ├── index.tsx                      # App entry and providers
│       ├── app.tsx                        # Translation UI and editContent logic
│       └── lorem_generator.ts           # Placeholder translation helper
├── styles/components.css                  # Scroll container styles
├── canva-app.json                         # App manifest (content read/write scopes)
└── webpack.config.ts                      # Build configuration
```

## Production notes

This is a template, not a production-ready app. Before submitting to the Canva Apps Marketplace:

- Integrate a real translation service instead of lorem ipsum.
- Add internationalization with `@canva/app-i18n-kit`.
- Add error handling and user feedback for failed translations.
- Configure `.env` with your app credentials from the Developer Portal.
