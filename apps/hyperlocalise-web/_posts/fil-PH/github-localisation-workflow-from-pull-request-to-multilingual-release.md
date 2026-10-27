---
title: "Daloy ng Trabaho sa Lokalisasyon ng GitHub: Mula sa Pull Request hanggang sa Paglabas sa Maraming Wika"
date: 2026-09-09T00:00:00.000Z
excerpt: Bumuo ng praktikal na daloy ng trabaho sa localization sa GitHub na sumusuri sa mga binagong string, nagpapadala ng source content sa Hyperlocalise, nagbabalik ng mga nirepasong salin, at naglalathala ng mga multilingual na release note.
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

Gagabayan ka ng gabay na ito sa pagse-set up ng workflow para sa lokalisasyon sa GitHub gamit ang GitHub Actions, ang `hyperlocalise` CLI, at ang platform ng Hyperlocalise. Magsisimula ka sa isang maliit na halimbawa at susubaybayan ang isang pagbabago sa produkto mula sa unang pull request nito hanggang sa isang multilingual na release.

Sa pagtatapos, sasaklawin ng iyong daloy ng trabaho ang apat na yugto:

1. Binabago ng isang engineer ang isang English UI string at ang mga release note nito.
2. Sinusuri ng GitHub ang pull request kung may mga problema sa lokalisasyon.
3. Itinutulak ng CLI ang pinagmulang content papunta sa Hyperlocalise, kung saan sinusuri ng team ang mga pagsasalin.
4. Kinukuha ng GitHub ang mga nasuring file at naglalathala ng isang release na may mga tala sa Ingles, Pranses, at Aleman.

Ang resulta ay prosesong likas sa repositoryo. Nanatili ang mga engineer sa mga pull request, nagtatrabaho ang mga tagasuri ng wika nang may konteksto sa Hyperlocalise, at ginagamit lang sa release ang mga pagsasaling nakabalik na sa Git.

Kung gusto mo munang makita ang mas malawak na pattern ng produkto bago ang mga detalye ng implementasyon, tingnan ang [halimbawa ng paggamit ng lokalisasyon ng produkto ng GitHub](/use-cases/product-localisation).

## Ano ang bubuuin natin

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

Ingles ang source locale. Pranses at Aleman ang mga target locale. Nilalaman para sa produkto ang nasa mga JSON file, habang mga release note naman ang nasa mga Markdown file. Itinuturing ng Hyperlocalise na maisasalin ang dalawa, kaya saklaw ng iisang proseso ng pagsusuri ang interface at ang anunsyo.

Kakailanganin mo:

- isang proyekto ng Hyperlocalise na may `en-US` bilang lokal na pinagmulan nito at `fr-FR` at `de-DE` bilang mga target nito;
- isang `HYPERLOCALISE_API_KEY` secret ng GitHub Actions;
- isang `HYPERLOCALISE_PROJECT_ID` secret ng GitHub Actions; at
- pahintulot na magdagdag ng mga workflow at lihim ng repositoryo.

Gumamit ng GitHub environment gaya ng `localisation` para sa mga kredensyal sa produksyon kung nangangailangan ang iyong organisasyon ng mga pag-apruba sa pag-deploy.

## Hakbang 1: i-map ang mga source at target na file

Gumawa ng `i18n.yml` sa root ng repository:

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

Ginagawang malinaw ng dalawang bucket kung sino ang may-ari. Iniuugnay ng `product` ang isang source catalog sa isang catalog para sa bawat target locale. Iniuugnay naman ng `release-notes` ang bawat English Markdown file sa katumbas na direktoryo ng locale habang pinananatili ang pangalan ng file nito.

Tinitiyak din ng pag-pin sa CLI sa configuration na magkatugma ang mga local at CI run. I-update ang halimbawang bersyon sa release na nasubukan na ng team ninyo. Kung aalisin mo ang `version`, i-pin na lang ang `version` input sa install action.

Ginagamit ang LLM profile kapag bumubuo ng mga pagsasalin ang iyong proyekto gamit ang provider na iyon. Itago ang mga credential ng provider sa Hyperlocalise sa halip na idagdag ang mga ito sa workflow. Mga credential lang para sa proyektong Hyperlocalise ang kailangan ng GitHub runner.

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

I-commit ang source content kasama ng feature. Sa ganitong paraan, makikita ng mga reviewer sa iisang pull request ang pagbabago sa code, UI copy, at paliwanag para sa mga customer. Nangangahulugan din ito na masasagot ng history ng Git kung aling pananalita ang inilabas kasama ng isang release.

Huwag manu-manong kopyahin ang mga string sa Ingles papunta sa `fr-FR.json` o `de-DE.json` bilang mga placeholder. Maaaring magmukhang kumpleto ang kinopyang value ng source sa isang simpleng pagsusuri ng bilang ng mga key kahit walang naganap na lokalisasyon.

## Hakbang 3: suriin ang mga binagong string sa pull request

Idagdag ang `.github/workflows/localise.yml`. Tumatakbo ang unang trabaho kapag may pull request at nililimitahan nito sa mga pagbabago sa GitHub diff ang mga natuklasan ng Hyperlocalise:

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

Gamit ang `github-diff: true`, kinukuha ng action ang patch ng pull request at ipinapasa ito sa `hyperlocalise check --diff-stdin`. Para sa mga sinusuportahang structured catalogue, nakatuon ang mga annotation sa mga key na binago ng pull request na ito, sa halip na pagpasiyahin ang may-akda sa mga hindi kaugnay na naipong gawain.

Ina-upload din ng aksyon ang JSON report at buod na text nito. Panatilihin ang mga artifact na iyon kapag pumalya ang isang pagsusuri: inihihiwalay ng mga ito ang mga error sa istruktura, nawawalang salin, at mga natuklasan sa nilalaman mula sa pagkabigo sa pag-install o configuration.

Ang pagsusuring ito ang unang checkpoint, hindi ang pagsusuri sa wika. Maaga nitong natutukoy ang mga problema sa repository, habang ang tagasuri pa rin ang nagpapasya kung tumpak, pare-pareho, at angkop sa produkto ang bawat salin.

## Hakbang 4: itulak ang pinagsamang nilalaman ng source papunta sa Hyperlocalise

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

May read-only na pahintulot ang job sa repository dahil nagpapadala ito ng content palabas pero hindi nito binabago ang Git. Nasa step lang na nangangailangan ng mga ito ang mga credential nito. Pinipigilan ng `paths` filter ang mga hindi kaugnay na merge na lumikha ng mga hindi kailangang sync run.

Maaari mong patakbuhin ang parehong operasyon bago mag-commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Gamitin ang `--dry-run` kapag binabago ang mga mapping ng bucket. Nagbibigay-daan ito sa iyong suriin ang plano bago i-update ang remote na proyekto.

## Hakbang 5: suriin nang magkasama ang mga string ng produkto at tala para sa release

Kapag nakumpleto na ang pag-sync ng source, suriin ang bagong content sa Hyperlocalise. Nananatili sa magkahiwalay na bucket ang mga string ng UI at release notes, pero pareho ang terminolohiya ng proyekto, mga tagubilin, at mga target na locale ng mga ito.

Sa halimbawang ito, hindi lang literal na katumpakan ang dapat suriin ng tagasuri:

| Nilalaman        | Tanong sa pagsusuri                                      |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Malinaw ba itong isang aksyon, sa halip na isang naka-save na estado?    |
| `filters.saved` | Tumutugma ba ang termino sa mga teksto para sa nabigasyon at mga setting?        |
| Paglalarawan     | Angkop ba ito sa UI at napapanatili ang terminong “workspace”? |
| Pamagat ng release   | Pareho ba ang ginagamit nitong pangalan sa pangalan ng feature ng produkto?        |
| Mga bullet sa release | Pare-pareho ba ang mga command, pangalan ng menu, at resulta para sa user?  |

Maglakip ng konteksto ng produkto o mga screenshot kapag malabo ang isang maikling string. Hindi malalaman ng tagasalin na “I-save ang filter” kung label ito ng button, toast, o heading ng page. Dito kinukumpleto ng platform ang CLI: naglilipat ng mga file ang Git, samantalang dala ng Hyperlocalise ang kaalamang kailangan para makagawa ng wastong pasya sa wika.

Lutasin ang mga komento sa review at aprubahan ang mga salin ayon sa workflow ng iyong proyekto bago kunin muli ang mga ito. Ituring ang pag-apruba bilang kinakailangan bago ang release, hindi bilang administratibong hakbang.

## Hakbang 6: i-pull sa GitHub ang mga nasuring salin

Magdagdag ng ikatlong job sa `localise.yml`:

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

Patakbuhin ang job na ito mula sa tab na **Actions** pagkatapos ng pagsusuri. `hl sync pull` isinusulat ang target na nilalaman sa mga path sa `i18n.yml`, na lumilikha ng mga file gaya ng:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Nagbubukas ang workflow ng pull request sa halip na direktang mag-commit sa `main`. Pinananatili nito ang proteksyon ng branch, binibigyan ang mga engineer ng pagkakataong patakbuhin ang application gamit ang bawat locale, at itinatala ang eksaktong mga pagsasaling kasama sa release.

Para sa production, i-pin ang mga third-party action sa buong commit SHA ayon sa patakaran ninyo sa mga dependency. Nananatiling madaling basahin ang tutorial na ito dahil sa mga tag ng major version na nagbabago, pero nababawasan ng mga hindi nababagong reference ang panganib sa supply chain.

## Hakbang 7: subukan ang isinaling pull request

Muling tatakbo ang awtomatikong pagsusuri dahil binabago ng pull request para sa pagsasalin ang `locales/**` at `release-notes/**`. Idagdag din ang sarili mong mga test ng application sa mga kinakailangang pagsusuri.

Tiyakin man lang:

- bawat katalogo ng target ay naglalaman ng mga bagong key;
- tumutugma sa source ang mga placeholder at argumento ng ICU;
- Kasya ang mga isinaling button sa mga sinusuportahang laki ng viewport;
- Tama pa ring nairender ang mga heading, listahan, link, at code span sa Markdown;
- ang produkto at mga tala sa release ay gumagamit ng parehong pangalan ng feature; at
- Hindi napasama ang mga source string sa mga target na file.

Dapat ding buksan ng reviewer ang na-render na produkto. Natutukoy sa pagsusuri sa antas ng file ang mga pagkakamali sa terminolohiya, pero hindi nito naipapakita ang button na naputol o ang line break na nagtatago ng mahalagang teksto.

I-merge ang pull request ng pagsasalin lamang kapag pumasa ang mga pagsusuring iyon. Nasa Git na ngayon ang aprubadong estado ng wika para sa release.

## Hakbang 8: mag-publish ng mga tala sa release na nasa maraming wika

Iisa lang ang release body ng GitHub Releases, kaya pagsama-samahin ang bawat locale sa iisang Markdown na dokumento. Idagdag ang `.github/workflows/release.yml`:

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

Nabibigo ang release job kung nawawala o walang laman ang mga tala para sa alinmang locale. Sadyang ganito ang pagkakagawa. Kung tahimik itong magfa-fallback, mamamarkahan ang isang hindi kumpletong release bilang multilingual; ipinapaalam naman ng nabigong job sa team kung aling file ang kailangang ibalik para muling masuri.

Maaaring gamitin ang parehong tag para patakbuhin ang mga build at deployment job mo. Itakda ang release job na nakadepende sa mga job na iyon kung kailangang mayroon na ang mga binary bago maging live ang anunsyo.

## Paano gumagana ang kumpletong daloy

May malinaw na direksyon ang nakumpletong workflow ng lokalisasyon sa GitHub:

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

May iisang responsibilidad ang bawat transition. Sinusuri ng mga pull request ang mga pagbabago sa repository. Sinusuri ng Hyperlocalise ang mga pasyang pangwika. Naglalathala ang mga tag ng isang hindi na mababagong estadong nasuri na.

## Mga karaniwang uri ng pagkabigo

### Iniuulat ng PR check ang mga pagsasaling walang kaugnayan

Kumpirmahing tumatakbo ang aksyon sa isang `pull_request` event at itinatakda ang `github-diff: true`. Kailangan ng aksyon ang `pull-requests: read` para makuha nito ang patch. Nalalapat ang diff-scoped na pagsusuri sa mga sinusuportahang structured na file ng pagsasalin; panatilihing hiwalay ang mga pagsusuri sa buong proyekto sa isang nakaiskedyul na trabaho kung gusto mo ring makita ang backlog.

### Hindi makapagpatotoo ang source push

Tiyaking umiiral ang `HYPERLOCALISE_API_KEY` at `HYPERLOCALISE_PROJECT_ID` sa napiling GitHub environment. Hindi available ang mga secret ng environment maliban kung idinedeklara ng job ang environment na iyon, at maaaring maghintay ng pag-apruba ang mga protektadong environment.

### Ang pagkuha ng mga pagsasalin ay walang nagagawang Git diff

Una, kumpirmahing tapos na ang pagsasalin sa parehong proyektong pinangalanang `HYPERLOCALISE_PROJECT_ID`. Pagkatapos, tingnan ang mga target na path sa `i18n.yml`. Patakbuhin nang lokal ang `hl sync pull --dry-run` upang suriin ang nakaplanong pag-download nang hindi pinapatungan ang mga file.

### Hindi mahanap ang mga tala para sa release.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Dumarating ang mga pagsasalin pagkatapos ilabas ang produkto.

Huwag gawing hindi nasusubaybayang gawain pagkatapos ng release ang pag-sync ng mga pagsasalin. Atasan ang pagsusumite ng pull request para sa pagsasalin bago likhain ang tag, o isama ang localization bilang tahasang pagsusuri para sa release candidate sa workflow ng deployment mo.

## Checklist para sa Release

Bago lagyan ng tag ang multilingual na bersyon, tiyaking:

- [ ] Pinagsama-sama ang mga source string at tala ng release sa Ingles;
- [ ] pumasa ang pagsusuri sa lokalisasyon ng pull request;
- [ ] `hl sync push` nakumpleto pagkatapos ng merge;
- [ ] Nasuri at naaprubahan sa Hyperlocalise ang mga target na wika;
- [ ] `hl sync pull` ay nagbukas ng pull request para sa pagsasalin;
- [ ] pumasa ang mga awtomatiko, pangwika, at biswal na pagsusuri;
- [ ] na-merge na ang pull request para sa pagsasalin; at
- [ ] bawat locale ng mga release note ay may file na may laman at tumutugma sa tag.

## Panatilihin ang lokalisasyon sa proseso ng release.

Ang mahalagang bahagi ng lokalisasyon ng GitHub ay hindi ang YAML. Ito ay ang sunod-sunod na pagpasa na may malinaw na pananagutan.

Ikinokonekta ng `hyperlocalise` CLI ang mga file ng repository sa platform. Nagbibigay ang GitHub Action ng mabilis na feedback sa mga engineer tungkol sa mga binagong string. Ibinibigay ng Hyperlocalise sa mga tagasuri ng wika ang konteksto at daloy ng pag-apruba na hindi kayang ibigay ng Git lamang. Eksaktong inilalathala ng huling tag ang mga sinuri ng team.

Dahil dito, nagiging bahagi ng mismong release ang localization sa halip na isang gawaing ginagawa pagkatapos ng development.

[Tuklasin ang Hyperlocalise para sa lokalisasyon ng produkto](/use-cases/product-localisation) upang ikonekta ang iyong mga repository, workflow sa pagsusuri, at mga release sa maraming wika.
