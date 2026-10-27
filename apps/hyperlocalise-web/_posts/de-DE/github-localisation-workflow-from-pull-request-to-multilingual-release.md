---
title: "GitHub-Lokalisierungsworkflow: Vom Pull Request zur mehrsprachigen Veröffentlichung"
date: 2026-09-09T00:00:00.000Z
excerpt: Erstellen Sie einen praktischen GitHub-Lokalisierungsworkflow, der geänderte Zeichenfolgen prüft, Quellinhalte an Hyperlocalise sendet, geprüfte Übersetzungen zurückführt und mehrsprachige Versionshinweise veröffentlicht.
category: Technik
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

Diese Anleitung führt Sie durch die Einrichtung eines GitHub-Lokalisierungsworkflows mit GitHub Actions, der `hyperlocalise`-CLI und der Hyperlocalise-Plattform. Sie beginnen mit einem kleinen Beispiel und verfolgen eine Produktänderung von ihrem ersten Pull Request bis zu einer mehrsprachigen Veröffentlichung.

Am Ende umfasst Ihr Workflow vier Phasen:

1. Ein Entwickler ändert eine englische UI-Zeichenfolge und die zugehörigen Versionshinweise.
2. GitHub überprüft den Pull Request auf Lokalisierungsprobleme.
3. Die CLI überträgt die Quellinhalte an Hyperlocalise, wo das Team die Übersetzungen überprüft.
4. GitHub ruft die geprüften Dateien ab und veröffentlicht ein Release mit Versionshinweisen auf Englisch, Französisch und Deutsch.

Das Ergebnis ist ein in das Repository integrierter Prozess. Engineers bleiben in Pull Requests, Sprachprüfer arbeiten mit Kontext in Hyperlocalise, und für das Release werden nur Übersetzungen verwendet, die wieder in Git gelandet sind.

Wenn du vor den Implementierungsdetails das umfassendere Produktmuster kennenlernen möchtest, sieh dir den [GitHub-Anwendungsfall zur Produktlokalisierung](/use-cases/product-localisation) an.

## Was wir bauen werden

Angenommen, eine Webanwendung hat folgende Struktur:

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

Englisch ist die Ausgangssprache. Französisch und Deutsch sind Zielsprachen. JSON-Dateien enthalten Produkttexte, während Markdown-Dateien Versionshinweise enthalten. Hyperlocalise behandelt beides als übersetzbare Inhalte, sodass derselbe Prüfzyklus sowohl die Benutzeroberfläche als auch die Ankündigung umfasst.

Sie benötigen:

- ein Hyperlocalise-Projekt mit `en-US` als Ausgangslocale und `fr-FR` und `de-DE` als Ziel-Locales;
- ein `HYPERLOCALISE_API_KEY` GitHub-Actions-Secret;
- ein `HYPERLOCALISE_PROJECT_ID` GitHub-Actions-Geheimnis; und
- Berechtigung zum Hinzufügen von Workflows und Repository-Secrets.

Verwenden Sie eine GitHub-Umgebung wie `localisation` für Produktionszugangsdaten, falls Ihre Organisation Bereitstellungsgenehmigungen verlangt.

## Schritt 1: Quelldateien und Zieldateien zuordnen

Erstellen Sie `i18n.yml` im Stammverzeichnis des Repositorys:

```yaml
version: hyperlocalise@1.13.6

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
      model: gpt-6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

Die beiden Buckets machen die Zuständigkeit explizit. `product` ordnet einem Quellkatalog jeweils einen Katalog pro Zielsprache zu. `release-notes` ordnet jede englische Markdown-Datei dem entsprechenden Sprachverzeichnis zu und behält dabei ihren Dateinamen bei.

Wenn Sie die CLI-Version in der Konfiguration festschreiben, stimmen lokale und CI-Läufe ebenfalls überein. Aktualisieren Sie die Beispielversion auf die Version, die Ihr Team getestet hat. Wenn Sie `version` weglassen, legen Sie stattdessen die Version der Eingabe `version` in der Installationsaktion fest.

Das LLM-Profil wird verwendet, wenn Ihr Projekt mit diesem Anbieter Übersetzungen generiert. Hinterlegen Sie die Anbieter-Zugangsdaten in Hyperlocalise, statt sie dem Workflow hinzuzufügen. Der GitHub-Runner benötigt nur Zugangsdaten für das Hyperlocalise-Projekt.

## Schritt 2: eine Produktänderung vornehmen

Angenommen, Version 1.8.0 fügt gespeicherte Filter hinzu. Der Pull Request ändert `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Außerdem wird `release-notes/en-US/v1.8.0.md` hinzugefügt:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Committe den Quellinhalt zusammen mit dem Feature. So erhalten Reviewer die Codeänderung, die UI-Texte und die Erklärung für Kunden in einem Pull Request. Außerdem lässt sich in der Git-Historie nachvollziehen, welche Formulierung mit einem Release ausgeliefert wurde.

Kopieren Sie keine englischen Zeichenfolgen von `fr-FR.json` oder `de-DE.json` in Platzhalter. Ein kopierter Quellwert kann bei einer einfachen Schlüsselzählung vollständig aussehen, obwohl keine Lokalisierung stattgefunden hat.

## Schritt 3: Geänderte Zeichenfolgen im Pull Request überprüfen

Füge `.github/workflows/localise.yml` hinzu. Der erste Job wird bei Pull Requests ausgeführt und beschränkt die Hyperlocalise-Befunde auf den GitHub-Diff:

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

Mit `github-diff: true` ruft die Aktion den Patch des Pull Requests ab und übergibt ihn an `hyperlocalise check --diff-stdin`. Bei unterstützten strukturierten Katalogen konzentrieren sich die Anmerkungen auf die Schlüssel, die durch diesen Pull Request geändert wurden, statt den Autor dazu zu bringen, einen nicht zusammenhängenden Rückstand abzuarbeiten.

Die Aktion lädt außerdem ihren JSON-Bericht und die Textzusammenfassung hoch. Bewahren Sie diese Artefakte auf, wenn eine Prüfung fehlschlägt: Sie unterscheiden strukturelle Fehler, fehlende Übersetzungen und inhaltliche Befunde von einem Installations- oder Konfigurationsfehler.

Diese Prüfung ist die erste Prüfstufe, nicht die Sprachprüfung. Sie erkennt Probleme im Repository frühzeitig, während weiterhin ein Reviewer entscheidet, ob jede Übersetzung korrekt, konsistent und für das Produkt angemessen ist.

## Schritt 4: Zusammengeführte Quellinhalte an Hyperlocalise übertragen

Füge demselben `localise.yml`-Workflow einen zweiten Job hinzu:

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

Dies ist die Push-Grenze. Nachdem der Feature-Pull-Request in `main` zusammengeführt wurde, liest `hl sync push` die Buckets in `i18n.yml` und sendet die englischen JSON- und Markdown-Quelldateien an das verknüpfte Hyperlocalise-Projekt.

Der Job verfügt über schreibgeschützte Berechtigungen für das Repository, da er Inhalte nach außen sendet, Git jedoch nicht verändert. Seine Zugangsdaten sind nur in dem Schritt hinterlegt, der sie benötigt. Der Filter `paths` verhindert, dass nicht zusammengehörige Merges unnötige Synchronisierungsläufe auslösen.

Du kannst denselben Vorgang vor dem Commit ausführen:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Verwenden Sie `--dry-run`, wenn Sie Bucket-Zuordnungen ändern. Damit können Sie den Plan prüfen, bevor Sie das Remote-Projekt aktualisieren.

## Schritt 5: Produkttexte und Versionshinweise gemeinsam überprüfen

Sobald die Quellsynchronisierung abgeschlossen ist, überprüfe die neuen Inhalte in Hyperlocalise. Die UI-Zeichenfolgen und Versionshinweise bleiben in getrennten Buckets, verwenden jedoch dieselbe Projektterminologie, dieselben Anweisungen und dieselben Ziel-Lokalisierungen.

Für dieses Beispiel sollte ein Prüfer mehr als nur die wörtliche Genauigkeit prüfen:

| Inhalt          | Überprüfungsfrage                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Ist dies eindeutig eine Aktion und kein gespeicherter Zustand?    |
| `filters.saved` | Passt der Begriff zu den Texten in Navigation und Einstellungen?        |
| Beschreibung     | Passt es zur Benutzeroberfläche und bleibt die „Workspace“-Terminologie erhalten? |
| Release-Titel   | Verwendet es denselben Namen wie das Produktfeature?        |
| Release-Stichpunkte | Sind Befehle, Menünamen und Benutzerergebnisse konsistent?  |

Fügen Sie Produktkontext oder Screenshots hinzu, wenn ein kurzer Text mehrdeutig ist. Ein Übersetzer, der nur „Filter speichern“ sieht, kann nicht wissen, ob es sich um eine Schaltflächenbeschriftung, eine Toast-Meldung oder eine Seitenüberschrift handelt. Genau hier ergänzt die Plattform die CLI: Git verschiebt Dateien, während Hyperlocalise das Wissen vermittelt, das für eine fundierte sprachliche Entscheidung erforderlich ist.

Bearbeiten Sie die Review-Kommentare und genehmigen Sie die Übersetzungen gemäß Ihrem Projekt-Workflow, bevor Sie sie zurückholen. Betrachten Sie die Genehmigung als Freigabeschritt und nicht als bloße Verwaltungsaufgabe.

## Schritt 6: geprüfte Übersetzungen in GitHub übernehmen

Füge einen dritten Job zu `localise.yml` hinzu:

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

Führen Sie diesen Job nach der Überprüfung über die Registerkarte **Actions** aus. `hl sync pull` schreibt Zielinhalte in die Pfade in `i18n.yml` und erstellt Dateien wie:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Der Workflow erstellt einen Pull Request, anstatt direkt in `main` zu committen. Dadurch bleibt der Branch-Schutz erhalten, Entwickler können die Anwendung mit jeder Sprache ausführen und die exakt im Release enthaltenen Übersetzungen werden dokumentiert.

Verwenden Sie in der Produktion gemäß Ihrer Dependency-Richtlinie vollständige Commit-SHAs, um Aktionen von Drittanbietern festzuschreiben. Veränderliche Major-Tags sorgen dafür, dass dieses Tutorial lesbar bleibt, aber unveränderliche Referenzen verringern das Risiko für die Lieferkette.

## Schritt 7: Den übersetzten Pull Request testen

Die automatisierte Prüfung wird erneut ausgeführt, weil der Übersetzungs-Pull-Request `locales/**` und `release-notes/**` ändert. Fügen Sie auch die eigenen Tests Ihrer Anwendung zu den erforderlichen Prüfungen hinzu.

Überprüfen Sie mindestens:

- Jeder Zielkatalog enthält die neuen Schlüssel;
- Platzhalter und ICU-Argumente stimmen mit der Quelle überein;
- übersetzte Schaltflächen passen bei unterstützten Bildschirmgrößen;
- Markdown-Überschriften, -Listen, -Links und Code-Spans werden weiterhin korrekt gerendert;
- das Produkt und die Versionshinweise verwenden denselben Funktionsnamen; und
- Quellstrings sind nicht in die Zieldateien durchgesickert.

Der Prüfer sollte auch das gerenderte Produkt öffnen. Bei der Überprüfung auf Dateiebene fallen Terminologiefehler auf, aber ein abgeschnittener Button oder ein Zeilenumbruch, der wichtige Texte verdeckt, bleibt so unentdeckt.

Führe den Übersetzungs-Pull-Request nur dann zusammen, wenn diese Prüfungen erfolgreich sind. Git enthält jetzt den genehmigten Sprachstand des Releases.

## Schritt 8: Mehrsprachige Versionshinweise veröffentlichen

GitHub Releases hat einen einzigen Veröffentlichungstext. Füge daher jede Sprache zu einem Markdown-Dokument zusammen. Füge `.github/workflows/release.yml` hinzu:

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

Erstelle das Tag erst, nachdem die Feature- und Übersetzungs-Pull-Requests zusammengeführt wurden:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Der Release-Job schlägt fehl, wenn die Versionshinweise für eine Locale fehlen oder leer sind. Das ist Absicht. Ein stiller Fallback würde ein unvollständiges Release als mehrsprachig kennzeichnen; ein fehlgeschlagener Job zeigt dem Team genau, welche Datei erneut überprüft werden muss.

Dasselbe Tag kann Ihre Build- und Deployment-Jobs steuern. Lassen Sie den Release-Job von diesen Jobs abhängen, wenn die Binärdateien vorhanden sein müssen, bevor die Ankündigung veröffentlicht wird.

## Wie der vollständige Ablauf funktioniert

Der abgeschlossene GitHub-Lokalisierungsworkflow hat eine klare Richtung:

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

Jeder Übergang hat eine Aufgabe. Pull Requests überprüfen Änderungen am Repository. Hyperlocalise überprüft sprachliche Entscheidungen. Tags veröffentlichen einen unveränderlichen, bereits überprüften Stand.

## Häufige Fehler

### Der PR-Check meldet nicht zusammenhängende Übersetzungen

Bestätige, dass die Aktion bei einem `pull_request`-Ereignis ausgeführt wird und `github-diff: true` setzt. Die Aktion benötigt `pull-requests: read`, um den Patch abzurufen. Die diff-beschränkte Prüfung gilt für unterstützte strukturierte Übersetzungsdateien. Wenn du auch einen Überblick über den Rückstand haben möchtest, führe vollständige Projektprüfungen in einem separaten geplanten Job aus.

### Quell-Push kann nicht authentifiziert werden

Prüfe, ob sowohl `HYPERLOCALISE_API_KEY` als auch `HYPERLOCALISE_PROJECT_ID` in der ausgewählten GitHub-Umgebung vorhanden sind. Umgebungsgeheimnisse sind nur verfügbar, wenn der Job diese Umgebung angibt, und für geschützte Umgebungen kann eine Genehmigung erforderlich sein.

### Das Abrufen von Übersetzungen erzeugt keinen Git-Diff

Bestätige zunächst, dass die Übersetzungsarbeit im selben Projekt namens `HYPERLOCALISE_PROJECT_ID` abgeschlossen ist. Prüfe dann die Zielpfade in `i18n.yml`. Führe `hl sync pull --dry-run` lokal aus, um den geplanten Download zu überprüfen, ohne Dateien zu überschreiben.

### Das Release kann seine Versionshinweise nicht finden.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Übersetzungen treffen nach der Produktveröffentlichung ein.

Machen Sie die Synchronisierung der Übersetzungen nicht zu einer nicht nachverfolgten Aufgabe nach der Veröffentlichung. Verlangen Sie den Übersetzungs-Pull-Request, bevor Sie das Tag erstellen, oder modellieren Sie die Lokalisierung als explizite Release-Candidate-Prüfung in Ihrem Deployment-Workflow.

## Release-Checkliste

Bevor Sie eine mehrsprachige Version taggen, vergewissern Sie sich, dass:

- [ ] Quelltexte und englische Versionshinweise zusammengeführt;
- [ ] Die Lokalisierungsprüfung für den Pull Request wurde bestanden;
- [ ] `hl sync push` nach dem Zusammenführen abgeschlossen;
- [ ] Zielsprachen wurden in Hyperlocalise überprüft und genehmigt;
- [ ] `hl sync pull` hat einen Pull Request zur Übersetzung eröffnet;
- [ ] automatisierte, sprachliche und visuelle Prüfungen bestanden;
- [ ] der Übersetzungs-Pull-Request gemergt wurde; und
- [ ] Für jedes Gebietsschema der Versionshinweise gibt es eine nicht leere Datei, die dem Tag entspricht.

## Integrieren Sie die Lokalisierung in den Release-Prozess.

Der wichtige Teil der GitHub-Lokalisierung ist nicht das YAML. Es ist die Abfolge nachvollziehbarer Übergaben.

Die `hyperlocalise` CLI verbindet Repository-Dateien mit der Plattform. Die GitHub Action gibt Ingenieurinnen und Ingenieuren schnelles Feedback zu geänderten Zeichenfolgen. Hyperlocalise bietet Sprachprüferinnen und Sprachprüfern den Kontext und den Freigabe-Workflow, den Git allein nicht bereitstellen kann. Der abschließende Tag veröffentlicht genau das, was das Team geprüft hat.

Dadurch wird Lokalisierung von einer Aufgabe nach der Entwicklung zu einem Teil des Releases selbst.

[Entdecke Hyperlocalise für die Produktlokalisierung](/use-cases/product-localisation), um deine Repositories, Prüf-Workflows und mehrsprachigen Releases zu verbinden.
