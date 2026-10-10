---
title: "React Intl at ICU Localisation: I-extract, I-sync, at Suriin gamit ang Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: I-integrate ang react-intl at ICU message syntax sa workflow na native sa repo—mag-extract ng mga catalog gamit ang Hyperlocalise CLI, mag-validate ng mga plural sa mga pull request, magsagawa ng review sa Hyperlocalise, at mag-deploy ng isinaling JSON sa production.
category: Engineering
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

Pinananatili ng React Intl ang tekstong nakikita ng user sa TypeScript, pero kailangan ng mga tagasalin at CI ng matatag na catalog sa disk. Dapat mapanatili ang sintaks ng ICU—mga plural, select, numero, at petsa—sa paglilipat na ito nang hindi nagkakaroon ng error habang tumatakbo ang application.

Ipinapakita ng gabay na ito kung paano ikonekta ang **react-intl**, **ICU**, at ang **`hyperlocalise` CLI** sa iisang workflow:

1. Nagsusulat ng mga mensahe ang mga inhinyero sa `defineMessages` at `<FormattedMessage />`.
2. `hl extract` ina-update ang English FormatJS catalog mula sa source.
3. Sinusuri ng GitHub ang pull request kung may mga paglihis, nawawalang key, at problema sa istruktura ng ICU.
4. `hl sync push` ay nagpapadala ng katalogo sa Hyperlocalise para sa pagsusuri.
5. `hl sync pull` at `hl pack` ay ibinabalik ang mga nasuring salin sa `lang/*.json` para sa iyong app.

Tumutugma ang pattern sa paraan ng paggamit ng Hyperlocalise sa sarili nitong web app. Para sa mga tala ng release at non-React na JSON sa parehong repository, pagsamahin ang tutorial na ito at ang [workflow ng localization sa GitHub mula pull request hanggang sa multilingual na release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Ang bubuuin natin

Ipagpalagay na may ganitong istruktura ang isang Next.js o Vite React app:

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

Ang English (`en-US`) ang source locale. French at German ang mga target. Nasa mga `defaultMessage` file (mga client module) at paminsan-minsang inline descriptor ang mga message ID at value ng `*.messages.ts`. Ang extracted JSON ang sini-sync ng Hyperlocalise; ang packed JSON naman ang ini-import ng maraming app habang tumatakbo.

Kakailanganin mo:

- isang proyekto ng Hyperlocalise na may `en-US` bilang source at mga target locale mo;
- `HYPERLOCALISE_API_KEY` at `HYPERLOCALISE_PROJECT_ID` bilang mga secret ng GitHub Actions; at
- `react-intl` (o `@formatjs/intl`) ay naka-install na sa app.

## Hakbang 1: gumawa ng mga mensahe sa react-intl na tugma sa ICU

Panatilihin ang kopya ng produkto sa mga descriptor ng mensahe, hindi sa magkakahiwalay na string literal. Gumamit ng mga tahasang ID para manatiling stable ang pag-extract at pag-review kapag nagbago ang pagkakasulat.

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

Gumamit ng ICU sa loob ng `defaultMessage` kapag nakadepende ang teksto sa mga numero o enum. Ine-evaluate ng React Intl ang buong mensahe sa runtime; dapat panatilihin ng mga tagasalin ang mga skeleton na `{count, plural, ...}` at `{scope, select, ...}` habang binabago ang mga sangay na nababasa ng tao.

Sa isang component ng pahina, ipasa ang mga value ng ICU sa pamamagitan ng `formatMessage` o `<FormattedMessage />`:

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

**Mga Server Component:** huwag i-import ang `*.messages.ts` mula sa mga module na server-only—client-only ang `defineMessages`. Markahan ang UI bilang `"use client"` o gumamit ng mga inline na `{ id, defaultMessage, description }` object kasama ang `getIntlShape(locale).formatMessage()` sa server. Tingnan ang mga boundary ng react-intl ng framework mo; hinahanap pa rin ng extract step ang mga descriptor sa mga file na ini-scan nito: `.ts` at `.tsx`.

Iwasang gamitin ang `--flatten` sa mga mensaheng ICU na ilalabas bilang iisang react-intl unit. Iniaangat ng flattening ang mga plural at select branch para sa mga espesyalisadong workflow ng pagsasalin; hindi ito ang default para sa mga runtime catalog.

## Hakbang 2: imapa ang mga catalog sa `i18n.yml`

Gumawa ng `i18n.yml` sa root ng repository (o sa ilalim ng directory ng iyong app kung inilalagay ng monorepo ang config katabi ng UI):

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

Itinuturing ng Hyperlocalise ang FormatJS JSON bilang pangunahing nilalaman: bawat key ay isang message id, bawat value ay naglalaman ng `defaultMessage` at opsyonal na `description`. Nananatiling iisang value bawat id ang mga ICU string—`run`, `check`, at hindi hinahati ng sync ang mga ito sa magkakahiwalay na pangungusap.

I-pin ang bersyon ng CLI sa `i18n.yml` (o i-pin ang install action) para iisang extractor at mga validator ang patakbuhin ng mga lokal na machine at GitHub Actions.

## Hakbang 3: kunin ang source catalog gamit ang CLI

Mula sa direktoryong naglalaman ng `i18n.yml`, i-refresh ang katalogong Ingles:

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

`extract` ini-scan ang `.ts` at `.tsx` para sa mga descriptor sa:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Gumagawa ito ng mahigpit na FormatJS JSON:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

Kung hindi isinasama ng isang descriptor ang `id`, bumubuo ang CLI ng hash na tugma sa FormatJS mula sa `defaultMessage` at `description`. Mas madaling suriin sa mga diff at sa Hyperlocalise ang mga tahasang id.

I-commit ang `lang/en-US.json` kasama ng pagbabago sa code. Ituring ang nawawalang extract commit gaya ng pagtrato mo sa nawawalang migration: hindi makikita ng platform ang mga bagong string hangga't hindi naa-update ang catalog.

Opsyonal: nilalagyan ng `--prefix-id` ng prefix ang mga ID gamit ang naka-normalize na path ng file (`src.components.saved-filters-banner.title`). Ipares ito sa `hl pack --prefix-id` kapag maiikling ID ang inaasahan ng mga runtime bundle. Gumagamit dito ang mga halimbawa ng mga stable na lohikal na ID.

## Hakbang 4: protektahan ang mga pull request gamit ang extract at `check`

Idagdag `.github/workflows/localise.yml`:

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

Dalawang gate ang nagtutulungan:

1. **Pagkakaiba sa extract** — kung may mag-edit ng `defaultMessage` sa code pero makalimutang i-edit ang `hl extract`, mabibigo ang job sa `git diff`.
2. **`hyperlocalise check`** — kasama ang `github-diff: true`, sinusuri ang mga binagong key sa `lang/en-US.json` at ang mga target para sa mga problema gaya ng `not_localized`, `placeholder_mismatch`, at **`icu_shape_mismatch`**.

Mahalaga ang huling pagsusuring iyon para sa ICU: maaaring mukhang ayos lang sa taong mabilisang sumisilip sa JSON ang string sa French na nag-aalis ng `{count, plural, ...}` o nagpapalit-palit ng mga branch, pero mabibigo ito sa runtime. Mas mura ang pagtukoy sa pagbabago ng istruktura sa CI kaysa matuklasan ito sa production.

Patakbuhin ang parehong mga pagsusuri nang lokal bago mag-push:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Hakbang 5: i-push ang na-extract na catalog pagkatapos ng merge

Magdagdag ng push job sa parehong workflow:

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

Pagkatapos ng merge, ina-upload ng `hl sync push` ang `lang/en-US.json` sa naka-link na Hyperlocalise project. Iniiwasan ng muling pagpapatakbo ng extract sa `main` ang race condition kung saan nama-merge ang code nang walang katugmang catalog sa Git.

Gamitin ang `hl sync push --dry-run` kapag binabago mo ang mga path ng bucket o listahan ng locale.

## Hakbang 6: suriin ang mga mensaheng ICU sa Hyperlocalise

Dapat makita ng mga tagasalin ang buong mensahe ng ICU, hindi ang mga hiwa-hiwalay na bahaging Ingles. Sa pagrerepaso, itanong ang mga tanong na partikular sa locale na itinatago ng ICU sa iisang string:

| Mensahe                     | Tanong sa pagrepaso                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Natural bang basahin ang mga sangay na `=0`, `one`, at `other`? Tama bang lumalawak ang `#` ayon sa mga tuntunin sa pangmaramihan ng bawat locale? |
| `filters.banner.scope`      | Sinasaklaw ba ng `select` ang bawat halagang `scope` na ipinapadala ng app? Ligtas bang fallback ang `other`?                             |
| Maiikling label                | Kasya pa rin ba sa mga button ang mga isinaling string pagkatapos ng pagpapalawak ng mga anyong pangmaramihan?                                                |

Mag-attach ng mga screenshot kapag may sangay na pangmaramihan sa isang layout na may mga limitasyon. Pinananatili ng Hyperlocalise ang glossary at mga tagubilin ng proyekto kasama ng segment—mga file lang ang inililipat ng CLI.

Aprubahan ang mga pagsasalin sa platform bago kunin muli ang mga ito. Ang pag-apruba ang pamantayan sa wika; itinatala ng Git kung ano talaga ang inilalabas.

## Hakbang 7: kunin ang mga salin at i-package para sa runtime

Magdagdag ng manu-manong pull job:

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

`sync pull` nagsusulat ng `lang/fr-FR.json` at `lang/de-DE.json` sa anyong FormatJS (mga ID, `defaultMessage`, at kung minsan ay `description`). Inaalis ng `hl pack` ang `description` at iba pang metadata habang pinananatili ang ICU sa bawat `defaultMessage`—handa na para sa mga bundler na nag-i-import ng JSON para sa bawat locale.

Halimbawa ng naka-pack na French na entry:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Buksan ang pull request para sa pagsasalin sa app, magpalit ng locale, at subukan ang `count = 0`, `count = 1`, at `count = 5`. Madalas na lumilitaw ang mga regression sa ICU kapag hindi Ingles ang mga panuntunan sa pangmaramihan.

## Hakbang 8: i-load ang mga katalogo sa app

I-import ang mga naka-pack na locale file at imapa ang mga ito sa `IntlProvider` o `createIntl`:

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

May ilang team na sa source code lang pinananatili ang mga default na English at JSON lang ang nilo-load para sa mga target—parehong gumagana ang mga pattern na ito kung nananatiling magkatugma ang `defaultMessage` sa code at `lang/en-US.json` sa pamamagitan ng extract.

## Paano gumagana ang buong daloy

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

Ikinokonekta ng Extract ang code sa mga catalog. Ikinokonekta ng Sync ang mga catalog sa mga reviewer. Ikinokonekta ng Pack ang nirepasong JSON sa iyong bundle.

## Mga karaniwang dahilan ng pagkabigo

### Hindi pumapasa ang pull request dahil sa paglihis ng extract

Patakbuhin ang `hl extract` nang lokal gamit ang kaparehong mga pattern ng `--ignore` gaya ng sa CI, i-commit ang `lang/en-US.json`, at i-push. Kung hindi inaasahang lumaktaw ang mga ID, tiyaking may mga stable na field ang mga descriptor na `id`.

### `icu_shape_mismatch` sa isang saling kung hindi man ay “mahusay”

Ihambing ang pagkakasunod-sunod ng mga branch at mga pangalan ng placeholder sa `en-US`. Patakbuhin ang `hl check --check icu_shape_mismatch --locale fr-FR` nang lokal. Ayusin ang target JSON o ibalik ang segment para sa pagsusuri—huwag i-suppress ang check para sa mga totoong ICU message.

### Ipinapakita ng runtime ang `MISSING_TRANSLATION` o Ingles sa target na locale

Kumpirmahing na-merge ang pull request para sa pagsasalin, tumakbo ang `hl pack`, at tumuturo ang mga import sa mga naka-pack na file. Tiyaking tumutugma ang mga message ID sa code sa mga key sa JSON (kasama ang anumang kumbensyong `--prefix-id`).

### `hl sync pull` ay walang binabago.

Kumpirmahin ang mga pag-apruba sa proyektong tinutukoy ng `HYPERLOCALISE_PROJECT_ID`. Patakbuhin ang `hl sync pull --dry-run`. Tiyaking tumutugma ang mga path na `i18n.yml` `to:` sa mga lokasyon kung saan ini-import ng app ang mga catalog.

### Hindi sinasadyang naalis ang ICU sa mga naka-pack na file

Gamitin ang default `hl pack` sa FormatJS JSON—pinananatili nitong `defaultMessage` nang buo. Huwag patakbuhin ang pack gamit ang mga workflow para sa plain nested JSON maliban kung ganoon ang format ng catalog mo.

## Checklist ng release

Bago ilunsad ang isang feature na nangangailangan ng bagong teksto:

- [ ] Mga deskriptor ng mensaheng pinagsama sa na-extract na `lang/en-US.json`
- [ ] Naipasa ang pagkuha ng pull request at ang `hyperlocalise check`
- [ ] `hl sync push` tumakbo noong `main`
- [ ] Nasuri at naaprubahan ang mga target na locale sa Hyperlocalise
- [ ] Na-merge ang pull request para sa pagsasalin (`sync pull` + `pack`)
- [ ] Manu-manong QA sa plural at `select` na mga branch kada locale
- [ ] Gumagamit ang production deploy ng pinagsamang `lang/*.json` artifact

## Panatilihing updated ang extract.

Hinihikayat ng React Intl ang paglalagay ng mga text kasama ng code; hinihikayat naman ng Hyperlocalise ang mga saling nasuri at nakaimbak sa mga file. Pinagdurugtong ng **`hl extract`** command ang dalawang mundong ito nang hindi gumagamit ng hiwalay na FormatJS CLI para sa mga pangunahing catalog.

Gamitin ang **`check`** para protektahan ang hugis ng ICU sa mga pull request. Gamitin ang **sync** para sa workflow ng reviewer. Gamitin ang **`pack`** para manatiling magaan ang mga production bundle habang napapanatili ng mga tagasalin ang mayamang metadata sa Git sa pagitan ng mga pull.

Para sa mas malawak na kuwento tungkol sa release ng GitHub—kabilang ang mga tala sa release na Markdown kasama ng mga string ng UI—magpatuloy sa [Workflow sa localization ng GitHub: mula pull request hanggang multilingual na release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), o [tuklasin ang localization ng produkto sa Hyperlocalise](/use-cases/product-localisation).
