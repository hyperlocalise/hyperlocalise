---
title: "Processus de localisation GitHub : de la pull request à la publication multilingue"
date: 2026-09-09T00:00:00.000Z
excerpt: Créez un workflow pratique de localisation GitHub qui vérifie les chaînes modifiées, envoie le contenu source à Hyperlocalise, récupère les traductions révisées et publie des notes de version multilingues.
category: Ingénierie
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

À la fin, votre flux de travail couvrira quatre étapes :

1. Un ingénieur modifie une chaîne d’interface utilisateur en anglais et ses notes de version.
2. GitHub vérifie la pull request afin de détecter les problèmes de localisation.
3. Le CLI transmet le contenu source à Hyperlocalise, où l’équipe examine les traductions.
4. GitHub récupère les fichiers révisés et publie une version accompagnée de notes en anglais, français et allemand.

Le résultat s’inscrit dans un processus intégré au dépôt. Les ingénieurs restent dans les pull requests, les réviseurs linguistiques travaillent avec le contexte dans Hyperlocalise, et la version publiée n’utilise que les traductions revenues dans Git.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## Ce que nous allons construire

Supposons qu’une application web ait cette structure :

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

L’anglais est la langue source. Le français et l’allemand sont les langues cibles. Les fichiers JSON contiennent les textes du produit, tandis que les fichiers Markdown contiennent les notes de version. Hyperlocalise traite les deux comme du contenu à traduire, afin que le même cycle de révision couvre l’interface et l’annonce.

Vous aurez besoin de :

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- autorisation d’ajouter des workflows et des secrets de dépôt.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Étape 1 : mapper les fichiers source et cible

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.12.1

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

Le profil LLM est utilisé lorsque votre projet génère des traductions avec ce fournisseur. Stockez les identifiants du fournisseur dans Hyperlocalise plutôt que de les ajouter au workflow. Le runner GitHub n’a besoin que des identifiants du projet Hyperlocalise.

## Étape 2 : apportez une modification au produit

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

Validez le contenu source avec la fonctionnalité. Cela permet aux réviseurs de trouver la modification du code, les textes d’interface et l’explication destinée aux clients dans une seule pull request. Cela permet également à l’historique Git d’indiquer quelle formulation a été publiée avec une version.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Étape 3 : vérifiez les chaînes modifiées dans la pull request

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

L’action télécharge également son rapport JSON et son résumé texte. Conservez ces artefacts lorsqu’une vérification échoue : ils permettent de distinguer les erreurs structurelles, les traductions manquantes et les problèmes de contenu d’un échec d’installation ou de configuration.

Cette vérification constitue la première étape de contrôle, et non la révision linguistique. Elle permet de détecter rapidement les problèmes liés au dépôt, tandis qu’un réviseur détermine encore si chaque traduction est exacte, cohérente et adaptée au produit.

## Étape 4 : envoyer le contenu source fusionné vers Hyperlocalise

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

Vous pouvez exécuter la même opération avant de valider :

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Étape 5 : relisez ensemble les chaînes du produit et les notes de version

Une fois la synchronisation de la source terminée, examinez le nouveau contenu dans Hyperlocalise. Les chaînes de l’interface utilisateur et les notes de version restent dans des compartiments distincts, mais elles partagent la terminologie du projet, les instructions et les paramètres régionaux cibles.

Pour cet exemple, un réviseur doit vérifier plus que l’exactitude littérale :

| Contenu         | Question d’évaluation                                   |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| Description     | Cela convient-il à l’interface utilisateur et préserve-t-il la terminologie « workspace » ? |
| Titre de la version   | Utilise-t-il le même nom que la fonctionnalité du produit ?        |
| Points de la version | Les commandes, les noms de menus et les résultats pour l’utilisateur sont-ils cohérents ?  |

Joignez le contexte produit ou des captures d’écran lorsqu’une chaîne courte est ambiguë. Un traducteur qui ne voit que « Save filter » ne peut pas savoir s’il s’agit du libellé d’un bouton, d’une notification toast ou d’un titre de page. C’est ce contexte qui permet à la plateforme de compléter la CLI : Git déplace les fichiers, tandis qu’Hyperlocalise transmet les connaissances nécessaires pour prendre une décision linguistique éclairée.

Résolvez les commentaires de révision et approuvez les traductions conformément au processus de votre projet avant de les rapatrier. Considérez l’approbation comme une étape de validation de la mise en production, et non comme une formalité administrative.

## Étape 6 : récupérer les traductions révisées dans GitHub

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

Pour la production, épinglez les actions tierces sur des SHA de commit complets conformément à votre politique de dépendances. Les balises majeures évolutives permettent de garder ce tutoriel lisible, mais les références immuables réduisent les risques liés à la chaîne d’approvisionnement.

## Étape 7 : tester la pull request traduite

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

Au minimum, vérifiez :

- tous les catalogues cibles contiennent les nouvelles clés ;
- les espaces réservés et les arguments ICU correspondent à la source ;
- les boutons traduits tiennent dans les tailles d’affichage prises en charge ;
- Les titres Markdown, les listes, les liens et les segments de code s’affichent toujours correctement ;
- le produit et les notes de version utilisent le même nom de fonctionnalité ; et
- Les chaînes source ne se sont pas retrouvées dans les fichiers cibles.

Le réviseur doit également ouvrir le produit rendu. La révision au niveau des fichiers permet de détecter les erreurs de terminologie, mais elle ne peut pas révéler un bouton tronqué ou un saut de ligne qui masque un texte important.

Ne fusionnez la pull request de traduction que lorsque ces vérifications sont réussies. Git contient désormais l’état linguistique approuvé de la version.

## Étape 8 : publier les notes de version multilingues

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

Créez le tag uniquement après la fusion des pull requests de fonctionnalité et de traduction :

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

La tâche de publication échoue si les notes d’une quelconque langue sont absentes ou vides. C’est intentionnel. Un repli silencieux ferait passer une publication incomplète pour une publication multilingue ; l’échec de la tâche indique à l’équipe exactement quel fichier doit repasser par la révision.

Le même tag peut piloter vos tâches de build et de déploiement. Faites dépendre la tâche de publication de ces tâches si les binaires doivent exister avant la mise en ligne de l’annonce.

## Fonctionnement du flux complet

Le workflow de localisation GitHub finalisé suit une direction claire :

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

Chaque transition a une seule responsabilité. Les pull requests examinent les modifications du dépôt. Hyperlocalise examine les choix linguistiques. Les tags publient un état immuable déjà vérifié.

## Modes d’échec courants

### La vérification de la PR signale des traductions sans rapport.

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### La source push ne peut pas s’authentifier

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### Le téléchargement des traductions ne produit aucune différence Git

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### La version ne trouve pas ses notes

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Les traductions arrivent après la sortie du produit

Ne faites pas de la synchronisation des traductions une tâche post-publication non suivie. Exigez la pull request de traduction avant de créer le tag, ou modélisez la localisation comme une vérification explicite de la release candidate dans votre workflow de déploiement.

## Liste de contrôle de publication

Avant de baliser une version multilingue, vérifiez que :

- [ ] chaînes sources et notes de version en anglais fusionnées ;
- [ ] la vérification de localisation de la pull request a réussi ;
- [ ] `hl sync push` completed after merge;
- [ ] les langues cibles ont été révisées et approuvées dans Hyperlocalise ;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] vérifications automatisées, linguistiques et visuelles réussies ;
- [ ] la pull request de traduction a été fusionnée ; et
- [ ] chaque paramètre régional des notes de version possède un fichier non vide correspondant à la balise.

## Gardez la localisation dans le processus de publication

L’élément important de la localisation de GitHub n’est pas le YAML. C’est la succession de transmissions dont la responsabilité est clairement définie.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

Cela transforme la localisation d’une tâche effectuée après le développement en une partie intégrante de la mise en production.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
