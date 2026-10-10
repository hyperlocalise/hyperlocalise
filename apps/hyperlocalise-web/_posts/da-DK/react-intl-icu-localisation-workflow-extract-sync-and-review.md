---
title: "React Intl og ICU-lokalisering: Udtræk, synkronisér og gennemgå med Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: Integrer react-intl og ICU-meddelelsessyntaks i et workflow, der passer til repoet – udtræk kataloger med Hyperlocalise CLI, valider pluralformer i pull requests, gennemgå dem i Hyperlocalise, og send oversat JSON til produktion.
category: Teknik
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

React Intl holder brugerrettede tekster i TypeScript, men oversættere og CI har brug for et stabilt katalog på disken. ICU-syntaks – pluralformer, select-udtryk, tal og datoer – skal overleve denne overlevering uden at gå i stykker under kørsel.

Denne vejledning viser, hvordan du samler **react-intl**, **ICU** og **`hyperlocalise` CLI** i én arbejdsgang:

1. Ingeniører skriver beskeder i `defineMessages` og `<FormattedMessage />`.
2. `hl extract` opdaterer det engelske FormatJS-katalog fra kilden.
3. GitHub kontrollerer pull requesten for afvigelser, manglende nøgler og problemer med ICU-strukturen.
4. `hl sync push` sender kataloget til Hyperlocalise til gennemgang.
5. `hl sync pull` og `hl pack` fører gennemgåede oversættelser tilbage til `lang/*.json` til din app.

Mønsteret afspejler, hvordan Hyperlocalise selv bruger sin webapp. For udgivelsesnoter og ikke-React-JSON i samme repository kan du kombinere denne vejledning med [GitHub-arbejdsgangen for lokalisering fra pull request til flersproget udgivelse](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Hvad vi vil bygge

Antag en Next.js- eller Vite React-app med dette layout:

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

Engelsk (`en-US`) er kildesproget. Fransk og tysk er målsprog. Meddelelses-id'er og `defaultMessage`-værdier findes i `*.messages.ts`-filer (klientmoduler) og i lejlighedsvise inline-deskriptorer. Ekstraheret JSON er det, Hyperlocalise synkroniserer; pakket JSON er det, mange apps importerer ved kørsel.

Du skal bruge:

- et Hyperlocalise-projekt med `en-US` som kilde og dine målsprog;
- og `HYPERLOCALISE_API_KEY` og `HYPERLOCALISE_PROJECT_ID` som GitHub Actions-hemmeligheder; og
- `react-intl` (eller `@formatjs/intl`) allerede installeret i appen.

## Trin 1: Skriv ICU-bevidste react-intl-meddelelser

Hold produkttekster i meddelelsesbeskrivelser i stedet for at sprede dem ud over strengliteraler. Brug eksplicitte id'er, så udtræk og gennemgang forbliver stabile, når formuleringerne ændres.

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

Brug ICU inde i `defaultMessage`, når teksten afhænger af tal eller enums. React Intl evaluerer hele meddelelsen under kørsel; oversættere skal bevare skeletterne `{count, plural, ...}` og `{scope, select, ...}`, mens de ændrer de læsbare grene.

I en sidekomponent skal du sende ICU-værdier videre gennem `formatMessage` eller `<FormattedMessage />`:

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

**Serverkomponenter:** Importér ikke `*.messages.ts` fra server-only-moduler – `defineMessages` er kun til klienten. Markér enten brugergrænsefladen som `"use client"`, eller brug indlejrede `{ id, defaultMessage, description }`-objekter med `getIntlShape(locale).formatMessage()` på serveren. Se dit frameworks react-intl-grænser; ekstraktionstrinnet finder stadig deskriptorer i de `.ts`- og `.tsx`-filer, det scanner.

Undgå `--flatten` på ICU-meddelelser, som du vil udsende som enkelte react-intl-enheder. Udfladning løfter plural- og select-grene op til specialiserede oversættelsesworkflows; det er ikke standarden for runtime-kataloger.

## Trin 2: tilknyt kataloger i `i18n.yml`

Opret `i18n.yml` i roden af repositoriet (eller under din app-mappe, hvis monorepoet holder konfigurationen ved siden af brugergrænsefladen):

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

Hyperlocalise behandler FormatJS JSON som førsteklasses indhold: hver nøgle er et meddelelses-id, og hver værdi indeholder `defaultMessage` og eventuelt `description`. ICU-strenge forbliver én værdi pr. id – `run`, `check` og synkronisering opdeler dem ikke i sætninger.

Fastlås CLI-versionen i `i18n.yml` (eller fastlås installationshandlingen), så lokale maskiner og GitHub Actions kører samme ekstraktor og validatorer.

## Trin 3: udtræk kildekataloget med CLI'en

Fra mappen, der indeholder `i18n.yml`, opdater det engelske katalog:

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

`extract` gennemgår `.ts` og `.tsx` for deskriptorer i:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Den skriver FormatJS-JSON i et strengt format:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

Hvis en descriptor udelader `id`, genererer CLI'en en FormatJS-kompatibel hash ud fra `defaultMessage` og `description`. Eksplicitte id'er er lettere at gennemgå i diff'er og i Hyperlocalise.

Commit `lang/en-US.json` sammen med kodeændringen. Behandl et manglende commit med udtrækket på samme måde som en manglende migration: Platformen ser aldrig nye strenge, før kataloget er opdateret.

Valgfrit: `--prefix-id` tilføjer den normaliserede filsti som præfiks til id'er (`src.components.saved-filters-banner.title`). Brug den sammen med `hl pack --prefix-id`, når runtime-pakker forventer korte id'er. Eksemplerne her bruger i stedet stabile logiske id'er.

## Trin 4: beskyt pull requests med extract og `check`

Tilføj `.github/workflows/localise.yml`:

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

To gates arbejder sammen:

1. **Afvigelse i udtræk** — hvis nogen redigerer `defaultMessage` i koden, men glemmer `hl extract`, fejler jobbet på `git diff`.
2. **`hyperlocalise check`** — validerer sammen med `github-diff: true` ændrede nøgler i `lang/en-US.json` og mål for problemer som `not_localized`, `placeholder_mismatch` og **`icu_shape_mismatch`**.

Det sidste tjek er vigtigt for ICU: En fransk streng, der udelader `{count, plural, ...}` eller bytter om på grenene, kan se fin ud for et menneske, der skimmer JSON, men vil fejle ved kørsel. Det er billigere at opdage formafvigelser i CI end i produktion.

Kør de samme kontroller lokalt, før du sender ændringerne:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Trin 5: push det udtrukne katalog efter sammenfletningen

Tilføj et push-job til den samme arbejdsgang:

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

Efter sammenfletning uploader `hl sync push` `lang/en-US.json` til det tilknyttede Hyperlocalise-projekt. Hvis extract køres igen på `main`, undgås en kapløbstilstand, hvor kode flettes sammen uden et tilsvarende katalog i Git.

Brug `hl sync push --dry-run`, når du ændrer bucket-stier eller lokalelister.

## Trin 6: Gennemgå ICU-meddelelser i Hyperlocalise

Oversættere bør se den fulde ICU-meddelelse, ikke isolerede engelske tekstfragmenter. Under gennemgangen skal man stille lokalitetsspecifikke spørgsmål, som ICU skjuler i en enkelt streng:

| Meddelelse                  | Gennemgangsspørgsmål                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Lyder grenene `=0`, `one` og `other` naturlige? Udvides `#` korrekt i henhold til hvert sprogområdes flertalsregler? |
| `filters.banner.scope`      | Dækker `select` alle `scope`-værdier, som appen sender? Er `other` en sikker fallback?                               |
| Korte etiketter             | Passer de oversatte tekster stadig på knapperne efter pluralisudvidelse?                                             |

Vedhæft skærmbilleder, når der forekommer en flertalsgren i et layout med begrænset plads. Hyperlocalise opbevarer ordliste og projektinstruktioner sammen med segmentet – CLI'en flytter kun filer.

Godkend oversættelserne på platformen, før du henter dem tilbage. Godkendelsen er sprogporten; Git registrerer, hvad der faktisk bliver udgivet.

## Trin 7: hent oversættelserne, og pak dem til runtime

Tilføj et manuelt pull-job:

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

`sync pull` skriver `lang/fr-FR.json` og `lang/de-DE.json` i FormatJS-format (id'er, `defaultMessage`, nogle gange `description`). `hl pack` fjerner `description` og andre metadata, samtidig med at ICU bevares i hver `defaultMessage` — klar til bundlere, der importerer JSON pr. lokalitet.

Eksempel på en pakket fransk post:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Åbn oversættelses-pull requesten i appen, skift lokaliteter, og test `count = 0`, `count = 1` og `count = 5`. ICU-regressioner viser sig ofte kun med ikke-engelske pluralregler.

## Trin 8: Indlæs kataloger i appen

Importér de pakkede lokalefiler, og tilknyt dem til `IntlProvider` eller `createIntl`:

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

Nogle teams beholder kun engelske standardværdier i kildekoden og indlæser kun JSON for målsprogene – begge mønstre fungerer, hvis `defaultMessage` i koden og `lang/en-US.json` holdes synkroniseret via extract.

## Sådan fungerer hele forløbet

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

Extract forbinder kode med kataloger. Sync forbinder kataloger med reviewere. Pack forbinder gennemgået JSON med din bundle.

## Almindelige fejltilstande

### Pull request mislykkes på grund af forskydning i ekstraktet

Kør `hl extract` lokalt med de samme `--ignore`-mønstre som i CI, commit `lang/en-US.json`, og push. Hvis id'er springer uventet, skal du bekræfte, at descriptors indeholder stabile `id`-felter.

### `icu_shape_mismatch` på en ellers “god” oversættelse

Sammenlign rækkefølgen af brancher og pladsholdernavne med `en-US`. Kør `hl check --check icu_shape_mismatch --locale fr-FR` lokalt. Ret mål-JSON'en, eller send segmentet tilbage til gennemgang – undertryk ikke kontrollen for reelle ICU-meddelelser.

### Runtime viser `MISSING_TRANSLATION` eller engelsk på målsproget

Bekræft, at pull requesten med oversættelserne blev flettet, at `hl pack` blev kørt, og at imports peger på de pakkede filer. Kontrollér, at message-id'er i koden stemmer overens med nøglerne i JSON (herunder eventuelle konventioner for `--prefix-id`).

### `hl sync pull` ændrer intet

Bekræft godkendelser i projektet, der henvises til af `HYPERLOCALISE_PROJECT_ID`. Kør `hl sync pull --dry-run`. Sørg for, at stierne til `i18n.yml` `to:` stemmer overens med, hvor appen importerer kataloger.

### Pakkede filer fjernede ved en fejl ICU.

Brug standardværdien `hl pack` på FormatJS JSON – den bevarer `defaultMessage` intakt. Kør ikke pack med workflows beregnet til almindelig indlejret JSON, medmindre det er den struktur, dit katalog har.

## Tjekliste for udgivelse

Før du lancerer en funktion, der afhænger af ny tekst:

- [ ] Meddelelsesbeskrivelser flettet sammen med udtrukne `lang/en-US.json`
- [ ] Pull request-udtræk og `hyperlocalise check` bestået
- [ ] `hl sync push` kørte på `main`
- [ ] Mållokaliteter gennemgået og godkendt i Hyperlocalise
- [ ] Pull request for oversættelsen er flettet sammen (`sync pull` + `pack`)
- [ ] Manuel QA af plural- og `select`-grene pr. lokalitet
- [ ] Produktionsudrulningen bruger de sammenflettede `lang/*.json` artefakter

## Hold extract orienteret.

React Intl tilskynder til at placere tekst sammen med komponenterne; Hyperlocalise tilskynder til oversættelser, der er gennemgået og gemt i filer. Kommandoen **`hl extract`** bygger bro mellem de to verdener uden at indføre en separat FormatJS-CLI til grundlæggende kataloger.

Brug **`check`** til at beskytte ICU-strukturen i pull requests. Brug **sync** til reviewer-arbejdsgangen. Brug **`pack`**, så produktionsbundterne forbliver slanke, mens oversættere bevarer rige metadata i Git mellem pulls.

Hvis du vil have et bredere indblik i GitHubs udgivelsesforløb – herunder Markdown-udgivelsesnoter sammen med UI-tekster – kan du fortsætte med [GitHubs lokaliseringsworkflow: fra pull request til flersproget udgivelse](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) eller [udforske produktlokalisering på Hyperlocalise](/use-cases/product-localisation).
