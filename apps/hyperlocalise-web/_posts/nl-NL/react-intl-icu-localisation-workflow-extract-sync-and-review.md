---
title: "Lokalisatie met React Intl en ICU: extraheren, synchroniseren en beoordelen met Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: Integreer react-intl en de ICU-berichtsyntaxis in een repository-eigen workflow—extraheer catalogi met de Hyperlocalise CLI, valideer meervoudsvormen in pull requests, beoordeel ze in Hyperlocalise en lever vertaalde JSON aan productie.
category: Techniek
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

React Intl bewaart gebruikersgerichte teksten in TypeScript, maar vertalers en CI hebben een stabiele catalogus op schijf nodig. ICU-syntaxis—meervouden, selecties, getallen en datums—moet die overdracht doorstaan zonder tijdens runtime problemen te veroorzaken.

Deze handleiding laat zien hoe je **react-intl**, **ICU** en de **`hyperlocalise` CLI** in één workflow kunt combineren:

1. Ingenieurs schrijven berichten in `defineMessages` en `<FormattedMessage />`.
2. `hl extract` ververst de Engelse FormatJS-catalogus vanuit de bron.
3. GitHub controleert de pull request op afwijkingen, ontbrekende sleutels en problemen met de ICU-structuur.
4. `hl sync push` stuurt de catalogus naar Hyperlocalise ter beoordeling.
5. `hl sync pull` en `hl pack` zetten gecontroleerde vertalingen terug in `lang/*.json` voor je app.

Dit patroon laat zien hoe Hyperlocalise zijn eigen webapp gebruikt. Combineer deze tutorial voor releaseopmerkingen en niet-React-JSON in dezelfde repository met de [GitHub-localisatieworkflow van pull request tot meertalige release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Wat we gaan bouwen

Stel dat een Next.js- of Vite React-app deze structuur heeft:

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

Engels (`en-US`) is de brontaal. Frans en Duits zijn doeltalen. Bericht-ID's en `defaultMessage`-waarden staan in `*.messages.ts`-bestanden (clientmodules) en soms in inline descriptors. De geëxtraheerde JSON is wat Hyperlocalise synchroniseert; veel apps importeren de verpakte JSON tijdens runtime.

Je hebt nodig:

- een Hyperlocalise-project met `en-US` als bron en je doeltalen;
- en `HYPERLOCALISE_API_KEY` en `HYPERLOCALISE_PROJECT_ID` als GitHub Actions-geheimen; en
- `react-intl` (of `@formatjs/intl`) is al geïnstalleerd in de app.

## Stap 1: schrijf ICU-bewuste react-intl-berichten

Houd productteksten in berichtdescriptors, niet verspreid over tekenreeksliterals. Gebruik expliciete ID's zodat extractie en beoordeling stabiel blijven wanneer de formulering verandert.

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

Gebruik ICU binnen `defaultMessage` wanneer de tekst afhankelijk is van getallen of enumwaarden. React Intl evalueert het volledige bericht tijdens runtime; vertalers moeten de skeletten `{count, plural, ...}` en `{scope, select, ...}` behouden en de voor mensen leesbare vertakkingen aanpassen.

Geef in een paginacomponent ICU-waarden door via `formatMessage` of `<FormattedMessage />`:

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

**Servercomponenten:** importeer `*.messages.ts` niet vanuit server-only-modules—`defineMessages` is alleen beschikbaar aan de clientzijde. Markeer de UI als `"use client"` of gebruik inline `{ id, defaultMessage, description }`-objecten met `getIntlShape(locale).formatMessage()` op de server. Raadpleeg de react-intl-grenzen van je framework; de extractiestap vindt nog steeds descriptors in de bestanden `.ts` en `.tsx` die hij doorzoekt.

Vermijd `--flatten` bij ICU-berichten die je als afzonderlijke react-intl-eenheden wilt uitbrengen. Afvlakken tilt meervouds- en selectietakken naar een hoger niveau voor gespecialiseerde vertaalworkflows; dit is niet de standaard voor runtimecatalogi.

## Stap 2: catalogi toewijzen in `i18n.yml`

Maak `i18n.yml` aan in de hoofdmap van de repository (of onder je appmap als de monorepo de configuratie naast de UI bewaart):

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

Hyperlocalise behandelt FormatJS JSON als eersteklas content: elke sleutel is een bericht-ID, elke waarde bevat `defaultMessage` en optioneel `description`. ICU-strings blijven één waarde per ID—`run`, `check` en sync splitsen ze niet op in zinnen.

Zet de CLI-versie vast in `i18n.yml` (of zet de installatieactie vast), zodat lokale machines en GitHub Actions dezelfde extractor en validators uitvoeren.

## Stap 3: extraheer de broncatalogus met de CLI

Vernieuw vanuit de map die `i18n.yml` bevat de Engelse catalogus:

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

`extract` doorzoekt `.ts` en `.tsx` op beschrijvingen in:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Het schrijft strikte FormatJS-JSON:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

Als een descriptor `id` weglaat, genereert de CLI een FormatJS-compatibele hash van `defaultMessage` en `description`. Expliciete id's zijn gemakkelijker te beoordelen in diffs en in Hyperlocalise.

Commit `lang/en-US.json` samen met de codewijziging. Behandel een ontbrekende extract-commit net zoals een ontbrekende migratie: het platform ziet pas nieuwe strings wanneer de catalogus wordt bijgewerkt.

Optioneel: `--prefix-id` voegt het genormaliseerde bestandspad (`src.components.saved-filters-banner.title`) toe aan het begin van ID's. Combineer dit met `hl pack --prefix-id` wanneer runtimebundels korte ID's verwachten. De voorbeelden hier gebruiken in plaats daarvan stabiele logische ID's.

## Stap 4: beveilig pull requests met extract en `check`

Voeg `.github/workflows/localise.yml` toe:

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

Twee controles werken samen:

1. **Extractdrift** — als iemand `defaultMessage` in code bewerkt maar `hl extract` vergeet, mislukt de job op `git diff`.
2. **`hyperlocalise check`** — valideert samen met `github-diff: true` gewijzigde sleutels in `lang/en-US.json` en doeltalen op problemen zoals `not_localized`, `placeholder_mismatch` en **`icu_shape_mismatch`**.

Die laatste controle is belangrijk voor ICU: een Franse tekenreeks waarin `{count, plural, ...}` ontbreekt of vertakkingen zijn verwisseld, ziet er misschien goed uit voor iemand die snel door JSON scrolt, maar mislukt tijdens runtime. Afwijkingen in de structuur opsporen in CI is goedkoper dan ze in productie opsporen.

Voer dezelfde controles lokaal uit voordat je pusht:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Stap 5: push de geëxtraheerde catalogus na het mergen

Voeg een push-taak toe aan dezelfde workflow:

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

Na het mergen uploadt `hl sync push` `lang/en-US.json` naar het gekoppelde Hyperlocalise-project. extract opnieuw uitvoeren op `main` voorkomt een raceconditie waarbij code wordt gemerged zonder een bijbehorende catalogus in Git.

Gebruik `hl sync push --dry-run` wanneer je bucketpaden of locale-lijsten wijzigt.

## Stap 6: ICU-berichten in Hyperlocalise beoordelen

Vertalers moeten het volledige ICU-bericht zien, niet afzonderlijke Engelse fragmenten. Stel tijdens de beoordeling de regiospecifieke vragen die ICU in één tekenreeks verbergt:

| Bericht                     | Beoordelingsvraag                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Klinken de `=0`-, `one`- en `other`-vertakkingen natuurlijk? Wordt `#` correct uitgebreid volgens de meervoudsregels van elke locale? |
| `filters.banner.scope`      | Dekt `select` elke `scope`-waarde die de app verzendt? Is `other` een veilige fallback?                             |
| Korte labels                | Passen vertaalde teksten na uitbreiding van meervoudsvormen nog steeds op knoppen?                                                |

Voeg screenshots toe wanneer er een meervoudstak voorkomt in een beperkte lay-out. Hyperlocalise bewaart de woordenlijst en projectinstructies bij het segment — de CLI verplaatst alleen bestanden.

Keur vertalingen goed op het platform voordat je ze terughaalt. Goedkeuring is de taalpoort; Git registreert wat daadwerkelijk wordt uitgebracht.

## Stap 7: vertalingen ophalen en verpakken voor runtime

Voeg een handmatige pull-taak toe:

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

`sync pull` schrijft `lang/fr-FR.json` en `lang/de-DE.json` weg in de FormatJS-vorm (ID's, `defaultMessage`, soms `description`). `hl pack` verwijdert `description` en andere metadata, met behoud van ICU in elke `defaultMessage`—klaar voor bundlers die JSON per locale importeren.

Voorbeeld van een verpakte Franse vermelding:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Open de vertaalpullrequest in de app, schakel van locale en test `count = 0`, `count = 1` en `count = 5`. ICU-regressies komen vaak alleen voor bij niet-Engelse meervoudsregels.

## Stap 8: laad catalogi in de app

Importeer de gebundelde taalbestanden en wijs ze toe aan `IntlProvider` of `createIntl`:

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

Sommige teams houden Engelse standaardwaarden uitsluitend in de broncode en laden alleen JSON voor doeltalen—beide patronen werken zolang `defaultMessage` in de code en `lang/en-US.json` via extract op elkaar afgestemd blijven.

## Hoe de volledige stroom werkt

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

Extract koppelt code aan catalogi. Sync koppelt catalogi aan reviewers. Pack koppelt nagekeken JSON aan je bundel.

## Veelvoorkomende faalmodi

### Pull request mislukt door afwijkingen bij het extraheren

Voer `hl extract` lokaal uit met dezelfde `--ignore`-patronen als CI, commit `lang/en-US.json` en push. Als ID's onverwacht verspringen, controleer dan of descriptors stabiele `id`-velden bevatten.

### `icu_shape_mismatch` in een verder ‘goede’ vertaling

Vergelijk de volgorde van de branches en de namen van de plaatsaanduidingen met `en-US`. Voer `hl check --check icu_shape_mismatch --locale fr-FR` lokaal uit. Herstel de doel-JSON of stuur het segment terug ter beoordeling — onderdruk de controle niet voor echte ICU-berichten.

### Runtime toont `MISSING_TRANSLATION` of Engels in een doeltaalregio.

Bevestig dat de pull request voor de vertaling is samengevoegd, `hl pack` is uitgevoerd en imports naar de gebundelde bestanden verwijzen. Controleer of bericht-ID's in de code overeenkomen met de sleutels in JSON (inclusief eventuele `--prefix-id`-conventie).

### `hl sync pull` verandert niets

Bevestig goedkeuringen in het project waarnaar `HYPERLOCALISE_PROJECT_ID` verwijst. Voer `hl sync pull --dry-run` uit. Zorg ervoor dat de paden voor `i18n.yml` `to:` overeenkomen met de locaties waar de app catalogi importeert.

### ICU is per ongeluk uit de ingepakte bestanden verwijderd

Gebruik de standaard `hl pack` op FormatJS JSON—hiermee blijft `defaultMessage` intact. Voer pack niet uit met workflows die bedoeld zijn voor gewone geneste JSON, tenzij dat de structuur van je catalogus is.

## Releasechecklist

Voordat je een functie uitbrengt die afhankelijk is van nieuwe tekst:

- [ ] Berichtbeschrijvingen samengevoegd met geëxtraheerde `lang/en-US.json`
- [ ] Pull request-extractie en `hyperlocalise check` zijn geslaagd
- [ ] `hl sync push` uitgevoerd op `main`
- [ ] Doellokalen beoordeeld en goedgekeurd in Hyperlocalise
- [ ] Pull request voor vertaling samengevoegd (`sync pull` + `pack`)
- [ ] Handmatige QA op meervouds- en `select`-vertakkingen per landinstelling
- [ ] De productie-implementatie gebruikt de samengevoegde `lang/*.json` artefacten

## Houd extract op de hoogte.

React Intl moedigt aan om teksten bij de code te plaatsen; Hyperlocalise moedigt gecontroleerde vertalingen aan die in bestanden zijn opgeslagen. De opdracht **`hl extract`** slaat een brug tussen die werelden, zonder voor basiscatalogi een aparte FormatJS CLI te gebruiken.

Gebruik **`check`** om de ICU-structuur in pull requests te beschermen. Gebruik **sync** voor de workflow van reviewers. Gebruik **`pack`** zodat productie-bundels compact blijven en vertalers tussen pulls door uitgebreide metadata in Git kunnen behouden.

Voor een uitgebreider verhaal over GitHub-releases, inclusief releaseopmerkingen in Markdown naast UI-strings, lees je verder over de [GitHub-localisatieworkflow: van pull request tot meertalige release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), of [ontdek je productlokalisatie op Hyperlocalise](/use-cases/product-localisation).
