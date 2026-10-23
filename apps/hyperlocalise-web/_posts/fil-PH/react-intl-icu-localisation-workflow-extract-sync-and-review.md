---
title: "React Intl at ICU Localisation: Mag-extract, Mag-sync, at Mag-review gamit ang Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: I-integrate ang react-intl at ICU message syntax sa workflow na likas sa repo—mag-extract ng mga catalog gamit ang Hyperlocalise CLI, mag-validate ng mga plural sa mga pull request, magsuri sa Hyperlocalise, at mag-deploy ng isinaling JSON sa production.
category: Inhinyeriya
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

Pinananatili ng React Intl ang tekstong nakikita ng mga user sa TypeScript, pero kailangan ng mga tagasalin at CI ng matatag na catalog sa disk. Kailangang mapanatili ang syntax ng ICU—mga plural, select, numero, at petsa—sa paglilipat na iyon nang hindi nagkakaroon ng error sa runtime.

Ipinapakita ng gabay na ito kung paano pagsamahin ang **react-intl**, **ICU**, at ang **`hyperlocalise` CLI** sa iisang daloy ng trabaho:

1. Nagsusulat ng mga mensahe ang mga inhinyero sa `defineMessages` at `<FormattedMessage />`.
2. `hl extract` ina-update ang English FormatJS catalog mula sa source.
3. Sinusuri ng GitHub ang pull request para sa drift, mga nawawalang key, at mga problema sa hugis ng ICU.
4. `hl sync push` ang nagpapadala ng catalog sa Hyperlocalise para sa pagsusuri.
5. `hl sync pull` at `hl pack` ay nagbabalik ng mga nirepasong salin sa `lang/*.json` para sa iyong app.

Tumutugma ang pattern sa paraan ng pagsubok ng Hyperlocalise sa sarili nitong web app. Para sa mga release note at JSON na hindi React sa parehong repository, pagsamahin ang tutorial na ito sa [workflow ng localization sa GitHub mula pull request hanggang sa pag-release sa maraming wika](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Ano ang bubuuin natin

Ipagpalagay na ang app ay Next.js o Vite React na may ganitong layout:

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

Ang English (`en-US`) ang source locale. French at German ang mga target. Nasa mga `*.messages.ts` file (mga client module) at paminsan-minsang inline descriptor ang mga message id at `defaultMessage` value. Ang extracted JSON ang sini-sync ng Hyperlocalise; ang packed JSON naman ang ini-import ng maraming app sa runtime.

Kakailanganin mo:

- isang proyekto sa Hyperlocalise na may `en-US` bilang source at mga target locale mo;
- at `HYPERLOCALISE_API_KEY` at `HYPERLOCALISE_PROJECT_ID` bilang mga secret sa GitHub Actions; at
- `react-intl` (o `@formatjs/intl`) ay naka-install na sa app.

## Hakbang 1: sumulat ng mga mensaheng react-intl na tugma sa ICU

Panatilihin ang kopya ng produkto sa mga descriptor ng mensahe, hindi nakakalat sa mga string literal. Gumamit ng mga tahasang ID para manatiling stable ang extraction at review kapag nagbago ang pananalita.

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

Gumamit ng ICU sa loob ng `defaultMessage` kapag nakadepende sa mga numero o enum ang teksto. Sinusuri ng React Intl ang buong mensahe habang tumatakbo; dapat panatilihin ng mga tagasalin ang mga skeleton na `{count, plural, ...}` at `{scope, select, ...}` habang binabago ang mga sangay na nababasa ng tao.

Sa isang component ng page, ipasa ang mga value ng ICU sa pamamagitan ng `formatMessage` o `<FormattedMessage />`:

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

**Mga Server Component:** huwag mag-import ng `*.messages.ts` mula sa mga module na para lang sa server—client lang ang `defineMessages`. Markahan ang UI bilang `"use client"` o gumamit ng mga inline na object na `{ id, defaultMessage, description }` kasama ang `getIntlShape(locale).formatMessage()` sa server. Tingnan ang mga hangganan ng react-intl ng framework mo; mahahanap pa rin ng hakbang sa pag-extract ang mga descriptor sa mga file na `.ts` at `.tsx` na ini-scan nito.

Iwasan ang `--flatten` sa mga ICU message na balak mong ilabas bilang iisang react-intl unit. Inililipat ng flattening ang mga plural at select branch para sa mga espesyalisadong workflow ng pagsasalin; hindi ito ang default para sa mga runtime catalog.

## Hakbang 2: imapa ang mga katalogo sa `i18n.yml`

Gumawa ng `i18n.yml` sa root ng repository (o sa loob ng direktoryo ng app mo kung inilalagay ng monorepo ang config katabi ng UI):

```yaml
version: hyperlocalise@1.13.5

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

Itinuturing ng Hyperlocalise ang FormatJS JSON bilang pangunahing content: bawat key ay isang message id, bawat value ay may kasamang `defaultMessage` at opsyonal na `description`. Nananatiling iisang value bawat id ang mga ICU string—hindi hinahati ng `run`, `check`, at sync ang mga ito sa magkakahiwalay na pangungusap.

I-pin ang bersyon ng CLI sa `i18n.yml` (o i-pin ang install action) para magpatakbo ang mga lokal na makina at GitHub Actions ng parehong extractor at mga validator.

## Hakbang 3: kunin ang source catalog gamit ang CLI

Mula sa direktoryong naglalaman ng `i18n.yml`, i-refresh ang katalogo sa Ingles:

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

`extract` naghahanap ng mga descriptor sa `.ts` at `.tsx`:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Nagsusulat ito ng JSON na mahigpit na sumusunod sa FormatJS:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

Kung hindi kasama sa isang descriptor ang `id`, bumubuo ang CLI ng hash na compatible sa FormatJS mula sa `defaultMessage` at `description`. Mas madaling suriin ang mga tahasang ID sa mga diff at sa Hyperlocalise.

I-commit ang `lang/en-US.json` kasabay ng pagbabago sa code. Ituring ang kawalan ng extract commit na parang kawalan ng migration: hindi makikita ng platform ang mga bagong string hangga't hindi naa-update ang catalog.

Opsyonal: Nilalagyan ng `--prefix-id` ng prefix ang mga ID gamit ang normalisadong path ng file (`src.components.saved-filters-banner.title`). Ipares ito sa `hl pack --prefix-id` kapag maiikling ID ang inaasahan ng mga runtime bundle. Gumagamit dito ang mga halimbawa ng mga stable na lohikal na ID sa halip.

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

Nagtutulungan ang dalawang gate:

1. **Paglihis ng extract** — kung may mag-edit ng `defaultMessage` sa code pero makalimutan ang `hl extract`, mabibigo ang job sa `git diff`.
2. **`hyperlocalise check`** — kasama ang `github-diff: true`, sinusuri ang mga binagong key sa `lang/en-US.json` at mga target para sa mga problema gaya ng `not_localized`, `placeholder_mismatch`, at **`icu_shape_mismatch`**.

Mahalaga ang huling pagsusuring iyon para sa ICU: maaaring magmukhang maayos sa isang taong mabilisang tumitingin sa JSON ang isang French na string na nag-aalis ng `{count, plural, ...}` o nagbabago ng pagkakasunod-sunod ng mga branch, pero magkakaroon ito ng error habang tumatakbo. Mas mura ang pagtukoy sa paglihis ng istruktura sa CI kaysa matuklasan ito sa production.

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

Pagkatapos ng pag-merge, `hl sync push` ay nag-a-upload ng `lang/en-US.json` sa naka-link na proyekto ng Hyperlocalise. Iniiwasan ng muling pagpapatakbo ng extract sa `main` ang race condition kung saan na-merge ang code nang walang katugmang catalog sa Git.

Gamitin ang `hl sync push --dry-run` kapag binabago mo ang mga path ng bucket o mga listahan ng locale.

## Hakbang 6: suriin ang mga mensaheng ICU sa Hyperlocalise

Dapat makita ng mga tagasalin ang buong mensaheng ICU, hindi magkakahiwalay na mga fragmentong Ingles. Sa pagrerepaso, magtanong ng mga tanong na partikular sa locale na itinatago ng ICU sa iisang string:

| Mensahe                     | Tanong sa pagsusuri                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Natural ba pakinggan ang mga sangay na `=0`, `one`, at `other`? Tama bang nag-e-expand ang `#` ayon sa mga tuntunin sa pangmaramihan ng bawat locale? |
| `filters.banner.scope`      | Saklaw ba ng `select` ang bawat value ng `scope` na ipinapadala ng app? Ligtas bang fallback ang `other`?                             |
| Maiikling label                | Kasya pa rin ba sa mga button ang mga isinaling string pagkatapos palawakin ang mga anyong pangmaramihan?                                                |

Maglakip ng mga screenshot kapag may plural branch sa isang layout na may limitadong espasyo. Itinatabi ng Hyperlocalise ang glossary at mga tagubilin ng proyekto kasama ng segment—mga file lang ang inililipat ng CLI.

Aprubahan ang mga salin sa platform bago i-pull pabalik ang mga ito. Ang pag-apruba ang nagsisilbing pamantayan sa wika; itinatala ng Git kung ano talaga ang inilalabas.

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

Isinusulat ng `sync pull` ang `lang/fr-FR.json` at `lang/de-DE.json` sa anyong FormatJS (mga ID, `defaultMessage`, kung minsan ay `description`). Inaalis ng `hl pack` ang `description` at iba pang metadata habang pinananatili ang ICU sa bawat `defaultMessage`—handa na para sa mga bundler na nag-i-import ng JSON para sa bawat locale.

Halimbawa ng naka-pack na entry sa French:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Buksan ang pull request para sa pagsasalin sa app, magpalit ng locale, at subukan ang `count = 0`, `count = 1`, at `count = 5`. Kadalasang lumilitaw lang ang mga regression sa ICU sa mga tuntunin ng plural na hindi Ingles.

## Hakbang 8: i-load ang mga katalogo sa app

Mag-import ng mga naka-pack na locale file at i-map ang mga ito sa `IntlProvider` o `createIntl`:

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

May ilang team na sa source code lang pinananatili ang mga default na English at JSON lang ang nilo-load para sa mga target—parehong pattern ay gumagana basta mananatiling nakaayon sa pamamagitan ng extract ang `defaultMessage` sa code at `lang/en-US.json`.

## Paano gumagana ang kumpletong daloy

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

Iniuugnay ng Extract ang code sa mga catalog. Iniuugnay ng Sync ang mga catalog sa mga reviewer. Iniuugnay ng Pack ang nirepasong JSON sa iyong bundle.

## Mga karaniwang uri ng pagkabigo

### Nabibigo ang pull request dahil sa paglihis ng extract.

Patakbuhin ang `hl extract` nang lokal gamit ang kaparehong mga pattern ng `--ignore` gaya ng sa CI, i-commit ang `lang/en-US.json`, at i-push. Kung hindi inaasahang lumundag ang mga ID, tiyaking may mga stable na field ang mga descriptor na `id`.

### `icu_shape_mismatch` sa isang saling “mahusay” naman sa kabuuan

Ihambing ang pagkakasunod-sunod ng branch at mga pangalan ng placeholder sa `en-US`. Patakbuhin ang `hl check --check icu_shape_mismatch --locale fr-FR` nang lokal. Ayusin ang target JSON o ibalik ang segment para sa pagsusuri—huwag patahimikin ang pagsusuri para sa mga tunay na ICU message.

### Ipinapakita ng runtime ang `MISSING_TRANSLATION` o Ingles sa isang target na locale

Kumpirmahing na-merge ang translation pull request, na-run ang `hl pack`, at tumuturo ang mga import sa mga naka-pack na file. Tiyaking tumutugma ang mga message ID sa code sa mga key sa JSON (kasama ang anumang convention na `--prefix-id`).

### `hl sync pull` ay walang binabago

Kumpirmahin ang mga pag-apruba sa proyektong tinukoy ng `HYPERLOCALISE_PROJECT_ID`. Patakbuhin ang `hl sync pull --dry-run`. Tiyaking tumutugma ang mga path na `i18n.yml` `to:` sa lokasyon kung saan nag-i-import ng mga catalog ang app.

### Inalis ang ICU nang hindi sinasadya sa mga naka-pack na file.

Gamitin ang default na `hl pack` sa FormatJS JSON—pinananatili nitong buo ang `defaultMessage`. Huwag patakbuhin ang pack gamit ang mga workflow na para sa plain nested JSON, maliban kung ganoon ang format ng iyong catalog.

## Checklist sa pag-release

Bago ilunsad ang isang feature na nakadepende sa bagong teksto:

- [ ] Mga descriptor ng mensahe na pinagsama sa na-extract na `lang/en-US.json`
- [ ] Pumasa ang pull request extract at `hyperlocalise check`
- [ ] `hl sync push` tumakbo noong `main`
- [ ] Nasuri at naaprubahan ang mga target na locale sa Hyperlocalise
- [ ] Na-merge na ang pull request para sa pagsasalin (`sync pull` + `pack`)
- [ ] Manu-manong QA sa plural at `select` na mga branch sa bawat locale
- [ ] Gumagamit ang production deployment ng pinagsamang `lang/*.json` artifacts

## Panatilihing nasa loop ang extract.

Hinihikayat ng React Intl na ilagay ang mga teksto kasama ng code; hinihikayat naman ng Hyperlocalise ang mga pagsasaling sinusuri at nakaimbak sa mga file. Pinag-uugnay ng command na **`hl extract`** ang dalawang paraang ito nang hindi gumagamit ng hiwalay na FormatJS CLI para sa mga pangunahing katalogo.

Gamitin ang **`check`** para maprotektahan ang istruktura ng ICU sa mga pull request. Gamitin ang **sync** para sa workflow ng reviewer. Gamitin ang **`pack`** para manatiling magaan ang mga production bundle habang napapanatili ng mga tagasalin ang rich metadata sa Git sa pagitan ng mga pull.

Para sa mas malawak na kuwento ng release sa GitHub—kabilang ang mga tala ng release sa Markdown kasabay ng mga string ng UI—magpatuloy sa [Daloy ng trabaho sa lokalisasyon ng GitHub: mula pull request hanggang multilingguwal na release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), o [galugarin ang lokalisasyon ng produkto sa Hyperlocalise](/use-cases/product-localisation).
