---
title: "GitHub-lokaliseringsworkflow: Fra pull request til flersproget udgivelse"
date: 2026-09-09T00:00:00.000Z
excerpt: Opbyg en praktisk lokaliseringsarbejdsgang i GitHub, der kontrollerer ændrede strenge, sender kildeindhold til Hyperlocalise, henter gennemgåede oversættelser tilbage og udgiver flersprogede udgivelsesnoter.
category: Teknik
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

Når du er færdig, vil din arbejdsgang omfatte fire faser:

1. En ingeniør ændrer en engelsk UI-streng og dens udgivelsesnoter.
2. GitHub kontrollerer pull requesten for lokaliseringsproblemer.
3. CLI'en sender kildeindhold til Hyperlocalise, hvor teamet gennemgår oversættelserne.
4. GitHub henter de gennemgåede filer og udgiver én version med noter på engelsk, fransk og tysk.

Resultatet er en proces, der er integreret i repository'et. Ingeniørerne bliver i pull requests, sprogreviewerne arbejder med kontekst i Hyperlocalise, og udgivelsen bruger kun oversættelser, der er kommet tilbage til Git.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## Hvad vi vil bygge

Antag, at en webapplikation har denne struktur:

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

Engelsk er kildelokalet. Fransk og tysk er målsprog. JSON-filer indeholder produkttekster, mens Markdown-filer indeholder versionsnoter. Hyperlocalise behandler begge dele som indhold, der skal oversættes, så den samme gennemgangscyklus omfatter både brugergrænsefladen og annonceringen.

Du skal bruge:

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- tilladelse til at tilføje arbejdsgange og repository-hemmeligheder.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Trin 1: kortlæg kilde- og målfiler

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.13.3

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

LLM-profilen bruges, når dit projekt genererer oversættelser med den udbyder. Gem udbyderens legitimationsoplysninger i Hyperlocalise i stedet for at tilføje dem til workflowet. GitHub-runneren behøver kun legitimationsoplysninger til Hyperlocalise-projektet.

## Trin 2: foretag én produktændring

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

Commit kildeindholdet sammen med funktionen. Det giver reviewerne kodeændringen, UI-teksten og forklaringen til kunderne i én pull request. Det betyder også, at Git-historikken kan vise, hvilken formulering der blev udgivet sammen med en version.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Trin 3: Gennemgå ændrede strenge i pull requesten

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

Handlingen uploader også sin JSON-rapport og tekstoversigt. Behold disse artefakter, hvis en kontrol mislykkes: De adskiller strukturelle fejl, manglende oversættelser og indholdsmæssige fund fra installations- eller konfigurationsfejl.

Denne kontrol er det første godkendelsestrin, ikke den sproglige gennemgang. Den fanger problemer i kodearkivet tidligt, mens en reviewer stadig vurderer, om hver oversættelse er korrekt, konsekvent og passende til produktet.

## Trin 4: push det flettede kildeindhold til Hyperlocalise

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

Du kan køre den samme handling inden commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Trin 5: Gennemgå produkttekster og udgivelsesnoter sammen

Når kildesynkroniseringen er fuldført, skal du gennemgå det nye indhold i Hyperlocalise. UI-strengene og versionsnoterne ligger stadig i separate grupper, men de deler projektterminologi, instruktioner og målsprog.

I dette eksempel bør en korrekturlæser kontrollere mere end blot den bogstavelige nøjagtighed:

| Indhold         | Gennemgangsspørgsmål                                  |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| Beskrivelse     | Passer det til brugergrænsefladen og bevarer det terminologien “workspace”? |
| Udgivelsestitel   | Bruger den det samme navn som produktfunktionen?        |
| Udgivelsespunkter | Er kommandoer, menunavne og brugerresultater ensartede?  |

Vedhæft produktkontekst eller skærmbilleder, når en kort streng er tvetydig. En oversætter, der kun ser “Gem filter”, kan ikke vide, om det er teksten på en knap, en toastbesked eller en sideoverskrift. Det er her, platformen supplerer CLI'en: Git flytter filer, mens Hyperlocalise indeholder den viden, der er nødvendig for at træffe et velbegrundet sprogligt valg.

Løs reviewkommentarerne, og godkend oversættelserne i overensstemmelse med projektets arbejdsgang, før du henter dem tilbage. Behandl godkendelse som en forudsætning for frigivelse, ikke som et administrativt trin.

## Trin 6: Hent gennemgåede oversættelser til GitHub

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

Til produktionsbrug skal du fastlåse tredjepartsactions til fulde commit-SHA'er i overensstemmelse med din afhængighedspolitik. Tags for større versioner, der kan flyttes, gør denne vejledning lettere at læse, men uforanderlige referencer reducerer risikoen i forsyningskæden.

## Trin 7: Test den oversatte pull request

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

Som minimum skal du kontrollere:

- hvert målkatalog indeholder de nye nøgler;
- pladsholdere og ICU-argumenter stemmer overens med kilden;
- oversatte knapper passer til de understøttede viewportstørrelser;
- Markdown-overskrifter, -lister, -links og kodeområder gengives stadig korrekt;
- produktet og versionsnoterne bruger det samme funktionsnavn; og
- Kildestrengene lækkede ikke ind i målfilerne.

Korrekturlæseren bør også åbne det renderede produkt. Gennemgang på filniveau fanger terminologifejl, men kan ikke afsløre en afskåret knap eller et linjeskift, der skjuler vigtig tekst.

Flet kun oversættelses-pull requesten, når disse kontroller er bestået. Git indeholder nu udgivelsens godkendte sprogversion.

## Trin 8: offentliggør flersprogede versionsnoter

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

Opret først tagget, når pullanmodningerne til funktionen og oversættelsen er blevet flettet ind:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Udgivelsesjobbet fejler, hvis en lokalitets noter mangler eller er tomme. Det er tilsigtet. En lydløs reserve ville mærke en ufuldstændig udgivelse som flersproget; et fejlet job fortæller teamet præcis, hvilken fil der skal gennemgås igen.

Det samme tag kan udløse dine build- og deploymentjobs. Lad releasejobbet afhænge af disse jobs, hvis binærfilerne skal være til stede, før annonceringen offentliggøres.

## Sådan fungerer hele forløbet

Den færdige GitHub-lokaliseringsarbejdsgang har en tydelig retning:

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

Hver overgang har ét ansvar. Pull requests gennemgår ændringer i kodearkivet. Hyperlocalise gennemgår sproglige beslutninger. Tags udgiver en uforanderlig, allerede gennemgået tilstand.

## Almindelige fejltilstande

### PR-kontrollen rapporterer uvedkommende oversættelser

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### Kilde-push kan ikke godkende godkendelsen

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### Hentning af oversættelser giver ingen Git-diff

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### Udgivelsen kan ikke finde sine noter.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Oversættelserne kommer efter produktlanceringen.

Gør ikke synkronisering af oversættelser til en ikke-sporet opgave efter udgivelsen. Kræv en pull request for oversættelser, før tagget oprettes, eller gør lokalisering til et eksplicit tjek af releasekandidaten i jeres deployment-workflow.

## Udgivelsestjekliste

Før du tagger en flersproget version, skal du bekræfte, at:

- [ ] kildetekster og engelske versionsnoter flettet sammen;
- [ ] lokaliseringstjekket for pull request bestod;
- [ ] `hl sync push` completed after merge;
- [ ] målsprogene blev gennemgået og godkendt i Hyperlocalise;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] automatiserede, sproglige og visuelle kontroller er bestået;
- [ ] oversættelsens pull request blev flettet; og
- [ ] Hver lokalitet for udgivelsesnoter har en ikke-tom fil, der matcher tagget.

## Hold lokalisering som en del af udgivelsesprocessen.

Det vigtige ved GitHub-lokalisering er ikke YAML. Det er rækken af ansvarlige overleveringer.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

Det gør lokalisering til en del af selve udgivelsen i stedet for en opgave, der først kommer efter udviklingen.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
