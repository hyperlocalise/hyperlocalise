---
title: "Localisation de React Intl et d’ICU : extraire, synchroniser et réviser avec Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: Intégrez react-intl et la syntaxe des messages ICU à un workflow natif du dépôt — extrayez les catalogues avec la CLI Hyperlocalise, validez les pluriels dans les pull requests, effectuez la révision dans Hyperlocalise et déployez les fichiers JSON traduits en production.
category: Ingénierie
tags:
  - react-intl
  - ICU message format
  - FormatJS
  - hyperlocalise extract
  - localization CLI
  - continuous localisation
  - software localisation
  - GitHub Actions
  - translation review
  - i18n.yml
---

React Intl conserve les textes destinés aux utilisateurs dans TypeScript, mais les traducteurs et l’intégration continue ont besoin d’un catalogue stable sur disque. La syntaxe ICU — pluriels, sélecteurs, nombres et dates — doit survivre à ce transfert sans provoquer d’erreurs à l’exécution.

This guide shows how to connect **react-intl**, **ICU**, and the **`hyperlocalise` CLI** into one workflow:

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract` refreshes the English FormatJS catalog from source.
3. GitHub vérifie la demande de tirage pour détecter les dérives, les clés manquantes et les problèmes de structure ICU.
4. `hl sync push` sends the catalog to Hyperlocalise for review.
5. `hl sync pull` and `hl pack` bring reviewed translations back into `lang/*.json` for your app.

The pattern matches how Hyperlocalise dogfoods its own web app. For release notes and non-React JSON in the same repository, combine this tutorial with the [GitHub localisation workflow from pull request to multilingual release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Ce que nous allons construire

Supposons une application React Next.js ou Vite avec cette structure :

```text
.
├── .github/workflows/
│   └── localise.yml
├── src/
│   ├── components/
│   │   └── saved-filters-banner.messages.ts
│   └── app/
│       └── filters-page.tsx
├── lang/
│   ├── en-US.json          # extracted source catalog (FormatJS shape)
│   ├── fr-FR.json
│   └── de-DE.json
└── i18n.yml
```

English (`en-US`) is the source locale. French and German are targets. Message ids and `defaultMessage` values live in `*.messages.ts` files (client modules) and in occasional inline descriptors. Extracted JSON is what Hyperlocalise syncs; packed JSON is what many apps import at runtime.

Vous aurez besoin de :

- a Hyperlocalise project with `en-US` as source and your target locales;
- `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` as GitHub Actions secrets; and
- `react-intl` (or `@formatjs/intl`) already installed in the app.

## Étape 1 : rédigez des messages react-intl compatibles avec ICU

Gardez les textes du produit dans les descripteurs de messages, plutôt que de les disperser dans des chaînes littérales. Utilisez des identifiants explicites pour que l’extraction et la révision restent stables lorsque le texte change.

`src/components/saved-filters-banner.messages.ts`:

```ts
"use client";

import { defineMessages } from "react-intl";

export const savedFiltersBannerMessages = defineMessages({
  title: {
    id: "filters.banner.title",
    defaultMessage: "Saved filters",
    description: "Heading above the saved-filters list",
  },
  savedCount: {
    id: "filters.banner.savedCount",
    defaultMessage:
      "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    description: "Banner summary of how many filters the user saved",
  },
  scope: {
    id: "filters.banner.scope",
    defaultMessage:
      "{scope, select, workspace {Shared with your workspace} personal {Only visible to you} other {Custom scope}}",
    description: "Explains who can see the saved filter set",
  },
});
```

Use ICU inside `defaultMessage` when copy depends on numbers or enums. React Intl evaluates the full message at runtime; translators must preserve `{count, plural, ...}` and `{scope, select, ...}` skeletons while changing the human-readable branches.

In a page component, pass ICU values through `formatMessage` or `<FormattedMessage />`:

```tsx
"use client";

import { FormattedMessage, useIntl } from "react-intl";
import { savedFiltersBannerMessages } from "../components/saved-filters-banner.messages";

export function FiltersPage({ savedCount, scope }: { savedCount: number; scope: string }) {
  const intl = useIntl();

  return (
    <section>
      <h1>
        <FormattedMessage {...savedFiltersBannerMessages.title} />
      </h1>
      <p>{intl.formatMessage(savedFiltersBannerMessages.savedCount, { count: savedCount })}</p>
      <p>{intl.formatMessage(savedFiltersBannerMessages.scope, { scope })}</p>
    </section>
  );
}
```

**Server Components:** do not import `*.messages.ts` from server-only modules—`defineMessages` is client-only. Either mark the UI as `"use client"` or use inline `{ id, defaultMessage, description }` objects with `getIntlShape(locale).formatMessage()` on the server. See your framework’s react-intl boundaries; the extract step still finds descriptors in `.ts` and `.tsx` files it scans.

Avoid `--flatten` on ICU messages you intend to ship as single react-intl units. Flattening hoists plural and select branches for specialized translation workflows; it is not the default for runtime catalogs.

## Step 2: map catalogs in `i18n.yml`

Create `i18n.yml` at the repository root (or under your app directory if the monorepo keeps config next to the UI):

```yaml
version: hyperlocalise@1.13.3

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  ui:
    files:
      - from: lang/{{source}}.json
        to: lang/{{target}}.json

llm:
  profiles:
    default:
      provider: openai
      model: gpt-6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

Hyperlocalise treats FormatJS JSON as first-class content: each key is a message id, each value includes `defaultMessage` and optional `description`. ICU strings stay one value per id—`run`, `check`, and sync do not sentence-split them.

Pin the CLI version in `i18n.yml` (or pin the install action) so local machines and GitHub Actions run the same extractor and validators.

## Étape 3 : extraire le catalogue source avec la CLI

From the directory that contains `i18n.yml`, refresh the English catalog:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"

hl extract src \
  --out-file lang/en-US.json \
  --ignore "**/*.test.ts" \
  --ignore "**/*.test.tsx" \
  --ignore "**/*.stories.tsx" \
  --ignore "**/__tests__/**"
```

`extract` scans `.ts` and `.tsx` for descriptors in:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Il écrit du JSON FormatJS strict :

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

If a descriptor omits `id`, the CLI generates a FormatJS-compatible hash from `defaultMessage` and `description`. Explicit ids are easier to review in diffs and in Hyperlocalise.

Commit `lang/en-US.json` together with the code change. Treat a missing extract commit the same way you would a missing migration: the platform never sees new strings until the catalog updates.

Optional: `--prefix-id` prefixes ids with the normalized file path (`src.components.saved-filters-banner.title`). Pair it with `hl pack --prefix-id` when runtime bundles expect short ids. The examples here use stable logical ids instead.

## Step 4: guard pull requests with extract and `check`

Add `.github/workflows/localise.yml`:

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "lang/**"
      - "src/**/*.ts"
      - "src/**/*.tsx"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "lang/en-US.json"
      - "src/**/*.ts"
      - "src/**/*.tsx"
  workflow_dispatch:
    inputs:
      pull_translations:
        description: Pull reviewed translations into a pull request
        required: true
        type: boolean
        default: true

concurrency:
  group: localise-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  check:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4

      - name: Install Hyperlocalise
        uses: hyperlocalise/hyperlocalise/install@v1
        with:
          version: config

      - name: Verify extracted catalog matches source
        run: |
          set -euo pipefail
          hl extract src \
            --out-file lang/en-US.json \
            --ignore "**/*.test.ts" \
            --ignore "**/*.test.tsx" \
            --ignore "**/*.stories.tsx" \
            --ignore "**/__tests__/**"
          git diff --exit-code -- lang/en-US.json

      - name: Check localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

Deux contrôles fonctionnent de concert :

1. **Extract drift** — if someone edits `defaultMessage` in code but forgets `hl extract`, the job fails on `git diff`.
2. **`hyperlocalise check`** — with `github-diff: true`, validates changed keys in `lang/en-US.json` and targets for problems such as `not_localized`, `placeholder_mismatch`, and **`icu_shape_mismatch`**.

That last check matters for ICU: a French string that drops `{count, plural, ...}` or permutes branches may look fine to a human skimming JSON but will fail at runtime. Catching shape drift in CI is cheaper than catching it in production.

Exécutez les mêmes vérifications localement avant de pousser :

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Étape 5 : pousser le catalogue extrait après la fusion

Ajoutez un job push au même workflow :

```yaml
push-sources:
  if: github.event_name == 'push'
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Refresh source catalog
      run: |
        hl extract src \
          --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx" \
          --ignore "**/*.stories.tsx" \
          --ignore "**/__tests__/**"

    - name: Push sources
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

After merge, `hl sync push` uploads `lang/en-US.json` to the linked Hyperlocalise project. Re-running extract on `main` avoids a race where code merged without a matching catalog in Git.

Use `hl sync push --dry-run` when you change bucket paths or locale lists.

## Étape 6 : examiner les messages ICU dans Hyperlocalise

Les traducteurs devraient voir le message ICU complet, et non des fragments anglais isolés. Lors de la révision, posez les questions propres à la langue que l’ICU dissimule dans une seule chaîne :

| Message                     | Question d’évaluation                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Do `=0`, `one`, and `other` branches read naturally? Does `#` expand correctly for each locale’s plural rules? |
| `filters.banner.scope`      | Does `select` cover every `scope` value the app sends? Is `other` a safe fallback?                             |
| Libellés courts                | Les chaînes traduites tiennent-elles toujours dans les boutons après l’expansion du pluriel ?                                                |

Joignez des captures d’écran lorsqu’une branche au pluriel apparaît dans une mise en page à espace limité. Hyperlocalise conserve le glossaire et les instructions du projet avec le segment : la CLI ne fait que déplacer les fichiers.

Approuvez les traductions sur la plateforme avant de les récupérer. L’approbation constitue le contrôle linguistique ; Git enregistre ce qui est effectivement livré.

## Étape 7 : récupérer les traductions et les empaqueter pour l’environnement d’exécution

Ajouter une tâche d’extraction manuelle :

```yaml
pull-translations:
  if: github.event_name == 'workflow_dispatch' && inputs.pull_translations
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: write
    pull-requests: write
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Refresh source catalog
      run: |
        hl extract src --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx"

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Pack locale catalogs
      run: hl pack --bucket ui

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed react-intl catalogs"
        title: "chore(i18n): sync reviewed react-intl catalogs"
        body: |
          Pulls reviewed UI strings from Hyperlocalise.

          - `hl sync pull` — download target locale JSON
          - `hl pack` — strip translator metadata, keep id → defaultMessage

          Verify ICU placeholders, plural branches, and layout in fr-FR and de-DE before merging.
        labels: localization
```

`sync pull` writes `lang/fr-FR.json` and `lang/de-DE.json` in FormatJS shape (ids, `defaultMessage`, sometimes `description`). `hl pack` removes `description` and other metadata while preserving ICU in each `defaultMessage`—ready for bundlers that import JSON per locale.

Exemple d’entrée française compactée :

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Open the translation pull request in the app, switch locales, and exercise `count = 0`, `count = 1`, and `count = 5`. ICU regressions often appear only on non-English plural rules.

## Étape 8 : charger les catalogues dans l’application

Import packed locale files and map them into `IntlProvider` or `createIntl`:

```tsx
import frFR from "../lang/fr-FR.json";
import deDE from "../lang/de-DE.json";

const catalogs = {
  "fr-FR": flattenFormatJSCatalog(frFR),
  "de-DE": flattenFormatJSCatalog(deDE),
};

function flattenFormatJSCatalog(
  catalog: Record<string, { defaultMessage: string } | string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).map(([id, value]) => [
      id,
      typeof value === "string" ? value : value.defaultMessage,
    ]),
  );
}
```

Some teams keep English defaults only in source code and load JSON for targets only—both patterns work if `defaultMessage` in code and `lang/en-US.json` stay aligned via extract.

## Fonctionnement du flux complet

```text
feature branch
    │
    ├─ edit *.messages.ts / FormattedMessage
    ├─ hl extract → lang/en-US.json
    └─ pull request
           ├─ extract drift check
           └─ hyperlocalise check (ICU + keys, diff-scoped)
                    │
                    ▼
                  main
                    │
                    ├─ hl extract
                    └─ hl sync push → Hyperlocalise
                                         │
                                         ├─ translate + review ICU
                                         └─ approve
                                              │
                                              ▼
                                   workflow_dispatch
                                              │
                                              ├─ hl sync pull
                                              ├─ hl pack
                                              └─ translation pull request
                                                       │
                                                       └─ merge → deploy
```

Extract relie le code aux catalogues. Sync relie les catalogues aux relecteurs. Pack relie le JSON relu à votre bundle.

## Modes d’échec courants

### La pull request échoue en raison d’une dérive d’extraction

Run `hl extract` locally with the same `--ignore` patterns as CI, commit `lang/en-US.json`, and push. If ids jump unexpectedly, confirm descriptors include stable `id` fields.

### `icu_shape_mismatch` on an otherwise “good” translation

Compare branch order and placeholder names to `en-US`. Run `hl check --check icu_shape_mismatch --locale fr-FR` locally. Fix the target JSON or send the segment back to review—do not silence the check for real ICU messages.

### Runtime shows `MISSING_TRANSLATION` or English in a target locale

Confirm the translation pull request merged, `hl pack` ran, and imports point at the packed files. Verify message ids in code match keys in JSON (including any `--prefix-id` convention).

### `hl sync pull` changes nothing

Confirm approvals in the project referenced by `HYPERLOCALISE_PROJECT_ID`. Run `hl sync pull --dry-run`. Ensure `i18n.yml` `to:` paths match where the app imports catalogs.

### Les fichiers empaquetés ont été dépouillés d’ICU par erreur.

Use default `hl pack` on FormatJS JSON—it keeps `defaultMessage` intact. Do not run pack with workflows meant for plain nested JSON unless that is your catalog shape.

## Liste de contrôle de publication

Avant de livrer une fonctionnalité qui dépend d’un nouveau texte :

- [ ] Message descriptors merged with extracted `lang/en-US.json`
- [ ] Pull request extract and `hyperlocalise check` passed
- [ ] `hl sync push` ran on `main`
- [ ] Les paramètres régionaux cibles ont été vérifiés et approuvés dans Hyperlocalise
- [ ] Translation pull request merged (`sync pull` + `pack`)
- [ ] Manual QA on plural and `select` branches per locale
- [ ] Production deploy uses the merged `lang/*.json` artifacts

## Gardez l’extrait dans la boucle.

React Intl encourages colocated copy; Hyperlocalise encourages reviewed, file-backed translations. The **`hl extract`** command bridges those worlds without adopting a separate FormatJS CLI for basic catalogs.

Use **`check`** to protect ICU shape in pull requests. Use **sync** for reviewer workflow. Use **`pack`** so production bundles stay lean while translators keep rich metadata in Git between pulls.

For a wider GitHub release story—including Markdown release notes alongside UI strings—continue with [GitHub localisation workflow: from pull request to multilingual release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), or [explore product localisation on Hyperlocalise](/use-cases/product-localisation).
