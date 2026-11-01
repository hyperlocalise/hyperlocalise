---
title: "React Intl und ICU-Lokalisierung: Mit Hyperlocalise extrahieren, synchronisieren und überprüfen"
date: 2026-09-24T00:00:00.000Z
excerpt: "\"\\\\\"Integrieren Sie react-intl und die ICU-Nachrichtensyntax in einen repository-nativen Workflow: Extrahieren Sie Kataloge mit der Hyperlocalise-CLI, validieren Sie Pluralformen in Pull Requests, prüfen Sie die Übersetzungen in Hyperlocalise und liefern Sie übersetzte JSON-Dateien in die Produktion aus.\\\\\"\""
category: Technik
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

React Intl speichert nutzerseitige Texte in TypeScript, aber Übersetzer und CI benötigen einen stabilen Katalog auf der Festplatte. Die ICU-Syntax – Pluralformen, Selects, Zahlen und Datumsangaben – muss diese Übergabe unbeschadet überstehen, ohne zur Laufzeit Fehler zu verursachen.

Dieser Leitfaden zeigt, wie du **react-intl**, **ICU** und die **`hyperlocalise`-CLI** in einem Workflow miteinander verbindest:

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract` aktualisiert den englischen FormatJS-Katalog aus der Quelle.
3. GitHub prüft den Pull Request auf Abweichungen, fehlende Schlüssel und Probleme mit der ICU-Struktur.
4. `hl sync push` übermittelt den Katalog zur Überprüfung an Hyperlocalise.
5. `hl sync pull` und `hl pack` bringen geprüfte Übersetzungen für deine App zurück in `lang/*.json`.

Das Muster zeigt, wie Hyperlocalise die eigene Web-App selbst nutzt. Kombinieren Sie dieses Tutorial für Release Notes und Nicht-React-JSON im selben Repository mit dem [GitHub-Lokalisierungsworkflow vom Pull Request bis zum mehrsprachigen Release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Was wir bauen werden

Angenommen, eine Next.js- oder Vite-React-App hat folgenden Aufbau:

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

Englisch (`en-US`) ist das Quellgebietsschema. Französisch und Deutsch sind Zielsprachen. Nachrichten-IDs und `defaultMessage`-Werte befinden sich in `*.messages.ts`-Dateien (Client-Module) und gelegentlich in Inline-Deskriptoren. Hyperlocalise synchronisiert die extrahierten JSON-Dateien; viele Apps importieren die gepackten JSON-Dateien zur Laufzeit.

Sie benötigen:

- ein Hyperlocalise-Projekt mit `en-US` als Quelle und deinen Ziellokalen;
- `HYPERLOCALISE_API_KEY` und `HYPERLOCALISE_PROJECT_ID` als GitHub-Actions-Secrets; und
- `react-intl` (oder `@formatjs/intl`) bereits in der App installiert.

## Schritt 1: ICU-fähige react-intl-Nachrichten verfassen

Haltet Produkttexte in Message-Deskriptoren statt in verstreuten String-Literalen. Verwendet explizite IDs, damit Extraktion und Überprüfung stabil bleiben, wenn sich der Wortlaut ändert.

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

Verwende ICU innerhalb von `defaultMessage`, wenn der Text von Zahlen oder Enum-Werten abhängt. React Intl wertet die vollständige Nachricht zur Laufzeit aus; Übersetzer müssen die Skelette `{count, plural, ...}` und `{scope, select, ...}` beibehalten und die menschenlesbaren Zweige anpassen.

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

**Serverkomponenten:** Importiere `*.messages.ts` nicht aus nur serverseitigen Modulen – `defineMessages` ist nur für den Client vorgesehen. Markiere entweder die UI als `"use client"` oder verwende serverseitig Inline-`{ id, defaultMessage, description }`-Objekte mit `getIntlShape(locale).formatMessage()`. Siehe die Grenzen von react-intl in deinem Framework; der Extraktionsschritt findet weiterhin Deskriptoren in `.ts`- und `.tsx`-Dateien, die er scannt.

Vermeide `--flatten` bei ICU-Nachrichten, die als einzelne react-intl-Einheiten ausgeliefert werden sollen. Beim Flattening werden Plural- und Select-Zweige für spezialisierte Übersetzungsworkflows herausgelöst; für Laufzeitkataloge ist dies nicht die Standardeinstellung.

## Schritt 2: Kataloge zuordnen in `i18n.yml`

Erstelle `i18n.yml` im Stammverzeichnis des Repositorys (oder in deinem App-Verzeichnis, falls das Monorepo die Konfiguration neben der UI ablegt):

```yaml
version: hyperlocalise@1.13.7

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

Hyperlocalise behandelt FormatJS-JSON als Inhalte erster Klasse: Jeder Schlüssel ist eine Nachrichten-ID, jeder Wert enthält `defaultMessage` und optional `description`. ICU-Strings bleiben ein Wert pro ID – `run`, `check` und Sync teilen sie nicht in Sätze auf.

Fixieren Sie die CLI-Version in `i18n.yml` (oder fixieren Sie die Installationsaktion), damit lokale Rechner und GitHub Actions denselben Extraktor und dieselben Validatoren ausführen.

## Schritt 3: Den Quellkatalog mit der CLI extrahieren.

Aktualisieren Sie aus dem Verzeichnis, das `i18n.yml` enthält, den englischen Katalog:

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

`extract` durchsucht `.ts` und `.tsx` nach Deskriptoren in:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Es schreibt striktes FormatJS-JSON:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

Wenn ein Deskriptor `id` auslässt, erzeugt die CLI einen FormatJS-kompatiblen Hash aus `defaultMessage` und `description`. Explizite IDs lassen sich in Diffs und in Hyperlocalise leichter überprüfen.

Committe `lang/en-US.json` zusammen mit der Codeänderung. Behandle einen fehlenden Extract-Commit genauso wie eine fehlende Migration: Die Plattform sieht neue Zeichenfolgen erst, wenn der Katalog aktualisiert wird.

Optional: `--prefix-id` stellt IDs den normalisierten Dateipfad (`src.components.saved-filters-banner.title`) voran. Kombinieren Sie es mit `hl pack --prefix-id`, wenn Runtime-Bundles kurze IDs erwarten. Die Beispiele hier verwenden stattdessen stabile logische IDs.

## Schritt 4: Pull Requests mit extract und `check` absichern

Füge `.github/workflows/localise.yml` hinzu:

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

Zwei Prüfungen greifen ineinander:

1. **Extract-Drift** — wenn jemand `defaultMessage` im Code bearbeitet, aber `hl extract` vergisst, schlägt der Job bei `git diff` fehl.
2. **`hyperlocalise check`** — validiert zusammen mit `github-diff: true` geänderte Schlüssel in `lang/en-US.json` und Ziele auf Probleme wie `not_localized`, `placeholder_mismatch` und **`icu_shape_mismatch`**.

Diese letzte Prüfung ist für ICU wichtig: Eine französische Zeichenfolge, in der `{count, plural, ...}` fehlt oder deren Zweige vertauscht sind, mag beim flüchtigen Überfliegen des JSON für einen Menschen in Ordnung aussehen, schlägt aber zur Laufzeit fehl. Strukturabweichungen in der CI abzufangen ist günstiger, als sie erst in der Produktion zu entdecken.

Führe vor dem Push dieselben Prüfungen lokal aus:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Schritt 5: Den extrahierten Katalog nach dem Zusammenführen pushen

Füge demselben Workflow einen Push-Job hinzu:

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

Nach dem Zusammenführen lädt `hl sync push` `lang/en-US.json` in das verknüpfte Hyperlocalise-Projekt hoch. Das erneute Ausführen von extract für `main` verhindert eine Wettlaufsituation, bei der Code ohne einen entsprechenden Katalog in Git zusammengeführt wird.

Verwenden Sie `hl sync push --dry-run`, wenn Sie Bucket-Pfade oder Locale-Listen ändern.

## Schritt 6: ICU-Nachrichten in Hyperlocalise überprüfen

Übersetzer sollten die vollständige ICU-Nachricht sehen, nicht isolierte englische Fragmente. Bei der Überprüfung sollten sie lokalspezifische Fragen stellen, die ICU in einer einzelnen Zeichenfolge verbirgt:

| Nachricht                   | Prüfungsfrage                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Klingen die `=0`-, `one`- und `other`-Zweige natürlich? Wird `#` gemäß den Pluralregeln der jeweiligen Locale korrekt erweitert? |
| `filters.banner.scope`      | Deckt `select` jeden `scope`-Wert ab, den die App sendet? Ist `other` ein sicherer Fallback?                             |
| Kurze Beschriftungen                | Passen übersetzte Zeichenfolgen auch nach der Pluralerweiterung noch auf die Schaltflächen?                                                |

Fügen Sie Screenshots hinzu, wenn ein Pluralzweig in einem beengten Layout erscheint. Hyperlocalise hält Glossar- und Projektanweisungen neben dem Segment bereit – die CLI verschiebt nur Dateien.

Genehmigen Sie Übersetzungen auf der Plattform, bevor Sie sie zurückübernehmen. Die Genehmigung ist die Sprachfreigabe; Git hält fest, was tatsächlich ausgeliefert wird.

## Schritt 7: Übersetzungen abrufen und für die Laufzeit bündeln

Einen manuellen Pull-Job hinzufügen:

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

`sync pull` schreibt `lang/fr-FR.json` und `lang/de-DE.json` im FormatJS-Format (IDs, `defaultMessage`, manchmal `description`). `hl pack` entfernt `description` und andere Metadaten, wobei ICU in jedem `defaultMessage` erhalten bleibt – bereit für Bundler, die JSON pro Locale importieren.

Beispiel für einen gepackten französischen Eintrag:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Öffne den Übersetzungs-Pull-Request in der App, wechsle die Gebietsschemas und teste `count = 0`, `count = 1` und `count = 5`. ICU-Regressionen treten oft nur bei nicht-englischen Pluralregeln auf.

## Schritt 8: Kataloge in der App laden

Importiere gepackte Gebietsschemadateien und ordne sie `IntlProvider` oder `createIntl` zu:

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

Manche Teams belassen englische Standardwerte ausschließlich im Quellcode und laden JSON nur für Zielsprachen – beide Muster funktionieren, wenn `defaultMessage` im Code und `lang/en-US.json` durch extract aufeinander abgestimmt bleiben.

## Wie der vollständige Ablauf funktioniert

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

Extract verbindet Code mit Katalogen. Sync verbindet Kataloge mit Reviewern. Pack verbindet geprüftes JSON mit deinem Bundle.

## Häufige Fehlerquellen

### Pull Request schlägt aufgrund von Abweichungen beim Extrahieren fehl

Führe `hl extract` lokal mit denselben `--ignore`-Mustern wie in CI aus, committe `lang/en-US.json` und pushe. Wenn IDs unerwartet springen, prüfe, ob Deskriptoren stabile `id`-Felder enthalten.

### `icu_shape_mismatch` bei einer ansonsten „guten“ Übersetzung

Vergleiche die Reihenfolge der Zweige und die Platzhalternamen mit `en-US`. Führe `hl check --check icu_shape_mismatch --locale fr-FR` lokal aus. Korrigiere das Ziel-JSON oder sende das Segment zur Überprüfung zurück – deaktiviere die Prüfung nicht für echte ICU-Nachrichten.

### Zur Laufzeit wird `MISSING_TRANSLATION` oder Englisch in einer Zielsprache angezeigt.

Bestätige, dass der Übersetzungs-Pull-Request gemergt wurde, `hl pack` ausgeführt wurde und die Importe auf die gepackten Dateien verweisen. Überprüfe, ob die Nachrichten-IDs im Code mit den Schlüsseln in JSON übereinstimmen (einschließlich etwaiger `--prefix-id`-Konvention).

### `hl sync pull` ändert nichts

Bestätige Genehmigungen im Projekt, auf das `HYPERLOCALISE_PROJECT_ID` verweist. Führe `hl sync pull --dry-run` aus. Stelle sicher, dass die Pfade von `i18n.yml` `to:` mit den Pfaden übereinstimmen, über die die App Kataloge importiert.

### Bei gepackten Dateien wurde ICU versehentlich entfernt.

Verwende standardmäßig `hl pack` für FormatJS-JSON – dadurch bleibt `defaultMessage` erhalten. Führe pack nicht mit Workflows aus, die für einfaches verschachteltes JSON gedacht sind, es sei denn, das entspricht der Struktur deines Katalogs.

## Release-Checkliste

Vor der Veröffentlichung einer Funktion, die auf neuen Texten basiert:

- [ ] Nachrichtendeskriptoren mit extrahierten `lang/en-US.json` zusammengeführt
- [ ] Pull-Request-Auszug und `hyperlocalise check` bestanden
- [ ] `hl sync push` lief am `main`
- [ ] Zielsprachen in Hyperlocalise überprüft und genehmigt
- [ ] Übersetzungs-Pull-Request zusammengeführt (`sync pull` + `pack`)
- [ ] Manuelle QA für Plural- und `select`-Zweige pro Gebietsschema
- [ ] Das Produktions-Deployment verwendet die zusammengeführten Artefakte `lang/*.json`

## Halte extract auf dem Laufenden.

React Intl fördert direkt beim Code platzierte Texte; Hyperlocalise setzt auf geprüfte, dateibasierte Übersetzungen. Der **`hl extract`**-Befehl verbindet diese beiden Welten, ohne für grundlegende Kataloge ein separates FormatJS-CLI einzuführen.

Verwende **`check`**, um die ICU-Struktur in Pull Requests zu schützen. Verwende **sync** für den Reviewer-Workflow. Verwende **`pack`**, damit Produktions-Bundles schlank bleiben und Übersetzer zwischen den Pulls umfangreiche Metadaten in Git behalten können.

Für einen umfassenderen Einblick in den GitHub-Release – einschließlich Markdown-Versionshinweisen neben UI-Strings – lies weiter im [Lokalisierungsworkflow für GitHub: vom Pull Request bis zum mehrsprachigen Release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) oder [entdecke die Produktlokalisierung auf Hyperlocalise](/use-cases/product-localisation).
