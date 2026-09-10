---
title: "GitHub Localisation Workflow: From Pull Request to Multilingual Release"
date: 2026-09-09T00:00:00.000Z
excerpt: Build a practical GitHub localisation workflow that checks changed strings, sends source content to Hyperlocalise, brings reviewed translations back, and publishes multilingual release notes.
category: Ingenieurwesen
tags:
  - github localization
  - GitHub localisation workflow
  - localize release notes
  - multilingual release
  - localization GitHub Actions
  - localisation CLI
  - continuous localisation
  - software localisation
  - release automation
  - translation review
---

This guide walks you through setting up a GitHub localization workflow with GitHub Actions, the `hyperlocalise` CLI, and the Hyperlocalise platform. You will start with a small example and follow one product change from its first pull request to a multilingual release.

Am Ende umfasst Ihr Workflow vier Phasen:

1. Ein Ingenieur ändert einen englischen UI-Text und dessen Versionshinweise.
2. GitHub prüft den Pull Request auf Lokalisierungsprobleme.
3. Die CLI überträgt Quellinhalte an Hyperlocalise, wo das Team die Übersetzungen überprüft.
4. GitHub ruft die geprüften Dateien ab und veröffentlicht ein Release mit englischen, französischen und deutschen Anmerkungen.

Das Ergebnis ist ein in das Repository integrierter Prozess. Entwickler bleiben in Pull Requests, Sprachprüfer arbeiten kontextbezogen in Hyperlocalise, und die Veröffentlichung verwendet nur Übersetzungen, die wieder in Git zurückgeflossen sind.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## Was wir erstellen werden

Nehmen Sie an, dass eine Webanwendung diese Struktur hat:

```text
.
├── .github/workflows/
│   ├── localise.yml
│   └── release.yml
├── locales/
│   ├── en-US.json
│   ├── de-DE.json
│   └── fr-FR.json
├── release-notes/
│   ├── en-US/v1.8.0.md
│   ├── de-DE/v1.8.0.md
│   └── fr-FR/v1.8.0.md
└── i18n.yml
```

Englisch ist das Quellgebietsschema. Französisch und Deutsch sind Zielgebietsschemata. JSON-Dateien enthalten Produkttexte, während Markdown-Dateien Versionshinweise enthalten. Hyperlocalise behandelt beides als übersetzbaren Inhalt, sodass derselbe Prüfzyklus die Benutzeroberfläche und die Ankündigung abdeckt.

Sie benötigen:

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- Berechtigung zum Hinzufügen von Workflows und Repository-Geheimnissen.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Schritt 1: Quelldateien und Zieldateien zuordnen

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.11.0

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  product:
    files:
      - from: locales/{{source}}.json
        to: locales/{{target}}.json
  release-notes:
    files:
      - from: release-notes/{{source}}/*.md
        to: release-notes/{{target}}/*.md

llm:
  profiles:
    default:
      provider: openai
      model: gpt-5.6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

Das LLM-Profil wird verwendet, wenn Ihr Projekt mit diesem Anbieter Übersetzungen generiert. Speichern Sie die Anbieterdaten in Hyperlocalise, anstatt sie dem Workflow hinzuzufügen. Der GitHub-Runner benötigt nur Zugangsdaten für das Hyperlocalise-Projekt.

## Schritt 2: Nehmen Sie eine Produktänderung vor

Suppose version 1.8.0 adds saved filters. The pull request changes `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

It also adds `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Committen Sie die Quellinhalte zusammen mit dem Feature. So erhalten Reviewer die Codeänderung, den UI-Text und die kundenorientierte Erklärung in einem Pull Request. Außerdem kann die Git-Historie beantworten, welche Formulierung mit einem Release ausgeliefert wurde.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Schritt 3: Geänderte Zeichenfolgen im Pull Request prüfen

Add `.github/workflows/localise.yml`. The first job runs on pull requests and scopes Hyperlocalise findings to the GitHub diff:

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "locales/**"
      - "release-notes/**"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "locales/en-US.json"
      - "release-notes/en-US/**"
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

      - name: Check changed localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

With `github-diff: true`, the action fetches the pull request patch and passes it to `hyperlocalise check --diff-stdin`. For supported structured catalogues, annotations focus on keys changed by this pull request rather than making the author resolve unrelated backlog.

Die Aktion lädt außerdem ihren JSON-Bericht und ihre Textzusammenfassung hoch. Bewahren Sie diese Artefakte auf, wenn eine Prüfung fehlschlägt: Sie unterscheiden strukturelle Fehler, fehlende Übersetzungen und inhaltliche Befunde von einem Installations- oder Konfigurationsfehler.

Diese Prüfung ist das erste Review-Gate, nicht die Sprachprüfung. Sie erkennt Probleme im Repository frühzeitig, während ein Reviewer noch entscheidet, ob jede Übersetzung korrekt, konsistent und für das Produkt geeignet ist.

## Schritt 4: Zusammengeführte Quellinhalte an Hyperlocalise übertragen

Add a second job to the same `localise.yml` workflow:

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

    - name: Push source content
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

This is the push boundary. After the feature pull request merges to `main`, `hl sync push` reads the buckets in `i18n.yml` and sends the English JSON and Markdown sources to the linked Hyperlocalise project.

The job has read-only repository permission because it sends content out but does not modify Git. Its credentials live only in the step that needs them. The `paths` filter prevents unrelated merges from creating unnecessary sync runs.

Du kannst denselben Vorgang vor dem Commit ausführen:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Schritt 5: Überprüfen Sie Produkttexte und Versionshinweise gemeinsam

Sobald die Quellsynchronisierung abgeschlossen ist, überprüfe die neuen Inhalte in Hyperlocalise. Die UI-Strings und Versionshinweise bleiben in separaten Buckets, verwenden jedoch gemeinsame Projektterminologie, Anweisungen und Ziellokalisierungen.

Für dieses Beispiel sollte ein Prüfer mehr als nur die wörtliche Genauigkeit überprüfen:

| Inhalt         | Überprüfungsfrage                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| Beschreibung     | Passt es zur Benutzeroberfläche und bewahrt die Terminologie „Arbeitsbereich“? |
| Release-Titel   | Verwendet es denselben Namen wie die Produktfunktion?        |
| Versionshinweise | Sind Befehle, Menünamen und die Ergebnisse für Benutzer konsistent?  |

Füge Produktkontext oder Screenshots hinzu, wenn ein kurzer String mehrdeutig ist. Ein Übersetzer, der nur „Filter speichern“ sieht, kann nicht wissen, ob damit eine Schaltfläche, eine Toast-Nachricht oder eine Seitenüberschrift bezeichnet wird. Dieser Kontext ergänzt die CLI durch die Plattform: Git verschiebt Dateien, während Hyperlocalise das Wissen vermittelt, das für eine fundierte sprachliche Entscheidung erforderlich ist.

Lösen Sie die Review-Kommentare und genehmigen Sie die Übersetzungen gemäß Ihrem Projekt-Workflow, bevor Sie sie zurückholen. Betrachten Sie die Genehmigung als Freigabevoraussetzung und nicht als Verwaltungsschritt.

## Schritt 6: Überprüfte Übersetzungen in GitHub abrufen

Add a third job to `localise.yml`:

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

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed translations"
        title: "chore(i18n): sync reviewed translations"
        body: |
          Pulls the latest reviewed product strings and release notes from
          Hyperlocalise. Check terminology, placeholders, links, and locale
          coverage before merging.
        labels: localization
```

Run this job from the **Actions** tab after review. `hl sync pull` writes target content to the paths in `i18n.yml`, producing files such as:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

The workflow opens a pull request instead of committing directly to `main`. That preserves branch protection, gives engineers a chance to run the application with each locale, and records the exact translations included in the release.

Für den Produktionseinsatz sollten Sie Aktionen von Drittanbietern gemäß Ihrer Abhängigkeitsrichtlinie auf vollständige Commit-SHAs pinnen. Veränderliche Major-Tags halten dieses Tutorial lesbar, aber unveränderliche Referenzen reduzieren das Risiko für die Lieferkette.

## Schritt 7: Teste den übersetzten Pull Request

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

Überprüfen Sie mindestens:

- Jeder Zielkatalog enthält die neuen Schlüssel;
- Platzhalter und ICU-Argumente stimmen mit der Quelle überein;
- Übersetzte Schaltflächen passen in unterstützte Viewport-Größen;
- Markdown-Überschriften, -Listen, -Links und Code-Spans werden weiterhin korrekt dargestellt;
- das Produkt und die Versionshinweise verwenden denselben Funktionsnamen; und
- Quellzeichenfolgen sind nicht in Zieldateien gelangt.

Der Prüfer sollte außerdem das gerenderte Produkt öffnen. Die Überprüfung auf Dateiebene erkennt Terminologiefehler, kann aber keinen abgeschnittenen Button oder einen Zeilenumbruch aufdecken, der wichtigen Text verbirgt.

Führe den Übersetzungs-Pull-Request erst zusammen, wenn diese Prüfungen bestanden sind. Git enthält nun den freigegebenen Sprachstand des Releases.

## Schritt 8: Mehrsprachige Versionshinweise veröffentlichen

GitHub Releases has one release body, so assemble each locale into one Markdown document. Add `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build multilingual release notes
        env:
          VERSION: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          mkdir -p dist

          for locale in en-US fr-FR de-DE; do
            file="release-notes/${locale}/${VERSION}.md"
            test -s "${file}" || {
              echo "Missing release notes: ${file}" >&2
              exit 1
            }
          done

          {
            printf '# English\n\n'
            cat "release-notes/en-US/${VERSION}.md"
            printf '\n\n---\n\n# Français\n\n'
            cat "release-notes/fr-FR/${VERSION}.md"
            printf '\n\n---\n\n# Deutsch\n\n'
            cat "release-notes/de-DE/${VERSION}.md"
          } > dist/release-notes.md

      - name: Publish GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${{ github.ref_name }}" --verify-tag --notes-file dist/release-notes.md
```

Erstelle den Tag erst, nachdem die Pull Requests für das Feature und die Übersetzung zusammengeführt wurden:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Der Release-Job schlägt fehl, wenn die Versionshinweise für eine Locale fehlen oder leer sind. Das ist beabsichtigt. Ein stiller Fallback würde eine unvollständige Veröffentlichung als mehrsprachig kennzeichnen; ein fehlgeschlagener Job zeigt dem Team genau, welche Datei erneut den Review-Prozess durchlaufen muss.

Derselbe Tag kann Ihre Build- und Bereitstellungsjobs steuern. Lassen Sie den Release-Job von diesen Jobs abhängen, wenn die Binärdateien vorhanden sein müssen, bevor die Ankündigung live geht.

## Wie der vollständige Ablauf funktioniert

Der abgeschlossene GitHub-Lokalisierungsworkflow verfolgt eine klare Richtung:

```text
feature branch
    │
    ├─ change English strings and release notes
    └─ pull request: Hyperlocalise check + application tests
             │
             ▼
           main
             │
             └─ hl sync push → Hyperlocalise
                                  │
                                  ├─ translate
                                  ├─ review
                                  └─ approve
                                       │
                                       ▼
                              manual hl sync pull
                                       │
                                       ▼
                           translation pull request
                                       │
                                       ├─ checks
                                       ├─ visual QA
                                       └─ merge
                                            │
                                            ▼
                                       version tag
                                            │
                                            └─ multilingual GitHub release
```

Jeder Übergang erfüllt genau eine Aufgabe. Pull Requests überprüfen Änderungen am Repository. Hyperlocalise überprüft sprachliche Entscheidungen. Tags veröffentlichen einen unveränderlichen, bereits geprüften Zustand.

## Häufige Fehlerursachen

### Der PR-Check meldet nicht zusammenhängende Übersetzungen

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### Push-Quelle kann nicht authentifiziert werden

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### Das Abrufen von Übersetzungen erzeugt keinen Git-Diff

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### Das Release kann seine Versionshinweise nicht finden

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Übersetzungen werden nach der Produktveröffentlichung verfügbar sein

Mache die Synchronisierung der Übersetzungen nicht zu einer nach dem Release anstehenden Aufgabe, die nicht nachverfolgt wird. Verlange den Pull Request für die Übersetzungen, bevor du den Tag erstellst, oder bilde die Lokalisierung als explizite Prüfung des Release-Kandidaten in deinem Deployment-Workflow ab.

## Veröffentlichungs-Checkliste

Vor dem Taggen einer mehrsprachigen Version Folgendes bestätigen:

- [ ] Quelltexte und englische Versionshinweise zusammengeführt;
- [ ] die Lokalisierungsprüfung des Pull Requests war erfolgreich;
- [ ] `hl sync push` completed after merge;
- [ ] Zielsprachen wurden in Hyperlocalise überprüft und genehmigt;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] automatisierte, sprachliche und visuelle Prüfungen bestanden;
- [ ] der Übersetzungs-Pull-Request zusammengeführt wurde; und
- [ ] Jede Release-Note-Locale hat eine nicht leere Datei, die dem Tag entspricht.

## Lokalisierung im Veröffentlichungsprozess halten

Der wichtige Teil der GitHub-Lokalisierung ist nicht das YAML. Es ist die Abfolge nachvollziehbarer Übergaben.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

Das macht die Lokalisierung von einer Aufgabe nach der Entwicklung zu einem Bestandteil der Veröffentlichung selbst.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
