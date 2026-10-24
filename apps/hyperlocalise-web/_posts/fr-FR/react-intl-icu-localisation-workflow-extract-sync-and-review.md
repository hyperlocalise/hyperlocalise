---
title: "Localisation React Intl et ICU : extraire, synchroniser et réviser avec Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: "\"Intégrez react-intl et la syntaxe des messages ICU à un flux de travail propre au dépôt : extrayez les catalogues avec la CLI Hyperlocalise, validez les pluriels dans les pull requests, révisez-les dans Hyperlocalise et déployez le JSON traduit en production.\""
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

React Intl conserve les textes destinés aux utilisateurs dans TypeScript, mais les traducteurs et l’intégration continue ont besoin d’un catalogue stable sur disque. La syntaxe ICU — pluriels, sélections, nombres et dates — doit rester intacte lors de ce transfert pour éviter les erreurs à l’exécution.

Ce guide montre comment intégrer **react-intl**, **ICU** et la **`hyperlocalise` CLI** dans un même flux de travail :

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract` met à jour le catalogue FormatJS anglais à partir de la source.
3. GitHub vérifie la demande de tirage afin de détecter les dérives, les clés manquantes et les problèmes de structure ICU.
4. `hl sync push` envoie le catalogue à Hyperlocalise pour examen.
5. `hl sync pull` et `hl pack` réintègrent les traductions révisées dans `lang/*.json` pour votre application.

Le modèle correspond à la façon dont Hyperlocalise utilise sa propre application web. Pour les notes de version et le JSON non-React du même dépôt, combinez ce tutoriel avec le [flux de localisation GitHub, de la pull request à la publication multilingue](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Ce que nous allons construire

Imaginez une application Next.js ou Vite React avec cette structure :

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

L’anglais (`en-US`) est la langue source. Le français et l’allemand sont les langues cibles. Les identifiants de message et les valeurs `defaultMessage` se trouvent dans les fichiers `*.messages.ts` (modules client) et parfois dans des descripteurs intégrés. Hyperlocalise synchronise les fichiers JSON extraits ; de nombreuses applications importent les fichiers JSON regroupés à l’exécution.

Vous aurez besoin de :

- un projet Hyperlocalise avec `en-US` comme source et vos langues cibles ;
- et `HYPERLOCALISE_API_KEY` et `HYPERLOCALISE_PROJECT_ID` en tant que secrets GitHub Actions ; et
- `react-intl` (ou `@formatjs/intl`) déjà installé dans l’application.

## Étape 1 : rédigez des messages react-intl compatibles avec ICU

Conservez les textes du produit dans des descripteurs de message plutôt que de les disperser dans des chaînes littérales. Utilisez des identifiants explicites afin que l’extraction et la révision restent stables lorsque le libellé change.

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

Utilisez ICU à l’intérieur de `defaultMessage` lorsque le texte dépend de nombres ou d’énumérations. React Intl évalue le message complet à l’exécution ; les traducteurs doivent préserver les structures `{count, plural, ...}` et `{scope, select, ...}` tout en modifiant les branches lisibles par les utilisateurs.

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

**Composants serveur :** n’importez pas `*.messages.ts` depuis des modules réservés au serveur — `defineMessages` est réservé au client. Marquez l’interface utilisateur avec `"use client"` ou utilisez des objets `{ id, defaultMessage, description }` intégrés avec `getIntlShape(locale).formatMessage()` côté serveur. Consultez les limites de react-intl de votre framework ; l’étape d’extraction trouve toujours les descripteurs dans les fichiers `.ts` et `.tsx` qu’elle analyse.

Évitez `--flatten` sur les messages ICU que vous prévoyez de livrer comme unités react-intl uniques. L’aplatissement remonte les branches plural et select pour les workflows de traduction spécialisés ; ce n’est pas le comportement par défaut pour les catalogues d’exécution.

## Étape 2 : associer les catalogues dans `i18n.yml`

Créez `i18n.yml` à la racine du dépôt (ou dans votre répertoire d’application si le monorepo conserve la configuration à côté de l’interface utilisateur) :

```yaml
version: hyperlocalise@1.13.6

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

Hyperlocalise traite le JSON FormatJS comme un contenu de premier ordre : chaque clé est un identifiant de message, chaque valeur inclut `defaultMessage` et éventuellement `description`. Les chaînes ICU restent une seule valeur par identifiant — `run`, `check` et la synchronisation ne les découpent pas en phrases.

Épinglez la version de la CLI dans `i18n.yml` (ou épinglez l’action d’installation) afin que les machines locales et GitHub Actions exécutent le même extracteur et les mêmes validateurs.

## Étape 3 : extraire le catalogue source avec la CLI

Depuis le répertoire qui contient `i18n.yml`, actualisez le catalogue anglais :

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

`extract` analyse `.ts` et `.tsx` à la recherche de descripteurs dans :

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

Si un descripteur ne contient pas `id`, la CLI génère un hachage compatible avec FormatJS à partir de `defaultMessage` et de `description`. Les identifiants explicites sont plus faciles à examiner dans les différences et dans Hyperlocalise.

Commitez `lang/en-US.json` en même temps que la modification du code. Considérez l’absence d’un commit d’extraction comme l’absence d’une migration : la plateforme ne voit jamais les nouvelles chaînes tant que le catalogue n’est pas mis à jour.

Facultatif : `--prefix-id` préfixe les identifiants avec le chemin normalisé du fichier (`src.components.saved-filters-banner.title`). Associez-le à `hl pack --prefix-id` lorsque les bundles d’exécution attendent des identifiants courts. Les exemples présentés ici utilisent plutôt des identifiants logiques stables.

## Étape 4 : protégez les demandes de fusion avec extract et `check`

Ajouter `.github/workflows/localise.yml`:

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

Deux portes fonctionnent ensemble :

1. **Dérive d’extraction** — si quelqu’un modifie `defaultMessage` dans le code mais oublie `hl extract`, la tâche échoue sur `git diff`.
2. **`hyperlocalise check`** — avec `github-diff: true`, valide les clés modifiées dans `lang/en-US.json` et les cibles pour détecter des problèmes tels que `not_localized`, `placeholder_mismatch` et **`icu_shape_mismatch`**.

Cette dernière vérification est importante pour ICU : une chaîne française qui omet `{count, plural, ...}` ou permute les branches peut sembler correcte à une personne qui parcourt rapidement le JSON, mais échouera à l’exécution. Détecter les écarts de structure dans la CI coûte moins cher que de les découvrir en production.

Effectuez les mêmes vérifications localement avant de pousser :

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Étape 5 : poussez le catalogue extrait après la fusion

Ajoutez un job de push au même workflow :

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

Après la fusion, `hl sync push` téléverse `lang/en-US.json` dans le projet Hyperlocalise associé. Relancer l’extraction sur `main` évite une condition de concurrence où du code est fusionné sans catalogue correspondant dans Git.

Utilisez `hl sync push --dry-run` lorsque vous modifiez les chemins des buckets ou les listes de paramètres régionaux.

## Étape 6 : examiner les messages ICU dans Hyperlocalise

Les traducteurs devraient voir le message ICU complet, et non des fragments anglais isolés. Lors de la révision, posez les questions propres à la langue que l’ICU masque dans une seule chaîne :

| Message                     | Question de révision                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Les branches `=0`, `one` et `other` se lisent-elles naturellement ? `#` se développe-t-il correctement selon les règles de pluriel de chaque langue ? |
| `filters.banner.scope`      | Est-ce que `select` couvre toutes les valeurs `scope` que l’application envoie ? `other` constitue-t-il une solution de secours sûre ?                             |
| Libellés courts                | Les chaînes traduites tiennent-elles toujours dans les boutons après expansion du pluriel ?                                                |

Joignez des captures d’écran lorsqu’une branche plurielle apparaît dans une mise en page contrainte. Hyperlocalise conserve le glossaire et les instructions du projet avec le segment — la CLI ne fait que déplacer des fichiers.

Approuvez les traductions sur la plateforme avant de les récupérer. L’approbation constitue le contrôle linguistique ; Git enregistre ce qui est effectivement livré.

## Étape 7 : récupérer les traductions et les empaqueter pour l’exécution

Ajouter un job de récupération manuel :

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

`sync pull` écrit `lang/fr-FR.json` et `lang/de-DE.json` au format FormatJS (identifiants, `defaultMessage`, parfois `description`). `hl pack` supprime `description` et les autres métadonnées tout en préservant ICU dans chaque `defaultMessage` — prêt à être utilisé par les bundlers qui importent du JSON pour chaque locale.

Exemple d’entrée française compactée :

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Ouvrez la pull request de traduction dans l’application, changez de paramètres régionaux et testez `count = 0`, `count = 1` et `count = 5`. Les régressions ICU n’apparaissent souvent qu’avec les règles de pluriel d’autres langues que l’anglais.

## Étape 8 : charger les catalogues dans l’application

Importez les fichiers de langue empaquetés et mappez-les dans `IntlProvider` ou `createIntl` :

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

Certaines équipes gardent les valeurs par défaut en anglais uniquement dans le code et chargent des fichiers JSON uniquement pour les langues cibles — les deux approches fonctionnent si `defaultMessage` dans le code et `lang/en-US.json` restent synchronisés grâce à l’extraction.

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

Extract relie le code aux catalogues. Sync relie les catalogues aux réviseurs. Pack intègre le JSON révisé à votre bundle.

## Modes d’échec courants

### La pull request échoue en raison d’une dérive d’extraction

Exécutez `hl extract` localement avec les mêmes `--ignore` motifs qu’en CI, créez le commit `lang/en-US.json`, puis poussez-le. Si les identifiants changent de façon inattendue, vérifiez que les descripteurs incluent des champs `id` stables.

### `icu_shape_mismatch` dans une traduction par ailleurs « bonne »

Comparez l’ordre des branches et les noms des espaces réservés à `en-US`. Exécutez `hl check --check icu_shape_mismatch --locale fr-FR` localement. Corrigez le JSON cible ou renvoyez le segment pour révision — ne désactivez pas le contrôle pour les vrais messages ICU.

### L’environnement d’exécution affiche `MISSING_TRANSLATION` ou l’anglais dans une langue cible

Confirmez que la pull request de traduction a été fusionnée, que `hl pack` a été exécuté et que les imports pointent vers les fichiers empaquetés. Vérifiez que les identifiants de message dans le code correspondent aux clés du JSON (y compris toute convention `--prefix-id`).

### `hl sync pull` ne change rien

Confirmez les approbations dans le projet référencé par `HYPERLOCALISE_PROJECT_ID`. Exécutez `hl sync pull --dry-run`. Assurez-vous que les chemins `i18n.yml` `to:` correspondent à l’emplacement où l’application importe les catalogues.

### Fichiers empaquetés dépouillés d’ICU par erreur

Utilisez le paramètre par défaut `hl pack` sur le JSON FormatJS — il conserve `defaultMessage` intact. N’exécutez pas pack avec des workflows destinés au JSON imbriqué simple, sauf si c’est la structure de votre catalogue.

## Liste de contrôle de mise en production

Avant de livrer une fonctionnalité qui dépend d’un nouveau texte :

- [ ] Descripteurs de message fusionnés avec les `lang/en-US.json` extraits
- [ ] L’extraction de la demande de fusion et `hyperlocalise check` ont réussi
- [ ] `hl sync push` s’est exécuté le `main`
- [ ] Les paramètres régionaux cibles ont été examinés et approuvés dans Hyperlocalise.
- [ ] Pull request de traduction fusionnée (`sync pull` + `pack`)
- [ ] Vérification manuelle des branches de pluriel et `select` pour chaque langue
- [ ] Le déploiement en production utilise les artefacts fusionnés `lang/*.json`

## Gardez l’extrait dans la boucle.

React Intl encourage à colocaliser les textes ; Hyperlocalise privilégie des traductions révisées et stockées dans des fichiers. La commande **`hl extract`** fait le lien entre ces deux approches sans avoir à adopter une CLI FormatJS distincte pour les catalogues de base.

Utilisez **`check`** pour préserver la structure ICU dans les pull requests. Utilisez **sync** pour le workflow de révision. Utilisez **`pack`** afin que les bundles de production restent légers, tout en permettant aux traducteurs de conserver des métadonnées enrichies dans Git entre les pulls.

Pour découvrir une vue d’ensemble plus large des sorties GitHub — incluant les notes de version au format Markdown ainsi que les chaînes de l’interface utilisateur — poursuivez avec [le flux de localisation GitHub : de la pull request à la version multilingue](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), ou [explorez la localisation des produits sur Hyperlocalise](/use-cases/product-localisation).
