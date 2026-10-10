---
title: "React Intl en ICU-lokalisatie: extraheren, synchroniseren en beoordelen met Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: "Integreer react-intl en de ICU-berichtsyntaxis in een workflow die eigen is aan je repository: haal catalogi op met de Hyperlocalise CLI, valideer meervoudsvormen in pull requests, beoordeel ze in Hyperlocalise en rol vertaalde JSON uit naar productie."
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

React Intl houdt gebruikersgerichte teksten in TypeScript, maar vertalers en CI hebben een stabiele catalogus op schijf nodig. ICU-syntaxis—meervoudsvormen, selecties, getallen en datums—moet tijdens die overdracht behouden blijven zonder tijdens runtime problemen te veroorzaken.

Deze handleiding laat zien hoe je **react-intl**, **ICU** en de **`hyperlocalise` CLI** met elkaar verbindt in één workflow:

1. Ingenieurs schrijven berichten in `defineMessages` en `<FormattedMessage />`.
2. `hl extract` ververst de Engelse FormatJS-catalogus vanuit de bron.
3. GitHub controleert de pull request op afwijkingen, ontbrekende sleutels en problemen met de ICU-structuur.
4. `hl sync push` stuurt de catalogus naar Hyperlocalise ter beoordeling.
5. `hl sync pull` en `hl pack` brengen nagekeken vertalingen terug naar `lang/*.json` voor je app.

Het patroon sluit aan bij hoe Hyperlocalise zijn eigen webapp gebruikt. Voor releaseopmerkingen en niet-React-JSON in dezelfde repository combineer je deze tutorial met de [GitHub-localisatieworkflow van pull request tot meertalige release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Wat we gaan bouwen

Ga uit van een Next.js- of Vite React-app met deze structuur:

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

Engels (`en-US`) is de brontaal. Frans en Duits zijn doeltalen. Bericht-ID's en `defaultMessage`-waarden staan in `*.messages.ts`-bestanden (clientmodules) en soms in inline descriptors. De geëxtraheerde JSON is wat Hyperlocalise synchroniseert; de verpakte JSON is wat veel apps tijdens runtime importeren.

Je hebt nodig:

- een Hyperlocalise-project met `en-US` als bron en je doellokalisaties;
- en `HYPERLOCALISE_API_KEY` en `HYPERLOCALISE_PROJECT_ID` als GitHub Actions-secrets; en
- `react-intl` (of `@formatjs/intl`) is al geïnstalleerd in de app.

## Stap 1: schrijf ICU-bewuste react-intl-berichten

Houd productteksten in berichtdescriptors, niet verspreid over tekenreeksliterals. Gebruik expliciete ID's zodat het extraheren en beoordelen stabiel blijft wanneer de bewoording verandert.

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

Gebruik ICU binnen `defaultMessage` wanneer de tekst afhankelijk is van getallen of enumeraties. React Intl evalueert het volledige bericht tijdens runtime; vertalers moeten de skeletstructuren `{count, plural, ...}` en `{scope, select, ...}` behouden en de voor mensen leesbare vertakkingen aanpassen.

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

**Servercomponenten:** importeer `*.messages.ts` niet vanuit modules die alleen op de server draaien—`defineMessages` is alleen voor de client. Markeer de UI als `"use client"` of gebruik inline `{ id, defaultMessage, description }`-objecten met `getIntlShape(locale).formatMessage()` op de server. Raadpleeg de grenzen van react-intl in je framework; de extractiestap vindt nog steeds descriptors in `.ts`- en `.tsx`-bestanden die deze scant.

Vermijd `--flatten` bij ICU-berichten die je als afzonderlijke react-intl-eenheden wilt uitbrengen. Flattening tilt plural- en select-vertakkingen eruit voor gespecialiseerde vertaalworkflows; dit is niet de standaard voor runtimecatalogi.

## Stap 2: catalogi toewijzen in `i18n.yml`

Maak `i18n.yml` aan in de hoofdmap van de repository (of in je appmap als de monorepo de configuratie naast de UI bewaart):

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

Hyperlocalise behandelt FormatJS JSON als volwaardige content: elke sleutel is een bericht-ID, elke waarde bevat `defaultMessage` en optioneel `description`. ICU-strings blijven één waarde per ID—`run`, `check` en synchronisatie splitsen ze niet op in zinnen.

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

`extract` doorzoekt `.ts` en `.tsx` naar descriptors in:

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

Als een descriptor `id` weglaat, genereert de CLI een met FormatJS compatibele hash op basis van `defaultMessage` en `description`. Expliciete id's zijn gemakkelijker te beoordelen in diffs en in Hyperlocalise.

Commit `lang/en-US.json` samen met de codewijziging. Behandel een ontbrekende extractiecommit hetzelfde als een ontbrekende migratie: het platform ziet nieuwe strings pas wanneer de catalogus wordt bijgewerkt.

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

Twee poorten werken samen:

1. **Extractafwijking** — als iemand `defaultMessage` in de code wijzigt maar `hl extract` vergeet, mislukt de taak op `git diff`.
2. **`hyperlocalise check`** — controleert samen met `github-diff: true` gewijzigde sleutels in `lang/en-US.json` en doelen op problemen zoals `not_localized`, `placeholder_mismatch` en **`icu_shape_mismatch`**.

Die laatste controle is belangrijk voor ICU: een Franse string waarin `{count, plural, ...}` ontbreekt of waarvan de vertakkingen zijn verwisseld, lijkt misschien prima voor iemand die JSON vluchtig doorneemt, maar faalt tijdens runtime. Vormafwijkingen in CI opsporen is goedkoper dan ze in productie ontdekken.

Voer dezelfde controles lokaal uit voordat je pusht:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Stap 5: push de geëxtraheerde catalogus na het samenvoegen

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

Na het mergen uploadt `hl sync push` `lang/en-US.json` naar het gekoppelde Hyperlocalise-project. Door extract opnieuw uit te voeren op `main` voorkom je een race waarbij code wordt gemerged zonder een bijbehorende catalogus in Git.

Gebruik `hl sync push --dry-run` wanneer je bucketpaden of locatielijsten wijzigt.

## Stap 6: ICU-berichten in Hyperlocalise controleren

Vertalers moeten het volledige ICU-bericht zien, niet alleen losse Engelse fragmenten. Stel tijdens de beoordeling vragen over taalspecifieke zaken die ICU in één tekenreeks verbergt:

| Bericht                     | Beoordelingsvraag                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Klinken de vertakkingen voor `=0`, `one` en `other` natuurlijk? Wordt `#` correct uitgebreid volgens de meervoudsregels van elke locale? |
| `filters.banner.scope`      | Dekt `select` elke `scope`-waarde die de app verstuurt? Is `other` een veilige terugvaloptie?                             |
| Korte labels                | Passen vertaalde strings na uitbreiding voor meervoudsvormen nog steeds op knoppen?                                                |

Voeg screenshots toe wanneer er een meervoudstak voorkomt in een lay-out met beperkte ruimte. Hyperlocalise bewaart de woordenlijst en projectinstructies bij het segment; de CLI verplaatst alleen bestanden.

Keur vertalingen goed op het platform voordat je ze terughaalt. Goedkeuring is de taalpoort; Git legt vast wat er daadwerkelijk wordt uitgebracht.

## Stap 7: vertalingen ophalen en verpakken voor gebruik tijdens runtime

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

`sync pull` schrijft `lang/fr-FR.json` en `lang/de-DE.json` in FormatJS-indeling (ID's, `defaultMessage`, soms `description`). `hl pack` verwijdert `description` en andere metadata, met behoud van ICU in elke `defaultMessage`—klaar voor bundlers die JSON per locale importeren.

Voorbeeld van een ingepakte Franse vermelding:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Open de vertaal-pullrequest in de app, wissel van locale en test `count = 0`, `count = 1` en `count = 5`. ICU-regressies komen vaak alleen voor bij niet-Engelse meervoudsregels.

## Stap 8: catalogi laden in de app

Importeer verpakte lokalisatiebestanden en map ze naar `IntlProvider` of `createIntl`:

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

Sommige teams bewaren Engelse standaardwaarden alleen in de broncode en laden alleen JSON voor doeltalen—beide patronen werken zolang `defaultMessage` in de code en `lang/en-US.json` via extract op elkaar afgestemd blijven.

## Hoe de volledige flow werkt

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

Extract verbindt code met catalogi. Sync verbindt catalogi met reviewers. Pack verbindt beoordeelde JSON met je bundel.

## Veelvoorkomende faalwijzen

### Pull request mislukt door extract drift

Voer `hl extract` lokaal uit met dezelfde `--ignore`-patronen als CI, commit `lang/en-US.json` en push. Als ids onverwacht verspringen, controleer dan of descriptors stabiele `id`-velden bevatten.

### `icu_shape_mismatch` op een verder ‘goede’ vertaling

Vergelijk de volgorde van vertakkingen en de placeholdernamen met `en-US`. Voer `hl check --check icu_shape_mismatch --locale fr-FR` lokaal uit. Herstel de doel-JSON of stuur het segment terug ter beoordeling—schakel de controle niet uit voor echte ICU-berichten.

### Runtime toont `MISSING_TRANSLATION` of Engels in een doeltaal.

Bevestig dat de pull request voor de vertaling is samengevoegd, `hl pack` is uitgevoerd en de imports naar de ingepakte bestanden verwijzen. Controleer of de bericht-ID's in de code overeenkomen met de sleutels in JSON (inclusief eventuele `--prefix-id`-conventie).

### `hl sync pull` verandert niets

Bevestig goedkeuringen in het project waarnaar `HYPERLOCALISE_PROJECT_ID` verwijst. Voer `hl sync pull --dry-run` uit. Zorg ervoor dat de paden `i18n.yml` `to:` overeenkomen met de locaties waar de app catalogi importeert.

### Ingepakte bestanden hebben ICU per ongeluk gestript

Gebruik standaard `hl pack` voor FormatJS JSON—hiermee blijft `defaultMessage` intact. Voer pack niet uit met workflows voor gewone geneste JSON, tenzij dat de vorm van je catalogus is.

## Releasechecklist

Voordat je een functie uitbrengt die afhankelijk is van nieuwe teksten:

- [ ] Berichtbeschrijvingen samengevoegd met geëxtraheerde `lang/en-US.json`
- [ ] Pull request-extract en `hyperlocalise check` geslaagd
- [ ] `hl sync push` uitgevoerd op `main`
- [ ] Doellocales beoordeeld en goedgekeurd in Hyperlocalise
- [ ] Pull request voor vertaling samengevoegd (`sync pull` + `pack`)
- [ ] Handmatige QA van meervouds- en `select`-vertakkingen per locale
- [ ] Productie-implementatie gebruikt de samengevoegde `lang/*.json` artefacten

## Houd extract op de hoogte.

React Intl moedigt aan om teksten bij de componenten te plaatsen; Hyperlocalise moedigt beoordeelde, bestandsgebaseerde vertalingen aan. De **`hl extract`**-opdracht slaat een brug tussen die werelden zonder voor basiscatalogi een afzonderlijke FormatJS CLI te gebruiken.

Gebruik **`check`** om de ICU-structuur in pull requests te beschermen. Gebruik **sync** voor de workflow van reviewers. Gebruik **`pack`** zodat productie-bundels compact blijven, terwijl vertalers tussen pulls uitgebreide metadata in Git behouden.

Voor een uitgebreider verhaal over GitHub-releases — inclusief Markdown-releasenotities naast UI-teksten — ga verder met [GitHub-lokalisatieworkflow: van pullrequest tot meertalige release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), of [ontdek productlokalisatie op Hyperlocalise](/use-cases/product-localisation).
