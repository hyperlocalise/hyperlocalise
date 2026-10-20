# sanity-plugin-hyperlocalise

Hyperlocalise document inspector for Sanity Studio: OAuth sign-in, upload/collect, translate, and apply approved translations for the open document.

## Installation

```sh
npm install sanity-plugin-hyperlocalise
```

## Usage

```ts
import {defineConfig} from 'sanity'
import {hyperlocalise} from 'sanity-plugin-hyperlocalise'

export default defineConfig({
  plugins: [
    hyperlocalise({
      documentTypes: ['post'],
      fieldTypes: ['product'],
    }),
  ],
})
```

Org admins create a **Studio plugin connection** in Hyperlocalise (Integrations). Editors connect via OAuth from the document inspector.

## Local development

From this package:

```sh
pnpm link-watch
```

In your Studio project, link `sanity-plugin-hyperlocalise`. Set `HYPERLOCALISE_APP_URL=http://localhost:3000` when building the plugin, and ensure Hyperlocalise `SANITY_CORS_ORIGINS` includes your Studio origin (for example `http://localhost:3333`).

See [Sanity plugin-kit link-watch](https://github.com/sanity-io/plugin-kit).
