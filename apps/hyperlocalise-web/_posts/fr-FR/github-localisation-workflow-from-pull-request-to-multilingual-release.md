---
title: "Workflow de localisation sur GitHub : de la pull request à une version multilingue"
date: 2026-09-09T00:00:00.000Z
excerpt: Mettez en place un flux de travail pratique de localisation sur GitHub qui vérifie les chaînes modifiées, envoie le contenu source à Hyperlocalise, récupère les traductions révisées et publie des notes de version multilingues.
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

À la fin, votre flux de travail couvrira quatre étapes :

1. Un ingénieur modifie une chaîne d’interface utilisateur en anglais et ses notes de version.
2. GitHub vérifie la pull request pour détecter les problèmes de localisation.
3. La CLI envoie le contenu source à Hyperlocalise, où l’équipe examine les traductions.
4. GitHub récupère les fichiers révisés et publie une seule version avec des notes en anglais, en français et en allemand.

Le résultat est un processus intégré au dépôt. Les ingénieurs restent dans les pull requests, les réviseurs linguistiques travaillent avec le contexte dans Hyperlocalise, et la version ne fait appel qu’aux traductions qui sont revenues dans Git.

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

L’anglais est la langue source. Le français et l’allemand sont les langues cibles. Les fichiers JSON contiennent les textes du produit, tandis que les fichiers Markdown contiennent les notes de version. Hyperlocalise traite les deux comme du contenu à traduire, de sorte que le même cycle de révision couvre l’interface et l’annonce.

Vous aurez besoin de :

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- autorisation d’ajouter des workflows et des secrets du dépôt.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Étape 1 : associer les fichiers source et cible

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

Versionnez le contenu source en même temps que la fonctionnalité. Les réviseurs auront ainsi le changement de code, le texte de l’interface et l’explication destinée aux clients dans une seule pull request. L’historique Git permettra également de retrouver le texte livré avec une version.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Étape 3 : vérifier les chaînes modifiées dans la pull request

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

L’action téléverse également son rapport JSON et son résumé textuel. Conservez ces artefacts lorsqu’une vérification échoue : ils permettent de distinguer les erreurs structurelles, les traductions manquantes et les problèmes liés au contenu d’un échec d’installation ou de configuration.

Cette vérification constitue le premier point de contrôle de la révision, et non la révision linguistique. Elle permet de détecter rapidement les problèmes du dépôt, tandis qu’un réviseur décide encore si chaque traduction est exacte, cohérente et adaptée au produit.

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

Vous pouvez exécuter la même opération avant de valider vos modifications :

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Étape 5 : examinez ensemble les chaînes du produit et les notes de version.

Une fois la synchronisation de la source terminée, examinez le nouveau contenu dans Hyperlocalise. Les chaînes de l’interface utilisateur et les notes de version restent dans des espaces distincts, mais partagent la terminologie du projet, les instructions et les langues cibles.

Dans cet exemple, un réviseur devrait vérifier plus que l’exactitude littérale :

| Contenu         | Question de révision                                     |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| Description     | Est-ce adapté à l’interface utilisateur et le terme « workspace » est-il préservé ? |
| Titre de la version   | Porte-t-il le même nom que la fonctionnalité du produit ?        |
| Puces des notes de version | Les commandes, les noms des menus et les résultats obtenus par les utilisateurs sont-ils cohérents ?  |

Joignez le contexte du produit ou des captures d’écran lorsqu’une chaîne courte est ambiguë. Un traducteur qui ne voit que « Enregistrer le filtre » ne peut pas savoir s’il s’agit du libellé d’un bouton, d’une notification ou d’un titre de page. C’est là que la plateforme complète l’interface en ligne de commande : Git déplace les fichiers, tandis que Hyperlocalise fournit les connaissances nécessaires pour prendre une décision linguistique éclairée.

Résolvez les commentaires de révision et approuvez les traductions conformément au flux de travail de votre projet avant de les réintégrer. Considérez l’approbation comme une étape obligatoire avant la mise en production, et non comme une formalité administrative.

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

En production, épinglez les actions tierces sur des SHA de commit complets, conformément à votre politique de dépendances. Les tags de version majeure mobiles rendent ce tutoriel facile à suivre, mais les références immuables réduisent les risques liés à la chaîne d’approvisionnement.

## Étape 7 : tester la pull request traduite

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

Au minimum, vérifiez :

- chaque catalogue cible contient les nouvelles clés ;
- les espaces réservés et les arguments ICU correspondent à la source ;
- les boutons traduits tiennent dans les tailles de fenêtre prises en charge ;
- Les titres Markdown, les listes, les liens et les segments de code s’affichent toujours correctement ;
- le produit et les notes de version utilisent le même nom de fonctionnalité ; et
- les chaînes source ne se sont pas retrouvées dans les fichiers cibles.

Le réviseur devrait également ouvrir le produit tel qu’il est rendu. La révision au niveau des fichiers permet de repérer les erreurs terminologiques, mais elle ne permet pas de détecter un bouton tronqué ou un saut de ligne qui masque un texte important.

Ne fusionnez la pull request de traduction que lorsque ces vérifications auront réussi. Git contient désormais l’état linguistique approuvé pour la version.

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

Créez le tag uniquement après la fusion des demandes de tirage des fonctionnalités et des traductions :

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

La tâche de publication échoue si les notes d’une langue sont manquantes ou vides. C’est volontaire. Un repli silencieux ferait passer une publication incomplète pour une publication multilingue ; l’échec de la tâche indique précisément à l’équipe quel fichier doit repasser en révision.

Le même tag peut déclencher vos tâches de compilation et de déploiement. Faites dépendre la tâche de publication de ces tâches si les binaires doivent être disponibles avant la mise en ligne de l’annonce.

## Comment se déroule le flux complet

Le processus de localisation GitHub finalisé suit une direction claire :

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

Chaque transition a une seule responsabilité. Les demandes de fusion examinent les modifications du dépôt. Hyperlocalise examine les choix linguistiques. Les tags publient un état immuable déjà révisé.

## Modes de défaillance courants

### La vérification de la PR signale des traductions sans rapport.

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### Le push de la source ne peut pas être authentifié.

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### La récupération des traductions ne génère aucune différence dans Git.

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### La version ne trouve pas ses notes.

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Les traductions arrivent après le lancement du produit.

Ne faites pas de la synchronisation des traductions une tâche non suivie après la mise en production. Exigez que la pull request de traduction soit soumise avant de créer le tag, ou intégrez la localisation comme contrôle explicite de la release candidate dans votre workflow de déploiement.

## Liste de contrôle de mise en production

Avant d’étiqueter une version multilingue, vérifiez que :

- [ ] chaînes source et notes de version en anglais fusionnées ensemble ;
- [ ] la vérification de localisation de la pull request a réussi ;
- [ ] `hl sync push` completed after merge;
- [ ] Les langues cibles ont été examinées et approuvées dans Hyperlocalise;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] contrôles automatisés, linguistiques et visuels réussis ;
- [ ] la demande de fusion de traduction a été fusionnée ; et
- [ ] chaque locale des notes de version dispose d’un fichier non vide correspondant à la balise.

## Gardez la localisation intégrée au processus de publication.

L’élément important de la localisation de GitHub, ce n’est pas le YAML. C’est la succession de passages de relais avec des responsabilités clairement définies.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

Cela fait de la localisation non plus une tâche à effectuer après le développement, mais une partie intégrante de la version.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
