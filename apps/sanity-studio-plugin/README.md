# sanity-plugin-hyperlocalise

A plugin for **Sanity Studio v3+** that integrates with Hyperlocalise to translate Sanity documents.

This plugin requires either the [Sanity document internationalization plugin](https://www.sanity.io/plugins/document-internationalization) or the [Sanity field-level internationalization plugin](https://github.com/sanity-io/sanity-plugin-internationalized-array).

## Features

- **Single document translation**: a Structure tool editor view for the open document. Supports document-level and field-level localization.
- **Bulk document translation**: a top-level tool. Supports **document-level** localization only.

Editors authenticate with Hyperlocalise **OAuth**. Org admins create a **Studio plugin connection** under Integrations first.

## Installation

```sh
npm install sanity-plugin-hyperlocalise
```

## Configuration

```ts
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { hyperlocalisePlugin, hyperlocaliseTool } from "sanity-plugin-hyperlocalise";

const languages = [
  { id: "en-US", title: "English (US)" },
  { id: "fr-FR", title: "French (France)" },
];

const documentLevelTypes = ["post"];
const fieldLevelTypes = ["product"];

export default defineConfig({
  plugins: [
    structureTool({
      defaultDocumentNode: (S, { schemaType }) => {
        if ([...documentLevelTypes, ...fieldLevelTypes].includes(schemaType)) {
          return S.document().views([
            S.view.form(),
            hyperlocalisePlugin(S, {
              supportedLanguages: languages,
              documentLocalizationSchemaTypes: documentLevelTypes,
              fieldLocalizationSchemaTypes: fieldLevelTypes,
              customBlockTypes: ["myblock"],
            }),
          ]);
        }
        return S.document();
      },
    }),
  ],
  tools: [
    hyperlocaliseTool({
      supportedLanguages: languages,
      schemaTypes: documentLevelTypes,
      customBlockTypes: ["myblock"],
    }),
  ],
});
```

A schema type cannot appear in both `documentLocalizationSchemaTypes` and `fieldLocalizationSchemaTypes`.

## Plugin options

### `hyperlocalisePlugin` (single document view)

Returns a `ComponentViewBuilder` for Structure editor views.

- `supportedLanguages` – `{id, title, enabled?}`
- `documentLocalizationSchemaTypes` – document-level types
- `fieldLocalizationSchemaTypes` – field-level types
- `customBlockTypes` – extra Portable Text `_type` names to treat like `block`

### `hyperlocaliseTool` (bulk)

Returns a top-level Studio tool.

- `supportedLanguages` – `{id, title, enabled?}`
- `schemaTypes` – document-level types to list
- `customBlockTypes` – extra Portable Text `_type` names

## Authentication

Editors choose **Connect Hyperlocalise** in the view or bulk tool and complete OAuth. Each grant is bound to the Studio origin.

The plugin does not store an API key in the dataset.

## Known limitations

Field-level mode:

- Supports `string`, `text`, and Portable Text (`block` plus `customBlockTypes`)
- Supports nested `object` fields
- Does not traverse generic arrays to find nested translatable fields except Portable Text

### Field-level exclude

```ts
defineField({
  name: "sku",
  type: "string",
  options: {
    hyperlocalise: {
      exclude: true,
    },
  },
});
```

Setting `hyperlocalise.exclude: true` on an object field excludes nested fields.

## Local development

Copy `.env.example` to `.env` and set a Sanity project id and dataset.

```sh
cd apps/sanity-studio-plugin
cp .env.example .env
pnpm install
pnpm dev
```

The in-repo Studio runs at `http://localhost:3333` and imports the plugin from `src/`. Point Hyperlocalise at `http://localhost:3000` (or `SANITY_STUDIO_HYPERLOCALISE_APP_URL`). `SANITY_CORS_ORIGINS` already includes `http://localhost:3333` by default.

To test in an external Studio:

```sh
pnpm link-watch
```

Then in that Studio:

```sh
npx yalc add sanity-plugin-hyperlocalise --link
pnpm install
```

Or `pnpm link /path/to/apps/sanity-studio-plugin`.
