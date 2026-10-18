---
title: "GitHub-localisatieworkflow: van pull request tot meertalige release"
date: 2026-09-09T00:00:00.000Z
excerpt: Bouw een praktische lokalisatieworkflow voor GitHub die gewijzigde teksten controleert, bronte content naar Hyperlocalise stuurt, nagekeken vertalingen terughaalt en meertalige releaseopmerkingen publiceert.
category: Engineering
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

Uiteindelijk omvat je workflow vier fasen:

1. Een engineer wijzigt een Engelse UI-tekst en de release notes.
2. GitHub controleert de pull request op lokalisatieproblemen.
3. De CLI stuurt de brontekst naar Hyperlocalise, waar het team de vertalingen beoordeelt.
4. GitHub haalt de beoordeelde bestanden op en publiceert één release met notities in het Engels, Frans en Duits.

Het resultaat is een proces dat aansluit op de repository. Ontwikkelaars blijven in pull requests werken, taalreviewers werken met context in Hyperlocalise en de release gebruikt alleen vertalingen die naar Git zijn teruggekeerd.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## Wat we gaan bouwen

Stel dat een webapplicatie de volgende structuur heeft:

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

Engels is de brontaal. Frans en Duits zijn doeltalen. JSON-bestanden bevatten productteksten, terwijl Markdown-bestanden releaseopmerkingen bevatten. Hyperlocalise behandelt beide als vertaalbare inhoud, zodat dezelfde beoordelingscyclus zowel de interface als de aankondiging omvat.

Je hebt nodig:

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- toestemming om workflows en repositorygeheimen toe te voegen.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Stap 1: koppel de bron- en doelbestanden

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.13.4

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

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

Het LLM-profiel wordt gebruikt wanneer je project vertalingen genereert met die provider. Sla de inloggegevens van de provider op in Hyperlocalise in plaats van ze aan de workflow toe te voegen. De GitHub-runner heeft alleen inloggegevens nodig voor het Hyperlocalise-project.

## Stap 2: breng één wijziging aan in het product

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

Commit de broncontent samen met de feature. Zo krijgen reviewers de codewijziging, UI-tekst en uitleg voor klanten in één pull request. Het betekent ook dat je in de Git-geschiedenis kunt terugvinden welke formulering met een release is meegeleverd.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Stap 3: controleer gewijzigde tekenreeksen in de pull request

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

De actie uploadt ook het JSON-rapport en de tek samenvatting. Bewaar deze bestanden als een controle mislukt: zo zijn structurele fouten, ontbrekende vertalingen en inhoudelijke bevindingen te onderscheiden van problemen met de installatie of configuratie.

Deze controle is de eerste beoordelingsstap, niet de taalbeoordeling. Hiermee worden problemen in de repository vroegtijdig opgespoord, terwijl een reviewer nog steeds bepaalt of elke vertaling correct, consistent en geschikt is voor het product.

## Stap 4: push de samengevoegde broninhoud naar Hyperlocalise

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

Je kunt dezelfde bewerking uitvoeren voordat je commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Stap 5: beoordeel productteksten en releaseopmerkingen samen

Zodra de synchronisatie van de bron is voltooid, controleer je de nieuwe inhoud in Hyperlocalise. De UI-teksten en releaseopmerkingen blijven in afzonderlijke buckets, maar delen projectterminologie, instructies en doeltalen.

Voor dit voorbeeld moet een reviewer meer controleren dan alleen de letterlijke nauwkeurigheid:

| Inhoud          | Beoordelingsvraag                                        |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| Beschrijving     | Past het in de UI en blijft de term “workspace” behouden? |
| Releasetitel   | Gebruikt het dezelfde naam als de productfunctie?        |
| Releasepunten | Zijn opdrachten, menunamen en resultaten voor gebruikers consistent?  |

Voeg productcontext of schermafbeeldingen toe wanneer een korte tekst dubbelzinnig is. Een vertaler die alleen ‘Filter opslaan’ ziet, kan niet weten of het om een knop, een toastmelding of een paginakop gaat. Met die context vult het platform de CLI aan: Git verplaatst bestanden, terwijl Hyperlocalise de kennis meebrengt die nodig is om een weloverwogen taalkeuze te maken.

Los reviewopmerkingen op en keur de vertalingen goed volgens de workflow van je project voordat je ze terughaalt. Beschouw goedkeuring als een voorwaarde voor release, niet als een administratieve stap.

## Stap 6: haal de nagekeken vertalingen op in GitHub

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

Pin voor productie acties van derden op volledige commit-SHA's volgens je afhankelijkheidsbeleid. Verplaatsbare majortags houden deze tutorial leesbaar, maar onveranderlijke verwijzingen verkleinen het risico voor de toeleveringsketen.

## Stap 7: test de vertaalde pull request

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

Controleer op zijn minst:

- elke doelcatalogus bevat de nieuwe sleutels;
- placeholders en ICU-argumenten komen overeen met de brontekst;
- vertaalde knoppen passen binnen de ondersteunde viewportafmetingen;
- Markdown-koppen, lijsten, links en codefragmenten worden nog steeds correct weergegeven;
- het product en de releaseopmerkingen gebruiken dezelfde functienaam; en
- bronstrings zijn niet in doelbestanden terechtgekomen.

De reviewer moet ook het gerenderde product openen. Een controle op bestandsniveau spoort terminologiefouten op, maar kan geen afgekapte knop of regeleinde ontdekken waardoor belangrijke tekst verborgen blijft.

Voeg de vertaal-pullrequest pas samen als die controles slagen. Git bevat nu de goedgekeurde taalstatus van de release.

## Stap 8: publiceer meertalige releaseopmerkingen

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

Maak de tag pas aan nadat de pullrequests voor de functie en de vertaling zijn samengevoegd:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

De releasejob mislukt als de notities voor een van de landinstellingen ontbreken of leeg zijn. Dat is bewust. Een stille terugval zou een onvolledige release als meertalig bestempelen; een mislukte job laat het team precies zien welk bestand opnieuw ter beoordeling moet worden ingediend.

Dezelfde tag kan je build- en deploymentjobs aansturen. Laat de releasejob afhankelijk zijn van die jobs als de binaries moeten bestaan voordat de aankondiging live gaat.

## Hoe het volledige proces werkt

De afgeronde GitHub-lokalisatieworkflow heeft een duidelijke richting:

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

Elke overgang heeft één verantwoordelijkheid. Pull requests beoordelen wijzigingen in de repository. Hyperlocalise beoordeelt taalkeuzes. Tags publiceren een onveranderlijke, al beoordeelde toestand.

## Veelvoorkomende faalmodi

### De PR-controle meldt niet-gerelateerde vertalingen

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### Push van de bron kan niet worden geauthenticeerd

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### Het ophalen van vertalingen levert geen Git-diff op

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### De release kan de releaseopmerkingen niet vinden.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Vertalingen verschijnen na de productrelease.

Maak synchronisatie van vertalingen geen niet-bijgehouden taak na de release. Vereis de pullrequest voor vertalingen voordat je de tag aanmaakt, of neem lokalisatie op als expliciete controle voor releasekandidaten in je implementatieworkflow.

## Releasechecklist

Controleer voordat je een meertalige versie tagt of:

- [ ] bronstrings en Engelse releaseopmerkingen samengevoegd;
- [ ] de lokalisatiecontrole van de pull request is geslaagd;
- [ ] `hl sync push` completed after merge;
- [ ] doeltalen zijn beoordeeld en goedgekeurd in Hyperlocalise;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] geautomatiseerde, taalkundige en visuele controles zijn geslaagd;
- [ ] de vertaal-pullrequest is samengevoegd; en
- [ ] elke locale voor release notes heeft een niet-leeg bestand dat overeenkomt met de tag.

## Houd lokalisatie binnen het releaseproces.

Het belangrijkste aan de lokalisatie van GitHub is niet de YAML. Het is de reeks overdrachten met duidelijke verantwoordelijkheid.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

Dat maakt lokalisatie niet langer een taak na de ontwikkeling, maar onderdeel van de release zelf.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
