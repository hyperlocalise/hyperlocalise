---
title: "GitHub-lokaliseringsworkflow: Fra pull request til flersproget udgivelse"
date: 2026-09-09T00:00:00.000Z
excerpt: Byg en praktisk lokaliseringsarbejdsgang i GitHub, der kontrollerer ændrede strenge, sender kildeindhold til Hyperlocalise, henter gennemgåede oversættelser tilbage og udgiver flersprogede udgivelsesnoter.
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

Denne vejledning guider dig gennem opsætningen af et lokaliseringsworkflow i GitHub med GitHub Actions, `hyperlocalise`-CLI'en og Hyperlocalise-platformen. Du starter med et lille eksempel og følger en produktændring fra den første pull request til en flersproget udgivelse.

Når du er færdig, vil din arbejdsgang omfatte fire faser:

1. En ingeniør ændrer en engelsk UI-tekst og dens versionsnoter.
2. GitHub kontrollerer pull requesten for lokaliseringsproblemer.
3. CLI'en sender kildeindhold til Hyperlocalise, hvor teamet gennemgår oversættelserne.
4. GitHub henter de gennemgåede filer og udgiver én release med noter på engelsk, fransk og tysk.

Resultatet er en proces, der er integreret i repositoriet. Udviklerne arbejder fortsat i pull requests, sprogreviewere arbejder med konteksten i Hyperlocalise, og releasen bruger kun oversættelser, der er kommet tilbage til Git.

Hvis du vil se det bredere produktmønster før implementeringsdetaljerne, kan du se [GitHub-brugsscenariet for produktlokalisering](/use-cases/product-localisation).

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

Engelsk er kildesproget. Fransk og tysk er målsprog. JSON-filer indeholder produkttekster, mens Markdown-filer indeholder versionsnoter. Hyperlocalise behandler begge dele som indhold, der kan oversættes, så den samme gennemgangscyklus dækker både brugergrænsefladen og meddelelsen.

Du skal bruge:

- et Hyperlocalise-projekt med `en-US` som kildesprog og `fr-FR` og `de-DE` som målsprog;
- en `HYPERLOCALISE_API_KEY` GitHub Actions-hemmelighed;
- en `HYPERLOCALISE_PROJECT_ID` GitHub Actions-hemmelighed; og
- tilladelse til at tilføje workflows og repository-hemmeligheder.

Brug et GitHub-miljø såsom `localisation` til produktionslegitimationsoplysninger, hvis din organisation kræver godkendelser ved implementering.

## Trin 1: Tilknyt kilde- og målfilene

Opret `i18n.yml` i roden af repositoryet:

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

De to buckets gør ejerskabet tydeligt. `product` knytter ét kildekatalog til ét katalog for hvert målsprog. `release-notes` knytter hver engelsk Markdown-fil til den tilsvarende lokaliseringsmappe, samtidig med at filnavnet bevares.

Ved at fastlåse CLI-versionen i konfigurationen sikrer du også, at lokale kørsler og CI-kørsler stemmer overens. Opdater eksempelversionen til den udgivelse, som dit team har testet. Hvis du udelader `version`, skal du fastlåse inputtet `version` i installationshandlingen i stedet.

LLM-profilen bruges, når dit projekt genererer oversættelser med den pågældende udbyder. Gem udbyderens adgangsoplysninger i Hyperlocalise i stedet for at tilføje dem til arbejdsgangen. GitHub-runneren behøver kun adgangsoplysninger til Hyperlocalise-projektet.

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

Commit kildeindholdet sammen med funktionen. Det giver anmelderne kodeændringen, teksten i brugergrænsefladen og forklaringen til kunderne i én pull request. Det betyder også, at Git-historikken kan vise, hvilken ordlyd der blev leveret med en udgivelse.

Indsæt ikke engelske strenge manuelt i `fr-FR.json` eller `de-DE.json` som pladsholdere. En kopieret kildeværdi kan se komplet ud ved en simpel optælling af nøgler, selvom der ikke er sket nogen lokalisering.

## Trin 3: Gennemgå ændrede strenge i pull requesten

Tilføj `.github/workflows/localise.yml`. Det første job kører ved pull requests og afgrænser Hyperlocalise-resultater til GitHub-diffen:

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

Med `github-diff: true` henter handlingen patchen til pull requesten og sender den til `hyperlocalise check --diff-stdin`. For understøttede strukturerede kataloger fokuserer annotationerne på nøgler, der er ændret i denne pull request, i stedet for at få forfatteren til at løse urelateret efterslæb.

Handlingen uploader også sin JSON-rapport og sit tekstresumé. Behold disse filer, hvis en kontrol mislykkes: De adskiller strukturelle fejl, manglende oversættelser og indholdsfund fra installations- eller konfigurationsfejl.

Denne kontrol er det første kontroltrin, ikke den sproglige gennemgang. Den opdager problemer i repositoriet tidligt, mens en korrekturlæser stadig vurderer, om hver oversættelse er korrekt, konsekvent og passende til produktet.

## Trin 4: Overfør flettet kildeindhold til Hyperlocalise

Tilføj et andet job til den samme `localise.yml` arbejdsgang:

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

Dette er push-grænsen. Når feature-pull requesten er flettet ind i `main`, læser `hl sync push` buckets i `i18n.yml` og sender de engelske JSON- og Markdown-kilder til det tilknyttede Hyperlocalise-projekt.

Jobbet har skrivebeskyttet adgang til repositoryet, fordi det sender indhold ud, men ikke ændrer Git. Dets legitimationsoplysninger findes kun i det trin, der har brug for dem. Filteret `paths` forhindrer uvedkommende merges i at udløse unødvendige synkroniseringskørsler.

Du kan køre den samme handling, før du committer:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Brug `--dry-run`, når du ændrer bucket-tilknytninger. Det giver dig mulighed for at gennemgå planen, før du opdaterer fjernprojektet.

## Trin 5: Gennemgå produkttekster og udgivelsesnoter sammen

Når kildesynkroniseringen er fuldført, skal du gennemgå det nye indhold i Hyperlocalise. UI-strengene og versionsnoterne forbliver i separate sektioner, men de deler projekterminologi, instruktioner og målsprog og -regioner.

I dette eksempel bør en korrekturlæser kontrollere mere end den bogstavelige nøjagtighed:

| Indhold         | Gennemgangsspørgsmål                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `filters.save`  | Er dette tydeligt en handling snarere end en gemt tilstand?             |
| `filters.saved` | Matcher termen teksten i navigationen og indstillingerne?               |
| Beskrivelse     | Passer det til brugergrænsefladen og bevarer terminologien "workspace"? |
| Udgivelsestitel | Bruger den samme betegnelse som produktfunktionen?                      |
| Udgivelsesnoter | Er kommandoer, menunavne og brugerresultater konsekvente?               |

Vedhæft produktkontekst eller skærmbilleder, når en kort tekst er tvetydig. En oversætter, der kun ser »Gem filter«, kan ikke vide, om det er en knap, en toastbesked eller en sideoverskrift. Det er her, platformen supplerer CLI'en: Git flytter filer, mens Hyperlocalise sørger for den viden, der er nødvendig for at træffe et velovervejet sprogligt valg.

Afklar reviewkommentarer, og godkend oversættelserne i henhold til projektets arbejdsgang, før du henter dem ind igen. Behandl godkendelse som en betingelse for frigivelse, ikke som et administrativt trin.

## Trin 6: Hent gennemgåede oversættelser ind i GitHub

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

Kør dette job fra fanen **Actions** efter gennemgang. `hl sync pull` skriver målindhold til stierne i `i18n.yml` og opretter filer som:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Arbejdsgangen åbner en pull request i stedet for at committe direkte til `main`. Det bevarer grenbeskyttelsen, giver udviklerne mulighed for at køre applikationen med hver sprogversion og registrerer præcis, hvilke oversættelser der er med i udgivelsen.

Til produktionsbrug skal du fastlåse tredjepartsactions til fulde commit-SHA'er i overensstemmelse med din afhængighedspolitik. Flytbare major-tags gør denne vejledning lettere at læse, men uforanderlige referencer reducerer risikoen i forsyningskæden.

## Trin 7: test den oversatte pull request

Den automatiske kontrol køres igen, fordi oversættelses-pullrequesten ændrer `locales/**` og `release-notes/**`. Tilføj også din applikations egne tests til de påkrævede kontroller.

Kontrollér som minimum:

- hvert målkatalog indeholder de nye nøgler;
- pladsholdere og ICU-argumenter stemmer overens med kilden;
- oversatte knapper passer til de understøttede visningsstørrelser;
- Markdownoverskrifter, lister, links og kodeintervaller gengives stadig korrekt;
- produktet og udgivelsesnoterne bruger samme funktionsnavn; og
- Kildestrenge blev ikke lækket ind i målfilerne.

Anmelderen bør også åbne det renderede produkt. Gennemgang på filniveau fanger terminologifejl, men kan ikke afsløre en afklippet knap eller et linjeskift, der skjuler vigtig tekst.

Flet kun pull requesten med oversættelsen, når disse kontroller er bestået. Git indeholder nu udgivelsens godkendte sprogtilstand.

## Trin 8: offentliggør flersprogede versionsnoter

GitHub Releases har kun én releasebeskrivelse, så saml hver sprogversion i ét Markdown-dokument. Tilføj `.github/workflows/release.yml`:

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

Opret først tagget, når funktions- og oversættelses-pull requests er blevet flettet ind:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Udgivelsesjobbet fejler, hvis noter for et sprog mangler eller er tomme. Det er med vilje. En lydløs reserve ville få en ufuldstændig udgivelse til at fremstå som flersproget; et fejlet job fortæller teamet præcis, hvilken fil der skal gennemgås igen.

Det samme tag kan drive dine build- og deploymentjobs. Lad udgivelsesjobbet afhænge af disse jobs, hvis binærfilerne skal være tilgængelige, før annonceringen offentliggøres.

## Sådan fungerer det komplette flow

Den færdige GitHub-lokaliseringsworkflow har en klar retning:

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

Hver overgang har ét ansvar. Pull requests gennemgår ændringer i repositoriet. Hyperlocalise gennemgår sproglige beslutninger. Tags udgiver en uforanderlig, allerede gennemgået tilstand.

## Almindelige fejltyper

### PR-kontrollen rapporterer uvedkommende oversættelser

Bekræft, at handlingen køres ved en `pull_request`-hændelse og angiver `github-diff: true`. Handlingen skal bruge `pull-requests: read` for at kunne hente patchen. Diff-afgrænset kontrol gælder for understøttede strukturerede oversættelsesfiler; kør kontroller af hele projektet i et separat planlagt job, hvis du også vil have overblik over efterslæbet.

### Push fra kilden kan ikke godkendes

Kontrollér, at både `HYPERLOCALISE_API_KEY` og `HYPERLOCALISE_PROJECT_ID` findes i det valgte GitHub-miljø. Miljøhemmeligheder er ikke tilgængelige, medmindre jobbet angiver det pågældende miljø, og beskyttede miljøer kan afvente godkendelse.

### Pulling af oversættelser giver ingen Git-diff

Bekræft først, at oversættelsesarbejdet er afsluttet i det samme projekt med navnet `HYPERLOCALISE_PROJECT_ID`. Kontrollér derefter målstierne i `i18n.yml`. Kør `hl sync pull --dry-run` lokalt for at inspicere den planlagte download uden at overskrive filer.

### Udgivelsen kan ikke finde sine versionsnoter

Tagget og Markdown-filnavnet skal stemme nøjagtigt overens. Tagget `v1.8.0` forventer `release-notes/<locale>/v1.8.0.md`. Behold `v` begge steder, eller ændr arbejdsgangens stikonstruering i én bevidst konventionsopdatering.

### Oversættelser kommer efter produktudgivelsen

Gør ikke synkronisering af oversættelser til en opgave efter udgivelsen, som ikke bliver fulgt op på. Kræv en pull request med oversættelserne, før tagget oprettes, eller gør lokalisering til et eksplicit tjek af releasekandidaten i din implementeringsarbejdsgang.

## Udgivelsestjekliste

Inden du tagger en flersproget version, skal du bekræfte, at:

- [ ] kildestrenge og engelske versionsnoter flettet sammen;
- [ ] lokaliseringstjekket af pull requesten bestod;
- [ ] `hl sync push` færdiggjort efter sammenfletning;
- [ ] målsprogene blev gennemgået og godkendt i Hyperlocalise;
- [ ] `hl sync pull` åbnede en pull request til oversættelse;
- [ ] automatiske, sproglige og visuelle kontroller bestået;
- [ ] oversættelses-pull requesten blev flettet ind; og
- [ ] hver version af udgivelsesnoterne har en ikke-tom fil, der matcher tagget.

## Hold lokaliseringen som en del af udgivelsesprocessen.

Det vigtige ved lokaliseringen af GitHub er ikke YAML. Det er rækkefølgen af overdragelser med tydeligt ansvar.

`hyperlocalise`-CLI'en forbinder repositoryfiler med platformen. GitHub Action giver ingeniører hurtig feedback på ændrede strenge. Hyperlocalise giver sprogreviewere den kontekst og godkendelsesproces, som Git alene ikke kan tilbyde. Det endelige tag publicerer præcis det, teamet har gennemgået.

Det gør lokalisering til en del af selve udgivelsen i stedet for en opgave, der udføres efter udviklingen.

[Udforsk Hyperlocalise til produktlokalisering](/use-cases/product-localisation) for at forbinde dine kodearkiver, gennemgangsarbejdsgange og flersprogede udgivelser.
