---
title: "React Intl und ICU-Lokalisierung: Mit Hyperlocalise extrahieren, synchronisieren und überprüfen"
date: 2026-09-24T00:00:00.000Z
excerpt: "Integriere react-intl und die ICU-Nachrichtensyntax in einen Workflow, der sich nahtlos in dein Repository einfügt: Extrahiere Kataloge mit der Hyperlocalise-CLI, validiere Pluralformen in Pull Requests, überprüfe sie in Hyperlocalise und liefere übersetzte JSON-Dateien in der Produktion aus."
category: Ingenieurwesen
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

React Intl speichert nutzerseitige Texte in TypeScript, aber Übersetzer und CI benötigen einen stabilen Katalog auf der Festplatte. Die ICU-Syntax – Pluralformen, Auswahlen, Zahlen und Datumsangaben – muss diese Übergabe unbeschadet überstehen, ohne zur Laufzeit Fehler zu verursachen.

Dieser Leitfaden zeigt, wie sich **react-intl**, **ICU** und die **`hyperlocalise` CLI** zu einem einzigen Workflow verbinden lassen:

1. Ingenieure schreiben Nachrichten in `defineMessages` und `<FormattedMessage />`.
2. `hl extract` aktualisiert den englischen FormatJS-Katalog aus der Quelle.
3. GitHub überprüft den Pull Request auf Abweichungen, fehlende Schlüssel und Probleme mit der ICU-Struktur.
4. `hl sync push` sendet den Katalog zur Überprüfung an Hyperlocalise.
5. `hl sync pull` und `hl pack` bringen geprüfte Übersetzungen zurück in `lang/*.json` für Ihre App.

Das Muster zeigt, wie Hyperlocalise die eigene Web-App selbst nutzt. Für Release Notes und Nicht-React-JSON im selben Repository kombinierst du dieses Tutorial mit dem [GitHub-Lokalisierungs-Workflow vom Pull Request bis zur mehrsprachigen Veröffentlichung](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Was wir erstellen werden

Angenommen, eine Next.js- oder Vite-React-App hat folgendes Layout:

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

Englisch (`en-US`) ist das Quellgebietsschema. Französisch und Deutsch sind Zielsprachen. Nachrichten-IDs und `defaultMessage`-Werte befinden sich in `*.messages.ts`-Dateien (Clientmodule) und gelegentlich in Inline-Deskriptoren. Das extrahierte JSON synchronisiert Hyperlocalise; das gepackte JSON importieren viele Apps zur Laufzeit.

Sie benötigen:

- ein Hyperlocalise-Projekt mit `en-US` als Quelle und Ihren Zielsprachen;
- und `HYPERLOCALISE_API_KEY` und `HYPERLOCALISE_PROJECT_ID` als GitHub-Actions-Secrets; und
- `react-intl` (oder `@formatjs/intl`) ist bereits in der App installiert.

## Schritt 1: ICU-fähige react-intl-Nachrichten schreiben

Halten Sie Produkttexte in Nachrichten-Deskriptoren statt in verstreuten Zeichenfolgenliteralen. Verwenden Sie explizite IDs, damit Extraktion und Überprüfung auch bei Änderungen am Wortlaut stabil bleiben.

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

Verwende ICU innerhalb von `defaultMessage`, wenn der Text von Zahlen oder Enums abhängt. React Intl wertet die gesamte Nachricht zur Laufzeit aus; Übersetzer müssen die `{count, plural, ...}`- und `{scope, select, ...}`-Skelette beibehalten und nur die für Menschen lesbaren Zweige ändern.

Übergeben Sie in einer Seitenkomponente ICU-Werte über `formatMessage` oder `<FormattedMessage />`:

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

**Server Components:** Importieren Sie `*.messages.ts` nicht aus ausschließlich serverseitigen Modulen – `defineMessages` ist nur clientseitig verfügbar. Markieren Sie die UI entweder als `"use client"` oder verwenden Sie serverseitig Inline-`{ id, defaultMessage, description }`-Objekte mit `getIntlShape(locale).formatMessage()`. Beachten Sie die react-intl-Grenzen Ihres Frameworks; der Extraktionsschritt findet weiterhin Deskriptoren in den von ihm gescannten Dateien `.ts` und `.tsx`.

Vermeide `--flatten` bei ICU-Nachrichten, die du als einzelne react-intl-Einheiten ausliefern möchtest. Beim Flattening werden Plural- und Select-Zweige für spezialisierte Übersetzungsworkflows herausgehoben; dies ist nicht der Standard für Laufzeitkataloge.

## Schritt 2: Kataloge in `i18n.yml` zuordnen

Erstellen Sie `i18n.yml` im Stammverzeichnis des Repositorys (oder unter Ihrem App-Verzeichnis, falls das Monorepo die Konfiguration neben der UI aufbewahrt):

```yaml
version: hyperlocalise@1.12.1

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

Hyperlocalise behandelt FormatJS-JSON als Inhalte erster Klasse: Jeder Schlüssel ist eine Nachrichten-ID, jeder Wert enthält `defaultMessage` und optional `description`. ICU-Zeichenfolgen bleiben ein Wert pro ID – `run`, `check` und die Synchronisierung teilen sie nicht in einzelne Sätze auf.

Fixieren Sie die CLI-Version in `i18n.yml` (oder fixieren Sie die Installationsaktion), damit lokale Rechner und GitHub Actions denselben Extraktor und dieselben Validatoren ausführen.

## Schritt 3: Den Quellkatalog mit der CLI extrahieren

Aktualisieren Sie im Verzeichnis, das `i18n.yml` enthält, den englischen Katalog:

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

Wenn ein Deskriptor `id` auslässt, generiert die CLI einen FormatJS-kompatiblen Hash aus `defaultMessage` und `description`. Explizite IDs lassen sich in Diffs und in Hyperlocalise leichter überprüfen.

Nimm `lang/en-US.json` zusammen mit der Codeänderung in den Commit auf. Behandle einen fehlenden Extract-Commit genauso wie eine fehlende Migration: Die Plattform sieht neue Zeichenfolgen erst, wenn der Katalog aktualisiert wird.

Optional: `--prefix-id` stellt IDs den normalisierten Dateipfad voran (`src.components.saved-filters-banner.title`). Verwende es zusammen mit `hl pack --prefix-id`, wenn Laufzeit-Bundles kurze IDs erwarten. Die Beispiele hier verwenden stattdessen stabile logische IDs.

## Schritt 4: Pull Requests mit extract und `check`

Hinzufügen `.github/workflows/localise.yml`:

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
2. **`hyperlocalise check`** — überprüft mit `github-diff: true` geänderte Schlüssel in `lang/en-US.json` und Ziele auf Probleme wie `not_localized`, `placeholder_mismatch` und **`icu_shape_mismatch`**.

Diese letzte Prüfung ist bei ICU wichtig: Eine französische Zeichenfolge, in der `{count, plural, ...}` fehlt oder die Zweige vertauscht sind, mag beim flüchtigen Überfliegen der JSON-Datei für Menschen in Ordnung aussehen, schlägt aber zur Laufzeit fehl. Strukturabweichungen in der CI zu erkennen, ist günstiger, als sie erst in der Produktion zu entdecken.

Führe dieselben Prüfungen lokal aus, bevor du pushst:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Schritt 5: Den extrahierten Katalog nach dem Merge pushen

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

Nach dem Zusammenführen lädt `hl sync push` `lang/en-US.json` in das verknüpfte Hyperlocalise-Projekt hoch. Durch erneutes Ausführen von extract auf `main` wird ein Wettlauf vermieden, bei dem Code ohne passenden Katalog in Git zusammengeführt wird.

Verwende `hl sync push --dry-run`, wenn du Bucket-Pfade oder Locale-Listen änderst.

## Schritt 6: ICU-Nachrichten in Hyperlocalise überprüfen

Übersetzer sollten die vollständige ICU-Nachricht sehen, nicht isolierte englische Fragmente. Stellen Sie bei der Überprüfung lokalisierungsspezifische Fragen, die ICU in einer einzelnen Zeichenfolge verbirgt:

| Nachricht                   | Frage zur Überprüfung                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Klingen die Zweige `=0`, `one` und `other` natürlich? Wird `#` für die Pluralregeln jeder Sprache korrekt erweitert? |
| `filters.banner.scope`      | Deckt `select` jeden `scope`-Wert ab, den die App sendet? Ist `other` ein sicherer Fallback?                             |
| Kurze Beschriftungen         | Passen übersetzte Zeichenfolgen nach der Pluralerweiterung weiterhin auf die Schaltflächen?                                                |

Füge Screenshots hinzu, wenn ein Pluralzweig in einem eingeschränkten Layout erscheint. Hyperlocalise bewahrt Glossar- und Projektanweisungen zusammen mit dem Segment auf – die CLI verschiebt nur Dateien.

Übersetzungen auf der Plattform freigeben, bevor sie wieder abgerufen werden. Die Freigabe ist das Sprach-Gate; Git hält fest, was tatsächlich ausgeliefert wird.

## Schritt 7: Übersetzungen abrufen und für die Laufzeit packen

Einen manuellen Abruf-Job hinzufügen:

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

`sync pull` schreibt `lang/fr-FR.json` und `lang/de-DE.json` im FormatJS-Format (IDs, `defaultMessage`, manchmal `description`). `hl pack` entfernt `description` und andere Metadaten und bewahrt dabei ICU in jeder `defaultMessage` – bereit für Bundler, die JSON pro Gebietsschema importieren.

Beispiel für einen gepackten französischen Eintrag:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Öffne den Übersetzungs-Pull-Request in der App, wechsle die Gebietsschemata und teste `count = 0`, `count = 1` und `count = 5`. ICU-Regressionen treten oft nur bei nicht-englischen Pluralregeln auf.

## Schritt 8: Kataloge in der App laden

Importiere die gebündelten Locale-Dateien und ordne sie `IntlProvider` oder `createIntl` zu:

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

Einige Teams behalten englische Standardwerte ausschließlich im Quellcode und laden JSON nur für Zielsprachen – beide Muster funktionieren, wenn `defaultMessage` im Code und `lang/en-US.json` durch extract aufeinander abgestimmt bleiben.

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

## Häufige Fehlerursachen

### Der Pull Request schlägt aufgrund einer Abweichung bei der Extraktion fehl.

Führe `hl extract` lokal mit denselben `--ignore`-Mustern wie CI aus, committe `lang/en-US.json` und pushe. Wenn IDs unerwartet springen, prüfe, ob die Deskriptoren stabile `id`-Felder enthalten.

### `icu_shape_mismatch` bei einer ansonsten „guten“ Übersetzung

Vergleiche die Reihenfolge der Branches und die Platzhalternamen mit `en-US`. Führe `hl check --check icu_shape_mismatch --locale fr-FR` lokal aus. Korrigiere das Ziel-JSON oder sende das Segment zur Überprüfung zurück – unterdrücke die Prüfung bei echten ICU-Nachrichten nicht.

### Zur Laufzeit wird `MISSING_TRANSLATION` oder Englisch in einer Ziel-Locale angezeigt

Bestätige, dass der Übersetzungs-Pull-Request gemergt wurde, `hl pack` ausgeführt wurde und die Importe auf die gepackten Dateien verweisen. Überprüfe, ob die Message-IDs im Code mit den Schlüsseln in JSON übereinstimmen (einschließlich der Konvention `--prefix-id`).

### `hl sync pull` ändert nichts

Bestätigen Sie die Genehmigungen im Projekt, auf das `HYPERLOCALISE_PROJECT_ID` verweist. Führen Sie `hl sync pull --dry-run` aus. Stellen Sie sicher, dass die `i18n.yml` `to:`-Pfade mit dem Pfad übereinstimmen, von dem die App Kataloge importiert.

### Bei gepackten Dateien wurde ICU versehentlich entfernt

Verwende default `hl pack` für FormatJS-JSON – dadurch bleibt `defaultMessage` intakt. Führe pack nicht mit Workflows aus, die für einfaches verschachteltes JSON gedacht sind, es sei denn, das ist die Struktur deines Katalogs.

## Veröffentlichungs-Checkliste

Bevor ein Feature ausgeliefert wird, das neue Texte benötigt:

- [ ] Nachrichtendeskriptoren mit extrahierten `lang/en-US.json` zusammengeführt
- [ ] Pull-Request-Auszug und `hyperlocalise check` bestanden
- [ ] `hl sync push` wurde am `main` ausgeführt.
- [ ] Zielsprachen überprüft und in Hyperlocalise freigegeben
- [ ] Übersetzungs-Pull-Request zusammengeführt (`sync pull` + `pack`)
- [ ] Manuelle Qualitätssicherung der Plural- und `select`-Zweige pro Gebietsschema
- [ ] Das Produktions-Deployment verwendet die zusammengeführten `lang/*.json` Artefakte

## Halte den Extrakt auf dem Laufenden.

React Intl fördert Texte, die direkt neben dem Code abgelegt werden; Hyperlocalise setzt auf geprüfte, dateibasierte Übersetzungen. Der **`hl extract`**-Befehl verbindet diese Welten, ohne für einfache Kataloge ein separates FormatJS-CLI zu verwenden.

Verwende **`check`** zum Schutz der ICU-Struktur in Pull Requests. Verwende **sync** für den Reviewer-Workflow. Verwende **`pack`**, damit Produktions-Bundles schlank bleiben und Übersetzer zwischen Pulls umfangreiche Metadaten in Git behalten.

Für einen umfassenderen Einblick in GitHub-Releases – einschließlich Markdown-Versionshinweisen neben UI-Strings – fahren Sie mit [GitHub-Lokalisierungsworkflow: vom Pull Request bis zur mehrsprachigen Veröffentlichung](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) fort oder [erkunden Sie die Produktlokalisierung auf Hyperlocalise](/use-cases/product-localisation).
