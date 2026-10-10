---
title: "Daloy ng Lokalisasyon sa GitHub: Mula Pull Request hanggang sa Multilingguwal na Release"
date: 2026-09-09T00:00:00.000Z
excerpt: Bumuo ng praktikal na workflow sa lokalisasyon ng GitHub na sumusuri sa mga binagong string, nagpapadala ng source content sa Hyperlocalise, nagbabalik ng mga nirepasong salin, at naglalathala ng mga tala sa release sa maraming wika.
category: Inhinyeriya
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

Gagabayan ka ng gabay na ito sa pag-set up ng workflow sa lokalisasyon ng GitHub gamit ang GitHub Actions, ang `hyperlocalise` CLI, at ang platform na Hyperlocalise. Magsisimula ka sa isang maliit na halimbawa at susundan ang isang pagbabago sa produkto mula sa unang pull request nito hanggang sa paglabas nito sa maraming wika.

Sa pagtatapos, sasaklawin ng iyong daloy ng trabaho ang apat na yugto:

1. Binabago ng isang engineer ang isang English na string sa UI at ang mga tala para sa release nito.
2. Sinusuri ng GitHub ang pull request para sa mga problema sa lokalisasyon.
3. Ipinapadala ng CLI ang source content sa Hyperlocalise, kung saan sinusuri ng team ang mga salin.
4. Kinukuha ng GitHub ang mga nirebyung file at naglalathala ng isang release na may mga tala sa Ingles, Pranses, at Aleman.

Proseso ito na likas sa repository. Nanatili ang mga engineer sa mga pull request, sinusuri ng mga reviewer ng wika ang mga pagsasalin kasama ang konteksto sa Hyperlocalise, at mga pagsasaling naibalik na sa Git lamang ang ginagamit sa release.

Kung gusto mo munang makita ang mas malawak na pattern ng produkto bago ang mga detalye ng implementasyon, tingnan ang [use case ng lokalisasyon ng produkto sa GitHub](/use-cases/product-localisation).

## Ang bubuuin natin

Ipagpalagay na ganito ang istruktura ng isang web application:

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

Ingles ang source locale. French at German ang mga target locale. Naglalaman ang mga JSON file ng kopya ng produkto, samantalang naglalaman naman ang mga Markdown file ng mga tala sa release. Itinuturing ng Hyperlocalise na nilalamang maaaring isalin ang dalawa, kaya saklaw ng iisang cycle ng pagsusuri ang interface at ang anunsyo.

Kakailanganin mo:

- isang proyekto ng Hyperlocalise na may `en-US` bilang source locale nito at `fr-FR` at `de-DE` bilang mga target;
- isang `HYPERLOCALISE_API_KEY` lihim ng GitHub Actions;
- isang `HYPERLOCALISE_PROJECT_ID` secret ng GitHub Actions; at
- pahintulot na magdagdag ng mga workflow at lihim ng repository.

Gumamit ng GitHub environment gaya ng `localisation` para sa mga kredensyal sa production kung nangangailangan ang iyong organisasyon ng mga pag-apruba sa deployment.

## Hakbang 1: imapa ang mga source at target na file

Gumawa ng `i18n.yml` sa root ng repository:

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

Ginagawang malinaw ng dalawang bucket kung sino ang may-ari. `product` ay nagmamapa ng isang source catalog sa isang catalog para sa bawat target locale. `release-notes` ay nagmamapa ng bawat English Markdown file sa katumbas na direktoryo ng locale habang pinananatili ang filename nito.

Tinitiyak din ng pagtakda ng nakapirming bersyon ng CLI sa configuration na magkatugma ang mga lokal na run at run sa CI. I-update ang halimbawang bersyon sa release na nasubukan na ng team ninyo. Kung hindi ninyo isasama ang `version`, itakda sa nakapirming bersyon ang input na `version` sa halip sa install action.

Ginagamit ang LLM profile kapag bumubuo ng mga salin ang iyong proyekto gamit ang provider na iyon. Itago ang mga kredensyal ng provider sa Hyperlocalise sa halip na idagdag ang mga ito sa workflow. Mga kredensyal lang para sa proyekto sa Hyperlocalise ang kailangan ng GitHub runner.

## Hakbang 2: gumawa ng isang pagbabago sa produkto

Ipagpalagay na nagdagdag ang bersyon 1.8.0 ng mga naka-save na filter. Binabago ng pull request ang `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Nagdaragdag din ito ng `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

I-commit ang source content kasama ng feature. Sa ganitong paraan, makikita ng mga reviewer sa iisang pull request ang pagbabago sa code, teksto ng UI, at paliwanag para sa mga customer. Nangangahulugan din ito na masasagot ng history ng Git kung aling pananalita ang inilabas kasama ng isang release.

Huwag manu-manong kopyahin ang mga string sa Ingles papunta sa `fr-FR.json` o `de-DE.json` bilang mga placeholder. Maaaring magmukhang kumpleto ang kinopyang source value sa isang simpleng pagsusuri sa bilang ng key kahit walang naganap na lokalisasyon.

## Hakbang 3: suriin ang mga binagong string sa pull request

Idagdag `.github/workflows/localise.yml`. Tumatakbo ang unang trabaho kapag may mga pull request at nililimitahan nito sa mga pagbabago sa GitHub ang mga natuklasan ng Hyperlocalise:

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

Gamit ang `github-diff: true`, kinukuha ng action ang patch ng pull request at ipinapasa ito sa `hyperlocalise check --diff-stdin`. Para sa mga sinusuportahang structured catalogue, nakatuon ang mga anotasyon sa mga key na binago ng pull request na ito sa halip na papagpasiyahin ang may-akda sa hindi kaugnay na backlog.

Ina-upload din ng aksyon ang JSON report nito at buod na teksto. Panatilihin ang mga artifact na iyon kapag nabigo ang isang pagsusuri: pinag-iiba ng mga ito ang mga error sa istruktura, nawawalang salin, at mga finding sa content mula sa pagkabigo sa pag-install o configuration.

Ang pagsusuring ito ang unang yugto ng pagrepaso, hindi ang pagsusuri sa wika. Maaga nitong natutukoy ang mga problema sa repository habang tagasuri pa rin ang nagpapasya kung tumpak, pare-pareho, at angkop sa produkto ang bawat salin.

## Hakbang 4: i-push ang pinagsamang source content sa Hyperlocalise

Magdagdag ng pangalawang job sa parehong `localise.yml` workflow:

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

Ito ang hangganan ng push. Pagkatapos ma-merge ang feature pull request sa `main`, binabasa ng `hl sync push` ang mga bucket sa `i18n.yml` at ipinapadala ang mga source na JSON at Markdown sa English sa naka-link na proyekto ng Hyperlocalise.

May pahintulot lang ang trabaho na magbasa mula sa repository dahil nagpapadala ito ng content palabas pero hindi binabago ang Git. Nasa step lang kung saan kailangan ang mga credential nito. Pinipigilan ng `paths` filter ang mga hindi nauugnay na merge na magdulot ng mga hindi kailangang sync run.

Maaari mong patakbuhin ang parehong operasyon bago mag-commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Gamitin ang `--dry-run` kapag binabago ang mga mapping ng bucket. Nagbibigay-daan ito sa iyong suriin ang plano bago i-update ang remote na proyekto.

## Hakbang 5: sama-samang suriin ang mga string ng produkto at mga tala ng release

Kapag nakumpleto na ang pag-sync ng source, suriin ang bagong content sa Hyperlocalise. Nananatili sa magkakahiwalay na bucket ang mga string ng UI at mga release note, pero pareho silang gumagamit ng terminolohiya ng proyekto, mga tagubilin, at mga target na locale.

Para sa halimbawang ito, dapat suriin ng tagasuri ang higit pa sa literal na katumpakan:

| Nilalaman        | Tanong sa pagrepaso                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Malinaw ba itong isang aksyon, sa halip na isang naka-save na estado?    |
| `filters.saved` | Tugma ba ang termino sa tekstong ginagamit para sa nabigasyon at mga setting?        |
| Paglalarawan     | Kasya ba ito sa UI at napapanatili ang terminong “workspace”? |
| Pamagat ng release   | Ginagamit ba nito ang parehong pangalan ng feature ng produkto?        |
| Mga bullet point ng release | Pare-pareho ba ang mga command, pangalan ng menu, at resulta para sa user?  |

Maglakip ng konteksto ng produkto o mga screenshot kapag malabo ang isang maikling string. Hindi malalaman ng tagasalin na “I-save ang filter” lang ang nakikita kung label ito ng button, toast, o pamagat ng page. Dito nagiging katuwang ng CLI ang platform: inililipat ng Git ang mga file, samantalang dala ng Hyperlocalise ang kaalamang kailangan para makapagpasya nang wasto sa wika.

Lutasin ang mga komento sa review at aprubahan ang mga pagsasalin ayon sa workflow ng iyong proyekto bago ibalik ang mga ito. Ituring ang pag-apruba bilang isang kinakailangan bago mag-release, hindi bilang isang hakbang na pang-administratibo.

## Hakbang 6: i-pull ang mga nirepasong salin mula sa GitHub

Magdagdag ng ikatlong trabaho sa `localise.yml`:

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

Patakbuhin ang trabahong ito mula sa tab na **Actions** pagkatapos ng pagsusuri. `hl sync pull` ay nagsusulat ng target na content sa mga path na nasa `i18n.yml`, na lumilikha ng mga file gaya ng:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Nagbubukas ang workflow ng pull request sa halip na direktang mag-commit sa `main`. Pinananatili nito ang proteksyon ng branch, binibigyan ang mga engineer ng pagkakataong patakbuhin ang application sa bawat locale, at itinatala ang eksaktong mga saling kasama sa release.

Para sa production, i-pin ang mga third-party action sa buong commit SHA alinsunod sa patakaran ninyo sa dependency. Pinananatiling madaling sundan ang tutorial na ito ng mga nagbabagong major tag, pero binabawasan ng mga hindi nababagong reference ang panganib sa supply chain.

## Hakbang 7: subukan ang isinaling pull request

Muling tatakbo ang awtomatikong pagsusuri dahil binabago ng pull request para sa pagsasalin ang `locales/**` at `release-notes/**`. Idagdag din ang sarili mong mga test ng application sa mga kinakailangang check.

Tiyakin man lang:

- bawat target catalog ay naglalaman ng mga bagong key;
- tumutugma sa pinagmulan ang mga placeholder at argumento ng ICU;
- magkasya ang mga naisaling button sa mga sinusuportahang laki ng viewport;
- Nananatiling tama ang pag-render ng mga heading, listahan, link, at code span sa Markdown;
- ginagamit ng produkto at mga tala sa paglabas ang parehong pangalan ng feature; at
- Hindi napunta ang mga source string sa mga target na file.

Dapat ding buksan ng tagasuri ang produktong na-render. Natutukoy ng pagsusuri sa antas ng file ang mga error sa terminolohiya, ngunit hindi nito makikita ang button na hindi buo ang pagkakakita o ang line break na nagtatago ng mahalagang teksto.

I-merge lang ang translation pull request kapag pumasa ang mga check na iyon. Nasa Git na ngayon ang aprubadong estado ng wika para sa release.

## Hakbang 8: mag-publish ng mga tala ng release sa maraming wika

May iisang release body ang GitHub Releases, kaya tipunin ang bawat locale sa iisang Markdown na dokumento. Idagdag ang `.github/workflows/release.yml`:

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

Gawin lang ang tag pagkatapos ma-merge ang mga pull request para sa feature at pagsasalin:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Bumabagsak ang release job kapag nawawala o walang laman ang notes ng anumang locale. Sadyang ganito ang disenyo. Kung tahimik itong magfa-fallback, mamamarkahan ang hindi kumpletong release bilang multilingual; ipinapaalam naman ng nabigong job sa team kung aling file ang kailangang muling dumaan sa review.

Maaaring gamitin ang parehong tag para patakbuhin ang iyong mga trabaho sa pagbuo at pag-deploy. Gawing nakadepende ang release job sa mga trabahong iyon kung kailangang mayroon na ang mga binary bago maging live ang anunsyo.

## Paano gumagana ang buong daloy

May malinaw na direksyon ang natapos na workflow ng lokalisasyon sa GitHub:

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

May iisang responsibilidad ang bawat transition. Sinusuri ng mga pull request ang mga pagbabago sa repository. Sinusuri ng Hyperlocalise ang mga pasyang pangwika. Nagpa-publish ang mga tag ng isang hindi na mababagong estado na nasuri na.

## Mga Karaniwang Uri ng Pagkabigo

### Nag-uulat ang pagsusuri ng PR ng mga hindi nauugnay na pagsasalin

Kumpirmahing tumatakbo ang aksyon sa isang `pull_request` event at itinatakda ang `github-diff: true`. Kailangan ng aksyon ang `pull-requests: read` para makuha nito ang patch. Nalalapat ang diff-scoped checking sa mga sinusuportahang structured na file ng pagsasalin; panatilihing hiwalay ang mga full-project check sa isang naka-iskedyul na job kung gusto mo ring makita ang backlog.

### Hindi mapatunayan ang source push.

Tingnan kung parehong `HYPERLOCALISE_API_KEY` at `HYPERLOCALISE_PROJECT_ID` ay umiiral sa napiling GitHub environment. Hindi available ang mga lihim ng environment maliban kung idineklara ng job ang environment na iyon, at maaaring maghintay ng pag-apruba ang mga protektadong environment.

### Walang nagagawang Git diff ang pag-pull ng mga pagsasalin.

Kumpirmahin muna na tapos na ang pagsasalin sa parehong proyektong pinangalanan ng `HYPERLOCALISE_PROJECT_ID`. Pagkatapos, tingnan ang mga target path sa `i18n.yml`. Patakbuhin nang lokal ang `hl sync pull --dry-run` upang suriin ang planong pag-download nang hindi ino-overwrite ang mga file.

### Hindi mahanap ng release ang mga tala nito.

Dapat eksaktong magkatugma ang tag at filename ng Markdown. Inaasahan ng tag na `v1.8.0` ang `release-notes/<locale>/v1.8.0.md`. Panatilihin ang `v` sa parehong lugar, o baguhin ang pagbuo ng path ng workflow sa iisang sinadyang pag-update ng convention.

### Darating ang mga pagsasalin pagkatapos ilunsad ang produkto.

Huwag gawing gawaing hindi sinusubaybayan pagkatapos ng release ang pag-sync ng mga salin. Atasan ang pagsusumite ng pull request para sa pagsasalin bago likhain ang tag, o ituring ang lokalisasyon bilang tahasang pagsusuri sa release candidate sa workflow ng deployment mo.

## Checklist sa Pag-release

Bago mag-tag ng multilingguwal na bersyon, kumpirmahin na:

- [ ] Pinagsama-sama ang mga source string at English release notes;
- [ ] pumasa ang pagsusuri sa lokalisasyon ng pull request;
- [ ] `hl sync push` nakumpleto pagkatapos ng pagsasanib;
- [ ] sinuri at inaprubahan ang mga target na wika sa Hyperlocalise;
- [ ] `hl sync pull` ay nagbukas ng pull request para sa pagsasalin;
- [ ] naipasa ang mga awtomatiko, pangwika, at biswal na pagsusuri;
- [ ] na-merge na ang pull request para sa pagsasalin; at
- [ ] bawat locale ng mga tala sa release ay may file na hindi blangko na tumutugma sa tag.

## Panatilihin ang localization sa proseso ng release.

Ang mahalagang bahagi ng lokalisasyon ng GitHub ay hindi ang YAML. Ito ay ang sunod-sunod na paglilipat na may malinaw na pananagutan.

Ikinokonekta ng `hyperlocalise` CLI ang mga file ng repository sa platform. Nagbibigay ang GitHub Action ng mabilis na feedback sa mga binagong string para sa mga engineer. Binibigyan ng Hyperlocalise ang mga tagasuri ng wika ng konteksto at workflow ng pag-apruba na hindi maibibigay ng Git lamang. Eksaktong inilalathala ng huling tag ang sinuri ng team.

Dahil dito, nagiging bahagi na mismo ng release ang localization, sa halip na isang gawaing ginagawa pagkatapos ng development.

[Tuklasin ang Hyperlocalise para sa lokalisasyon ng produkto](/use-cases/product-localisation) para ikonekta ang iyong mga repository, workflow ng pagsusuri, at mga multilingual na release.
