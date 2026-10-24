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

Denne vejledning guider dig gennem opsætningen af et GitHub-lokaliseringsworkflow med GitHub Actions, CLI'en `hyperlocalise` og Hyperlocalise-platformen. Du begynder med et lille eksempel og følger én produktændring fra dens første pull request til en flersproget udgivelse.

Når du er færdig, vil din arbejdsgang omfatte fire faser:

1. En ingeniør ændrer en engelsk UI-streng og dens udgivelsesnoter.
2. GitHub kontrollerer pull requesten for lokaliseringsproblemer.
3. CLI'en sender kildeindhold til Hyperlocalise, hvor teamet gennemgår oversættelserne.
4. GitHub henter de gennemgåede filer og udgiver én version med noter på engelsk, fransk og tysk.

Resultatet er en proces, der er integreret i repository'et. Ingeniørerne bliver i pull requests, sprogreviewerne arbejder med kontekst i Hyperlocalise, og udgivelsen bruger kun oversættelser, der er kommet tilbage til Git.

Hvis du vil se det bredere produktmønster før implementeringsdetaljerne, kan du se [use casen om lokalisering af GitHub-produktet](/use-cases/product-localisation).

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

- et Hyperlocalise-projekt med `en-US` som kildesprog og `fr-FR` og `de-DE` som målsprog;
- en `HYPERLOCALISE_API_KEY` GitHub Actions-hemmelighed;
- en `HYPERLOCALISE_PROJECT_ID` GitHub Actions-hemmelighed; og
- tilladelse til at tilføje arbejdsgange og repository-hemmeligheder.

Brug et GitHub-miljø som `localisation` til produktionsadgangsoplysninger, hvis din organisation kræver godkendelser af udrulning.

## Trin 1: kortlæg kilde- og målfiler

Opret `i18n.yml` i roden af repositoryet:

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

De to buckets gør ejerskabet tydeligt. `product` knytter ét kildekatalog til ét katalog for hvert målsprog. `release-notes` knytter hver engelsk Markdown-fil til den tilsvarende lokalemappe, samtidig med at filnavnet bevares.

Fastlåsning af CLI'en i konfigurationen får også lokale kørsler og CI-kørsler til at stemme overens. Opdater eksemplets version til den udgivelse, dit team har testet. Hvis du udelader `version`, skal du i stedet fastlåse inputtet `version` i installationshandlingen.

LLM-profilen bruges, når dit projekt genererer oversættelser med den udbyder. Gem udbyderens legitimationsoplysninger i Hyperlocalise i stedet for at tilføje dem til workflowet. GitHub-runneren behøver kun legitimationsoplysninger til Hyperlocalise-projektet.

## Trin 2: foretag én produktændring

Antag, at version 1.8.0 tilføjer gemte filtre. Pull requesten ændrer `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Det tilføjer også `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Commit kildeindholdet sammen med funktionen. Det giver reviewerne kodeændringen, UI-teksten og forklaringen til kunderne i én pull request. Det betyder også, at Git-historikken kan vise, hvilken formulering der blev udgivet sammen med en version.

Indsæt ikke engelske strenge manuelt i `fr-FR.json` eller `de-DE.json` som pladsholdere. En kopieret kildeværdi kan se komplet ud ved en simpel kontrol af antallet af nøgler, selvom der ikke er sket nogen lokalisering.

## Trin 3: Gennemgå ændrede strenge i pull requesten

Tilføj `.github/workflows/localise.yml`. Det første job kører ved pull requests og afgrænser Hyperlocalise-resultaterne til GitHub-diffen:

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

Med `github-diff: true` henter handlingen pull request-patchen og sender den til `hyperlocalise check --diff-stdin`. For understøttede strukturerede kataloger fokuserer annoteringerne på nøgler, der er ændret i denne pull request, i stedet for at få forfatteren til at håndtere uvedkommende efterslæb.

Handlingen uploader også sin JSON-rapport og tekstoversigt. Behold disse artefakter, hvis en kontrol mislykkes: De adskiller strukturelle fejl, manglende oversættelser og indholdsmæssige fund fra installations- eller konfigurationsfejl.

Denne kontrol er det første godkendelsestrin, ikke den sproglige gennemgang. Den fanger problemer i kodearkivet tidligt, mens en reviewer stadig vurderer, om hver oversættelse er korrekt, konsekvent og passende til produktet.

## Trin 4: push det flettede kildeindhold til Hyperlocalise

Tilføj et andet job til det samme `localise.yml` workflow:

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

Dette er push-grænsen. Når feature-pull-requesten flettes ind i `main`, læser `hl sync push` buckettene i `i18n.yml` og sender de engelske JSON- og Markdown-kilder til det tilknyttede Hyperlocalise-projekt.

Jobbet har skrivebeskyttet adgang til repositoryet, fordi det sender indhold ud, men ikke ændrer Git. Dets legitimationsoplysninger findes kun i det trin, der har brug for dem. `paths`-filteret forhindrer uvedkommende merges i at starte unødvendige synkroniseringskørsler.

Du kan køre den samme handling inden commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Brug `--dry-run`, når du ændrer bucket-tilknytninger. Det lader dig inspicere planen, før du opdaterer fjernprojektet.

## Trin 5: Gennemgå produkttekster og udgivelsesnoter sammen

Når kildesynkroniseringen er fuldført, skal du gennemgå det nye indhold i Hyperlocalise. UI-strengene og versionsnoterne ligger stadig i separate grupper, men de deler projektterminologi, instruktioner og målsprog.

I dette eksempel bør en korrekturlæser kontrollere mere end blot den bogstavelige nøjagtighed:

| Indhold         | Gennemgangsspørgsmål                                  |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Er dette tydeligt en handling frem for en gemt tilstand?    |
| `filters.saved` | Matcher termen teksten i navigation og indstillinger?        |
| Beskrivelse     | Passer det til brugergrænsefladen og bevarer det terminologien “workspace”? |
| Udgivelsestitel   | Bruger den det samme navn som produktfunktionen?        |
| Udgivelsespunkter | Er kommandoer, menunavne og brugerresultater ensartede?  |

Vedhæft produktkontekst eller skærmbilleder, når en kort streng er tvetydig. En oversætter, der kun ser “Gem filter”, kan ikke vide, om det er teksten på en knap, en toastbesked eller en sideoverskrift. Det er her, platformen supplerer CLI'en: Git flytter filer, mens Hyperlocalise indeholder den viden, der er nødvendig for at træffe et velbegrundet sprogligt valg.

Løs reviewkommentarerne, og godkend oversættelserne i overensstemmelse med projektets arbejdsgang, før du henter dem tilbage. Behandl godkendelse som en forudsætning for frigivelse, ikke som et administrativt trin.

## Trin 6: Hent gennemgåede oversættelser til GitHub

Tilføj et tredje job til `localise.yml`:

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

Kør dette job fra fanen **Actions** efter gennemgang. `hl sync pull` skriver målindhold til stierne i `i18n.yml`, hvilket resulterer i filer som:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Arbejdsgangen åbner en pull request i stedet for at committe direkte til `main`. Det bevarer grenbeskyttelsen, giver udviklerne mulighed for at køre applikationen med hvert sprog og registrerer de præcise oversættelser, der er inkluderet i udgivelsen.

Til produktionsbrug skal du fastlåse tredjepartsactions til fulde commit-SHA'er i overensstemmelse med din afhængighedspolitik. Tags for større versioner, der kan flyttes, gør denne vejledning lettere at læse, men uforanderlige referencer reducerer risikoen i forsyningskæden.

## Trin 7: Test den oversatte pull request

Den automatiserede kontrol køres igen, fordi oversættelses-pull requesten ændrer `locales/**` og `release-notes/**`. Tilføj også din applikations egne tests til de påkrævede kontroller.

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

GitHub Releases har én udgivelsesbeskrivelse, så saml hvert sprog i ét Markdown-dokument. Tilføj `.github/workflows/release.yml`:

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

Bekræft, at handlingen udløses af en `pull_request`-hændelse og angiver `github-diff: true`. Handlingen skal bruge `pull-requests: read` for at kunne hente patchen. Kontrol afgrænset til ændringer gælder for understøttede strukturerede oversættelsesfiler. Behold kontrol af hele projektet i et separat, planlagt job, hvis du også vil have overblik over efterslæbet.

### Kilde-push kan ikke godkende godkendelsen

Kontrollér, at både `HYPERLOCALISE_API_KEY` og `HYPERLOCALISE_PROJECT_ID` findes i det valgte GitHub-miljø. Miljøhemmeligheder er ikke tilgængelige, medmindre jobbet angiver det pågældende miljø, og beskyttede miljøer kan afvente godkendelse.

### Hentning af oversættelser giver ingen Git-diff

Bekræft først, at oversættelsesarbejdet er afsluttet i det samme projekt med navnet `HYPERLOCALISE_PROJECT_ID`. Kontrollér derefter mål-stierne i `i18n.yml`. Kør `hl sync pull --dry-run` lokalt for at inspicere den planlagte download uden at overskrive filer.

### Udgivelsen kan ikke finde sine noter.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Oversættelserne kommer efter produktlanceringen.

Gør ikke synkronisering af oversættelser til en ikke-sporet opgave efter udgivelsen. Kræv en pull request for oversættelser, før tagget oprettes, eller gør lokalisering til et eksplicit tjek af releasekandidaten i jeres deployment-workflow.

## Udgivelsestjekliste

Før du tagger en flersproget version, skal du bekræfte, at:

- [ ] kildetekster og engelske versionsnoter flettet sammen;
- [ ] lokaliseringstjekket for pull request bestod;
- [ ] `hl sync push` fuldført efter sammenfletning;
- [ ] målsprogene blev gennemgået og godkendt i Hyperlocalise;
- [ ] `hl sync pull` åbnede en pull request til oversættelse;
- [ ] automatiserede, sproglige og visuelle kontroller er bestået;
- [ ] oversættelsens pull request blev flettet; og
- [ ] Hver lokalitet for udgivelsesnoter har en ikke-tom fil, der matcher tagget.

## Hold lokalisering som en del af udgivelsesprocessen.

Det vigtige ved GitHub-lokalisering er ikke YAML. Det er rækken af ansvarlige overleveringer.

CLI'en `hyperlocalise` forbinder repositoryfiler med platformen. GitHub Action giver udviklere hurtig feedback på ændrede strenge. Hyperlocalise giver sprogreviewere den kontekst og godkendelsesproces, som Git alene ikke kan tilbyde. Det endelige tag udgiver præcis det, teamet har gennemgået.

Det gør lokalisering til en del af selve udgivelsen i stedet for en opgave, der først kommer efter udviklingen.

[Udforsk Hyperlocalise til produktlokalisering](/use-cases/product-localisation) for at forbinde dine kodearkiver, gennemgangsworkflows og flersprogede udgivelser.
