---
title: "React Intl og ICU-lokalisering: Udtræk, synkronisér og gennemgå med Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: Integrer react-intl og ICU-meddelelsessyntaks i en arbejdsgang, der passer til repoet – udtræk kataloger med Hyperlocalise CLI, valider pluralisformer i pull requests, gennemgå dem i Hyperlocalise, og udrul oversat JSON til produktion.
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

React Intl holder brugerrettet tekst i TypeScript, men oversættere og CI har brug for et stabilt katalog på disken. ICU-syntaks – flertalsformer, select-udtryk, tal og datoer – skal overleve denne overdragelse uden at gå i stykker under kørsel.

Denne vejledning viser, hvordan du samler **react-intl**, **ICU** og **`hyperlocalise` CLI** i én arbejdsgang:

1. Ingeniører skriver beskeder i `defineMessages` og `<FormattedMessage />`.
2. `hl extract` opdaterer det engelske FormatJS-katalog fra kilden.
3. GitHub kontrollerer pull requesten for afvigelser, manglende nøgler og problemer med ICU-strukturen.
4. `hl sync push` sender kataloget til Hyperlocalise til gennemgang.
5. `hl sync pull` og `hl pack` bringer gennemgåede oversættelser tilbage til `lang/*.json` for din app.

Mønstret viser, hvordan Hyperlocalise selv bruger sin egen webapp. For udgivelsesnoter og ikke-React-JSON i samme repository skal du kombinere denne vejledning med [GitHub-lokaliseringsworkflowet fra pull request til flersproget udgivelse](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Hvad vi vil bygge

Antag en Next.js- eller Vite React-app med denne mappestruktur:

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

Engelsk (`en-US`) er kildesproget. Fransk og tysk er målsprog. Meddelelses-id'er og værdier for `defaultMessage` findes i `*.messages.ts`-filer (klientmoduler) og i lejlighedsvise inline-deskriptorer. Det er den udtrukne JSON, Hyperlocalise synkroniserer; mange apps importerer den pakkede JSON ved kørsel.

Du skal bruge:

- et Hyperlocalise-projekt med `en-US` som kilde og dine målsprog;
- `HYPERLOCALISE_API_KEY` og `HYPERLOCALISE_PROJECT_ID` som GitHub Actions-hemmeligheder; og
- `react-intl` (eller `@formatjs/intl`) allerede installeret i appen.

## Trin 1: Skriv ICU-bevidste react-intl-meddelelser

Hold produkttekster i meddelelsesbeskrivelser, ikke spredt ud som strengliteraler. Brug eksplicitte id'er, så udtræk og gennemgang forbliver stabile, når formuleringerne ændres.

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

Brug ICU inde i `defaultMessage`, når teksten afhænger af tal eller enumværdier. React Intl evaluerer hele meddelelsen under kørsel; oversættere skal bevare `{count, plural, ...}`- og `{scope, select, ...}`-skeletterne, mens de ændrer de menneskeligt læsbare grene.

I en sidekomponent skal du videregive ICU-værdier via `formatMessage` eller `<FormattedMessage />`:

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

**Serverkomponenter:** Importér ikke `*.messages.ts` fra server-only-moduler—`defineMessages` er kun til klienten. Markér enten brugergrænsefladen som `"use client"`, eller brug inline-`{ id, defaultMessage, description }`-objekter med `getIntlShape(locale).formatMessage()` på serveren. Se dit frameworks react-intl-grænser; udtrækningstrinnet finder stadig deskriptorer i de `.ts`- og `.tsx`-filer, det scanner.

Undgå `--flatten` for ICU-meddelelser, som du vil levere som enkelte react-intl-enheder. Udfladning løfter plural- og select-grene frem til specialiserede oversættelsesworkflows; det er ikke standarden for runtime-kataloger.

## Trin 2: tilknyt kataloger i `i18n.yml`

Opret `i18n.yml` i repositoryets rod (eller under din app-mappe, hvis monorepoet holder konfigurationen ved siden af UI'et):

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

Hyperlocalise behandler FormatJS JSON som førsteklasses indhold: hver nøgle er et meddelelses-id, og hver værdi indeholder `defaultMessage` og eventuelt `description`. ICU-strenge forbliver én værdi pr. id—`run`, `check` og sync opdeler dem ikke i sætninger.

Fastlås CLI-versionen i `i18n.yml` (eller fastlås installationshandlingen), så lokale maskiner og GitHub Actions kører den samme udtrækker og de samme validatorer.

## Trin 3: Udtræk kildekataloget med CLI'en

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

`extract` søger i `.ts` og `.tsx` efter beskrivelser i:

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

Commit `lang/en-US.json` sammen med kodeændringen. Behandl en manglende extract-commit på samme måde som en manglende migration: Platformen ser aldrig nye strenge, før kataloget opdateres.

Valgfrit: `--prefix-id` præfikser id'er med den normaliserede filsti (`src.components.saved-filters-banner.title`). Kombinér det med `hl pack --prefix-id`, når runtime-bundles forventer korte id'er. Eksemplerne her bruger stabile logiske id'er i stedet.

## Trin 4: Beskyt pull requests med extract og `check`

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

To gates fungerer sammen:

1. **Afvigelser i udtræk** — hvis nogen redigerer `defaultMessage` i koden, men glemmer `hl extract`, fejler jobbet på `git diff`.
2. **`hyperlocalise check`** — validerer sammen med `github-diff: true` ændrede nøgler i `lang/en-US.json` og mål for problemer såsom `not_localized`, `placeholder_mismatch` og **`icu_shape_mismatch`**.

Den sidste kontrol er vigtig for ICU: En fransk streng, der udelader `{count, plural, ...}` eller bytter om på grene, kan se fin ud for et menneske, der skimmer JSON, men vil fejle under kørsel. Det er billigere at opdage formændringer i CI end i produktion.

Kør de samme kontroller lokalt, før du pusher:

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

Efter en merge uploader `hl sync push` `lang/en-US.json` til det tilknyttede Hyperlocalise-projekt. Hvis extract køres igen på `main`, undgås en race condition, hvor kode flettes ind uden et tilsvarende katalog i Git.

Brug `hl sync push --dry-run`, når du ændrer bucket-stier eller locale-lister.

## Trin 6: Gennemgå ICU-meddelelser i Hyperlocalise

Oversættere bør se hele ICU-meddelelsen, ikke isolerede engelske fragmenter. Under gennemgangen skal du stille lokalitetsspecifikke spørgsmål, som ICU skjuler i en enkelt streng:

| Besked                     | Gennemgangsspørgsmål                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Lyder `=0`, `one` og `other`-grenene naturlige? Bliver `#` udvidet korrekt i henhold til hver locales pluralregler? |
| `filters.banner.scope`      | Dækker `select` alle `scope`-værdier, som appen sender? Er `other` en sikker fallback?                             |
| Korte etiketter                | Passer de oversatte strenge stadig i knapperne efter udvidelse af flertalsformer?                                                |

Vedhæft skærmbilleder, når en flertalsgren vises i et begrænset layout. Hyperlocalise gemmer ordlisten og projektinstruktionerne sammen med segmentet – CLI'en flytter kun filer.

Godkend oversættelserne på platformen, før du henter dem tilbage. Godkendelse er sproggaten; Git registrerer, hvad der faktisk bliver udgivet.

## Trin 7: Hent oversættelser og pak dem til runtime

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

`sync pull` skriver `lang/fr-FR.json` og `lang/de-DE.json` i FormatJS-format (id'er, `defaultMessage`, nogle gange `description`). `hl pack` fjerner `description` og andre metadata, samtidig med at ICU bevares i hver `defaultMessage` — klar til bundlere, der importerer JSON for hvert locale.

Eksempel på pakket fransk post:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Åbn pull requesten for oversættelsen i appen, skift sprog, og afprøv `count = 0`, `count = 1` og `count = 5`. ICU-regressioner opstår ofte kun med pluraliseringsregler, der ikke er engelske.

## Trin 8: indlæs kataloger i appen

Importér pakkede lokalefiler, og tilknyt dem til `IntlProvider` eller `createIntl`:

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

## Sådan fungerer hele flowet

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

Udtræk forbinder kode med kataloger. Synkronisering forbinder kataloger med korrekturlæsere. Pakning forbinder gennemgået JSON med din bundle.

## Almindelige fejltilstande

### Pull request mislykkes på grund af afvigelser i udtrækket

Kør `hl extract` lokalt med de samme `--ignore` mønstre som CI, commit `lang/en-US.json`, og push. Hvis id'er springer uventet, skal du bekræfte, at deskriptorerne indeholder stabile `id` felter.

### `icu_shape_mismatch` i en ellers “god” oversættelse

Sammenlign rækkefølgen af grene og pladsholdernavne med `en-US`. Kør `hl check --check icu_shape_mismatch --locale fr-FR` lokalt. Ret mål-JSON'en, eller send segmentet tilbage til gennemgang – undertryk ikke kontrollen for reelle ICU-meddelelser.

### Runtime viser `MISSING_TRANSLATION` eller engelsk på målsproget

Bekræft, at oversættelses-pull requesten blev flettet, at `hl pack` blev kørt, og at importer peger på de pakkede filer. Kontrollér, at meddelelses-id'er i koden matcher nøglerne i JSON (herunder eventuel `--prefix-id`-konvention).

### `hl sync pull` ændrer intet

Bekræft godkendelser i det projekt, der henvises til i `HYPERLOCALISE_PROJECT_ID`. Kør `hl sync pull --dry-run`. Sørg for, at `i18n.yml` `to:`-stierne stemmer overens med, hvor appen importerer kataloger.

### Pakkede filer fik ved en fejl fjernet ICU

Brug standardindstillingen `hl pack` på FormatJS JSON – den holder `defaultMessage` intakt. Kør ikke pack med workflows, der er beregnet til almindelig indlejret JSON, medmindre det er sådan, dit katalog er opbygget.

## Tjekliste til udgivelse

Inden du lancerer en funktion, der afhænger af ny tekst:

- [ ] Meddelelsesbeskrivelser flettet sammen med udtrukne `lang/en-US.json`
- [ ] Pull request-udtræk og `hyperlocalise check` bestået
- [ ] `hl sync push` blev kørt den `main`
- [ ] Målsprog gennemgået og godkendt i Hyperlocalise
- [ ] Oversættelses-pull request flettet (`sync pull` + `pack`)
- [ ] Manuel QA af flertals- og `select`-grene pr. locale
- [ ] Produktionsudrulningen bruger de sammenflettede `lang/*.json` artefakter

## Hold extractet informeret.

React Intl tilskynder til at placere tekst tæt på koden; Hyperlocalise tilskynder til gennemgåede, filbaserede oversættelser. Kommandoen **`hl extract`** bygger bro mellem de to verdener uden at indføre en separat FormatJS CLI til basale kataloger.

Brug **`check`** til at beskytte ICU-strukturen i pull requests. Brug **sync** i reviewernes arbejdsgang. Brug **`pack`** til at holde produktionsbundterne slanke, mens oversætterne bevarer omfattende metadata i Git mellem pulls.

Hvis du vil have et bredere indblik i GitHubs udgivelsesproces – inklusive Markdown-udgivelsesnoter sammen med UI-strenge – kan du fortsætte med [GitHubs lokaliseringsworkflow: fra pull request til flersproget udgivelse](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) eller [udforske produktlokalisering på Hyperlocalise](/use-cases/product-localisation).
