---
title: "GitHub-localisatieworkflow: van pull request tot meertalige release"
date: 2026-09-09T00:00:00.000Z
excerpt: Bouw een praktische lokalisatieworkflow in GitHub die gewijzigde strings controleert, bronteksten naar Hyperlocalise stuurt, nagekeken vertalingen terughaalt en meertalige releaseopmerkingen publiceert.
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

Deze handleiding begeleidt je bij het opzetten van een GitHub-localisatieworkflow met GitHub Actions, de `hyperlocalise` CLI en het Hyperlocalise-platform. Je begint met een klein voorbeeld en volgt één productwijziging vanaf de eerste pull request tot aan een meertalige release.

Aan het einde omvat je workflow vier fasen:

1. Een engineer wijzigt een Engelse UI-string en de releaseopmerkingen ervan.
2. GitHub controleert de pull request op lokalisatieproblemen.
3. De CLI stuurt de brontekst naar Hyperlocalise, waar het team de vertalingen beoordeelt.
4. GitHub haalt de beoordeelde bestanden op en publiceert één release met releasenotities in het Engels, Frans en Duits.

Het resultaat is een repository-eigen proces. Engineers blijven in pull requests, taalreviewers werken met context in Hyperlocalise en de release gebruikt alleen vertalingen die zijn teruggekeerd naar Git.

Als je het bredere productpatroon wilt zien voordat we op de implementatiedetails ingaan, bekijk dan de [usecase voor GitHub-productlokalisatie](/use-cases/product-localisation).

## Wat we gaan bouwen

Stel dat een webapplicatie deze structuur heeft:

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

Engels is de brontaal. Frans en Duits zijn doeltalen. JSON-bestanden bevatten productteksten, terwijl Markdown-bestanden release notes bevatten. Hyperlocalise behandelt beide als vertaalbare content, zodat dezelfde beoordelingscyclus zowel de interface als de aankondiging omvat.

Je hebt nodig:

- een Hyperlocalise-project met `en-US` als bronlocale en `fr-FR` en `de-DE` als doellocales;
- een `HYPERLOCALISE_API_KEY` GitHub Actions-geheim;
- een `HYPERLOCALISE_PROJECT_ID` GitHub Actions-geheim; en
- toestemming om workflows en repositorygeheimen toe te voegen.

Gebruik een GitHub-omgeving zoals `localisation` voor productie-inloggegevens als je organisatie goedkeuringen voor implementaties vereist.

## Stap 1: breng bron- en doelbestanden in kaart

Maak `i18n.yml` aan in de hoofdmap van de repository:

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

De twee buckets maken eigenaarschap expliciet. `product` koppelt één broncatalogus aan één catalogus per doeltaal. `release-notes` koppelt elk Engels Markdown-bestand aan de overeenkomstige taalmap, waarbij de bestandsnaam behouden blijft.

Door de CLI vast te zetten in de configuratie komen lokale runs en CI-runs ook overeen. Werk de voorbeeldversie bij naar de release die je team heeft getest. Als je `version` weglaat, zet dan in plaats daarvan de invoer `version` vast in de install-actie.

Het LLM-profiel wordt gebruikt wanneer je project vertalingen genereert met die provider. Sla de inloggegevens van de provider op in Hyperlocalise in plaats van ze aan de workflow toe te voegen. De GitHub-runner heeft alleen inloggegevens voor het Hyperlocalise-project nodig.

## Stap 2: breng één productwijziging aan

Stel dat versie 1.8.0 opgeslagen filters toevoegt. De pull request wijzigt `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Het voegt ook `release-notes/en-US/v1.8.0.md` toe:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Commit de broninhoud samen met de functionaliteit. Zo krijgen reviewers de codewijziging, UI-tekst en klantgerichte uitleg in één pull request. Bovendien kan de Git-geschiedenis antwoord geven op de vraag welke formulering met een release is meegeleverd.

Kopieer geen Engelse strings handmatig naar `fr-FR.json` of `de-DE.json` als tijdelijke aanduidingen. Een gekopieerde brontekst kan er bij een eenvoudige controle van het aantal sleutels compleet uitzien, ook al heeft er geen lokalisatie plaatsgevonden.

## Stap 3: controleer gewijzigde tekenreeksen in de pull request

Voeg `.github/workflows/localise.yml` toe. De eerste taak wordt uitgevoerd bij pull requests en beperkt de bevindingen van Hyperlocalise tot de GitHub-diff:

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

Met `github-diff: true` haalt de actie de patch van de pull request op en geeft deze door aan `hyperlocalise check --diff-stdin`. Voor ondersteunde gestructureerde catalogi richten annotaties zich op sleutels die door deze pull request zijn gewijzigd, in plaats van de auteur ongerelateerde achterstanden te laten oplossen.

De actie uploadt ook het JSON-rapport en de tekstsamenvatting. Bewaar die artefacten wanneer een controle mislukt: ze maken onderscheid tussen structurele fouten, ontbrekende vertalingen en inhoudelijke bevindingen enerzijds en een installatie- of configuratiefout anderzijds.

Deze controle is de eerste beoordelingsfase, niet de taalbeoordeling. Zo worden problemen met de repository vroegtijdig opgespoord, terwijl een reviewer nog steeds bepaalt of elke vertaling nauwkeurig, consistent en geschikt is voor het product.

## Stap 4: push de samengevoegde broninhoud naar Hyperlocalise

Voeg een tweede job toe aan dezelfde `localise.yml` workflow:

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

Dit is de pushgrens. Nadat de feature-pullrequest is samengevoegd met `main`, leest `hl sync push` de buckets in `i18n.yml` en stuurt het de Engelse JSON- en Markdown-bronbestanden naar het gekoppelde Hyperlocalise-project.

De job heeft alleen-lezenmachtigingen voor de repository, omdat deze content verstuurt maar Git niet wijzigt. De inloggegevens zijn alleen beschikbaar in de stap die ze nodig heeft. Het `paths`-filter voorkomt dat niet-gerelateerde merges onnodige synchronisatieruns starten.

Je kunt dezelfde bewerking uitvoeren voordat je een commit maakt:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Gebruik `--dry-run` wanneer je buckettoewijzingen wijzigt. Hiermee kun je het plan bekijken voordat je het externe project bijwerkt.

## Stap 5: beoordeel productteksten en releasenotities samen

Zodra de bronsynchronisatie is voltooid, controleer je de nieuwe content in Hyperlocalise. De UI-teksten en releaseopmerkingen blijven in afzonderlijke buckets, maar maken gebruik van dezelfde projectterminologie, instructies en doellokalen.

Bij dit voorbeeld moet een beoordelaar meer controleren dan alleen de letterlijke juistheid:

| Inhoud          | Beoordelingsvraag                                        |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is dit duidelijk een actie in plaats van een opgeslagen status?    |
| `filters.saved` | Komt de term overeen met navigatie- en instellingsteksten?        |
| Beschrijving     | Past het in de gebruikersinterface en blijft de term “workspace” behouden? |
| Releasetitel   | Gebruikt het dezelfde naam als de productfunctie?        |
| Releasebulletpoints | Zijn opdrachten, menunamen en resultaten voor gebruikers consistent?  |

Voeg productcontext of schermafbeeldingen toe wanneer een korte tekst onduidelijk is. Een vertaler die alleen ‘Filter opslaan’ ziet, kan niet weten of dit een knop, een toastmelding of een paginatitel is. Daarin vult het platform de CLI aan: Git verplaatst bestanden, terwijl Hyperlocalise de kennis meebrengt die nodig is om een goede taalkeuze te maken.

Los reviewopmerkingen op en keur de vertalingen goed volgens de workflow van je project voordat je ze terughaalt. Behandel goedkeuring als een vrijgavevoorwaarde, niet als een administratieve stap.

## Stap 6: haal de nagekeken vertalingen op in GitHub

Voeg een derde taak toe aan `localise.yml`:

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

Voer deze taak uit vanaf het tabblad **Acties** nadat je deze hebt beoordeeld. `hl sync pull` schrijft de doelinhoud naar de paden in `i18n.yml` en maakt bestanden zoals:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

De workflow opent een pull request in plaats van rechtstreeks te committen naar `main`. Zo blijft branchbeveiliging behouden, krijgen engineers de kans om de applicatie met elke locale uit te voeren en worden de exacte vertalingen die in de release zijn opgenomen vastgelegd.

Pin voor productie acties van derden op volledige commit-SHA's, volgens je afhankelijkheidsbeleid. Veranderlijke major-tags houden deze tutorial leesbaar, maar onveranderlijke verwijzingen verkleinen het risico in de softwaretoeleveringsketen.

## Stap 7: test de vertaalde pull request

De geautomatiseerde controle wordt opnieuw uitgevoerd omdat de vertaalpull-aanvraag `locales/**` en `release-notes/**` wijzigt. Voeg ook de eigen tests van uw applicatie toe aan de vereiste controles.

Controleer ten minste:

- elke doelcatalogus bevat de nieuwe sleutels;
- placeholders en ICU-argumenten komen overeen met de bron;
- vertaalde knoppen passen binnen de ondersteunde viewportformaten;
- Markdown-koppen, lijsten, links en codefragmenten worden nog steeds correct weergegeven;
- het product en de releaseopmerkingen gebruiken dezelfde functienaam; en
- bronteksten zijn niet in de doelbestanden terechtgekomen.

De beoordelaar moet ook het gerenderde product openen. Een beoordeling op bestandsniveau vangt terminologiefouten op, maar kan geen afgekapte knop of regelafbreking aan het licht brengen die belangrijke tekst verbergt.

Voeg de vertaalpullrequest alleen samen wanneer die controles slagen. Git bevat nu de goedgekeurde taalstatus van de release.

## Stap 8: publiceer meertalige releasenotes

GitHub Releases heeft één releasebeschrijving, dus stel elke locale samen in één Markdown-document. Voeg `.github/workflows/release.yml` toe:

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

Maak de tag pas aan nadat de feature- en vertaalpullrequests zijn samengevoegd:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

De releasejob mislukt als de releaseopmerkingen voor een bepaalde landinstelling ontbreken of leeg zijn. Dat is bewust. Een stille fallback zou een onvolledige release als meertalig bestempelen; een mislukte job laat het team precies weten welk bestand opnieuw ter beoordeling moet worden aangeboden.

Dezelfde tag kan je build- en deploymentjobs aansturen. Laat de releasejob afhankelijk zijn van die jobs als de binaries moeten bestaan voordat de aankondiging live gaat.

## Hoe de volledige flow werkt

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

Elke overgang heeft één verantwoordelijkheid. Pull requests beoordelen wijzigingen in de repository. Hyperlocalise beoordeelt taalkeuzes. Tags publiceren een onveranderlijke, al beoordeelde staat.

## Veelvoorkomende foutmodi

### De PR-controle meldt vertalingen die er niets mee te maken hebben

Bevestig dat de actie wordt uitgevoerd bij een `pull_request`-gebeurtenis en `github-diff: true` instelt. De actie heeft `pull-requests: read` nodig om de patch op te halen. Controles die alleen op wijzigingen zijn gericht, zijn van toepassing op ondersteunde gestructureerde vertaalbestanden; voer controles voor het volledige project uit in een aparte geplande taak als je ook inzicht wilt in de achterstand.

### Push vanaf de bron kan niet worden geverifieerd.

Controleer of zowel `HYPERLOCALISE_API_KEY` als `HYPERLOCALISE_PROJECT_ID` bestaan in de geselecteerde GitHub-omgeving. Omgevingsgeheimen zijn niet beschikbaar tenzij de job die omgeving opgeeft, en voor beveiligde omgevingen kan goedkeuring vereist zijn.

### Vertalingen ophalen levert geen Git-diff op.

Bevestig eerst dat het vertaalwerk is afgerond in hetzelfde project met de naam `HYPERLOCALISE_PROJECT_ID`. Controleer vervolgens de doelpaden in `i18n.yml`. Voer `hl sync pull --dry-run` lokaal uit om de geplande download te inspecteren zonder bestanden te overschrijven.

### De release kan de releaseopmerkingen niet vinden.

De tag en de Markdown-bestandsnaam moeten exact overeenkomen. Tag `v1.8.0` verwacht `release-notes/<locale>/v1.8.0.md`. Behoud `v` op beide plaatsen, of wijzig de padconstructie van de workflow in één weloverwogen conventiewijziging.

### Vertalingen komen na de productrelease

Maak synchronisatie van vertalingen geen niet-bijgehouden taak na de release. Vereis de pullrequest voor vertalingen voordat je de tag aanmaakt, of neem lokalisatie als expliciete controle voor de releasekandidaat op in je deploymentworkflow.

## Releasechecklist

Controleer voordat je een meertalige versie tagt of:

- [ ] bronstrings en Engelstalige release notes samengevoegd;
- [ ] de lokalisatiecontrole van de pull request is geslaagd;
- [ ] voltooid na samenvoeging; `hl sync push`
- [ ] doeltalen zijn beoordeeld en goedgekeurd in Hyperlocalise;
- [ ] `hl sync pull` heeft een pull request voor vertalingen geopend;
- [ ] geautomatiseerde, taalkundige en visuele controles geslaagd;
- [ ] de pull request voor de vertaling is samengevoegd; en
- [ ] elke locale met release-opmerkingen heeft een niet-leeg bestand dat overeenkomt met de tag.

## Houd lokalisatie binnen het releaseproces.

Het belangrijkste aan de lokalisatie van GitHub is niet de YAML. Het is de opeenvolging van overdrachten waarbij duidelijk is wie verantwoordelijk is.

De `hyperlocalise` CLI koppelt bestanden in de repository aan het platform. De GitHub Action geeft engineers snel feedback op gewijzigde strings. Hyperlocalise biedt taalbeoordelaars de context en goedkeuringsworkflow die Git alleen niet kan bieden. De definitieve tag publiceert precies wat het team heeft beoordeeld.

Zo wordt lokalisatie niet langer iets wat na de ontwikkeling gebeurt, maar onderdeel van de release zelf.

[Ontdek Hyperlocalise voor productlokalisatie](/use-cases/product-localisation) om je repositories, reviewworkflows en meertalige releases te koppelen.
