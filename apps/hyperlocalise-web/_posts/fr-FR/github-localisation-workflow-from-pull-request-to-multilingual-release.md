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

Ce guide vous accompagne dans la mise en place d’un flux de localisation GitHub avec GitHub Actions, l’outil CLI `hyperlocalise` et la plateforme Hyperlocalise. Vous commencerez par un petit exemple et suivrez une modification de produit, de sa première pull request jusqu’à une version multilingue.

À la fin, votre flux de travail couvrira quatre étapes :

1. Un ingénieur modifie une chaîne d’interface utilisateur en anglais et ses notes de version.
2. GitHub vérifie la pull request afin de détecter les problèmes de localisation.
3. Le CLI transmet le contenu source à Hyperlocalise, où l’équipe examine les traductions.
4. GitHub récupère les fichiers révisés et publie une version accompagnée de notes en anglais, français et allemand.

Le résultat s’inscrit dans un processus intégré au dépôt. Les ingénieurs restent dans les pull requests, les réviseurs linguistiques travaillent avec le contexte dans Hyperlocalise, et la version publiée n’utilise que les traductions revenues dans Git.

Si vous souhaitez consulter le schéma général du produit avant les détails de mise en œuvre, consultez le [cas d’utilisation de la localisation du produit GitHub](/use-cases/product-localisation).

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

- un projet Hyperlocalise avec `en-US` comme langue source et `fr-FR` et `de-DE` comme langues cibles ;
- un `HYPERLOCALISE_API_KEY` secret GitHub Actions ;
- un `HYPERLOCALISE_PROJECT_ID` secret GitHub Actions ; et
- autorisation d’ajouter des workflows et des secrets de dépôt.

Utilisez un environnement GitHub tel que `localisation` pour les identifiants de production si votre organisation exige des approbations de déploiement.

## Étape 1 : mapper les fichiers source et cible

Créez `i18n.yml` à la racine du dépôt :

```yaml
version: hyperlocalise@1.11.0

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

Les deux buckets rendent la propriété explicite. `product` associe un catalogue source à un catalogue par langue cible. `release-notes` associe chaque fichier Markdown en anglais au répertoire de langue correspondant tout en conservant son nom de fichier.

Épingler la CLI dans la configuration permet également d’aligner les exécutions locales et CI. Mettez à jour la version d’exemple avec la version publiée que votre équipe a testée. Si vous omettez `version`, épinglez plutôt l’entrée `version` dans l’action d’installation.

Le profil LLM est utilisé lorsque votre projet génère des traductions avec ce fournisseur. Stockez les identifiants du fournisseur dans Hyperlocalise plutôt que de les ajouter au workflow. Le runner GitHub n’a besoin que des identifiants du projet Hyperlocalise.

## Étape 2 : apportez une modification au produit

Supposons que la version 1.8.0 ajoute des filtres enregistrés. La pull request modifie `locales/en-US.json` :

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Cela ajoute également `release-notes/en-US/v1.8.0.md` :

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Validez le contenu source avec la fonctionnalité. Cela permet aux réviseurs de trouver la modification du code, les textes d’interface et l’explication destinée aux clients dans une seule pull request. Cela permet également à l’historique Git d’indiquer quelle formulation a été publiée avec une version.

Ne recopiez pas manuellement les chaînes anglaises dans `fr-FR.json` ou `de-DE.json` en guise d’espaces réservés. Une valeur source copiée peut sembler complète lors d’une simple vérification du nombre de clés, même si aucune localisation n’a été effectuée.

## Étape 3 : vérifiez les chaînes modifiées dans la pull request

Ajoutez `.github/workflows/localise.yml`. Le premier job s’exécute lors des pull requests et limite les résultats de Hyperlocalise aux différences GitHub :

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

Avec `github-diff: true`, l’action récupère le correctif de la pull request et le transmet à `hyperlocalise check --diff-stdin`. Pour les catalogues structurés pris en charge, les annotations se concentrent sur les clés modifiées par cette pull request plutôt que de demander à l’auteur de résoudre un backlog sans rapport.

L’action télécharge également son rapport JSON et son résumé texte. Conservez ces artefacts lorsqu’une vérification échoue : ils permettent de distinguer les erreurs structurelles, les traductions manquantes et les problèmes de contenu d’un échec d’installation ou de configuration.

Cette vérification constitue la première étape de contrôle, et non la révision linguistique. Elle permet de détecter rapidement les problèmes liés au dépôt, tandis qu’un réviseur détermine encore si chaque traduction est exacte, cohérente et adaptée au produit.

## Étape 4 : envoyer le contenu source fusionné vers Hyperlocalise

Ajoutez un deuxième job au même workflow `localise.yml` :

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

Ceci est la limite de push. Une fois la pull request de fonctionnalité fusionnée dans `main`, `hl sync push` lit les buckets dans `i18n.yml` et envoie les sources JSON et Markdown en anglais au projet Hyperlocalise associé.

Le job dispose d’autorisations en lecture seule sur le dépôt, car il envoie du contenu, mais ne modifie pas Git. Ses identifiants ne sont disponibles que dans l’étape qui en a besoin. Le filtre `paths` empêche les fusions sans rapport de créer des exécutions de synchronisation inutiles.

Vous pouvez exécuter la même opération avant de valider :

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Utilisez `--dry-run` lors de la modification des mappages de buckets. Il vous permet d’inspecter le plan avant de mettre à jour le projet distant.

## Étape 5 : relisez ensemble les chaînes du produit et les notes de version

Une fois la synchronisation de la source terminée, examinez le nouveau contenu dans Hyperlocalise. Les chaînes de l’interface utilisateur et les notes de version restent dans des compartiments distincts, mais elles partagent la terminologie du projet, les instructions et les paramètres régionaux cibles.

Pour cet exemple, un réviseur doit vérifier plus que l’exactitude littérale :

| Contenu         | Question d’évaluation                                   |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | S’agit-il clairement d’une action plutôt que d’un état enregistré ?    |
| `filters.saved` | Le terme correspond-il au texte de navigation et des paramètres ?        |
| Description     | Cela convient-il à l’interface utilisateur et préserve-t-il la terminologie « workspace » ? |
| Titre de la version   | Utilise-t-il le même nom que la fonctionnalité du produit ?        |
| Points de la version | Les commandes, les noms de menus et les résultats pour l’utilisateur sont-ils cohérents ?  |

Joignez le contexte produit ou des captures d’écran lorsqu’une chaîne courte est ambiguë. Un traducteur qui ne voit que « Save filter » ne peut pas savoir s’il s’agit du libellé d’un bouton, d’une notification toast ou d’un titre de page. C’est ce contexte qui permet à la plateforme de compléter la CLI : Git déplace les fichiers, tandis qu’Hyperlocalise transmet les connaissances nécessaires pour prendre une décision linguistique éclairée.

Résolvez les commentaires de révision et approuvez les traductions conformément au processus de votre projet avant de les rapatrier. Considérez l’approbation comme une étape de validation de la mise en production, et non comme une formalité administrative.

## Étape 6 : récupérer les traductions révisées dans GitHub

Ajouter un troisième job à `localise.yml`:

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

Exécutez ce job depuis l’onglet **Actions** après examen. `hl sync pull` écrit le contenu cible dans les chemins indiqués dans `i18n.yml`, en produisant des fichiers tels que :

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Le workflow ouvre une pull request au lieu de valider directement dans `main`. Cela préserve la protection de la branche, permet aux ingénieurs d’exécuter l’application avec chaque langue et consigne les traductions exactes incluses dans la version.

Pour la production, épinglez les actions tierces sur des SHA de commit complets conformément à votre politique de dépendances. Les balises majeures évolutives permettent de garder ce tutoriel lisible, mais les références immuables réduisent les risques liés à la chaîne d’approvisionnement.

## Étape 7 : tester la pull request traduite

Le contrôle automatisé sera exécuté à nouveau, car la demande de modification de traduction modifie `locales/**` et `release-notes/**`. Ajoutez également les propres tests de votre application aux vérifications requises.

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

GitHub Releases ne permet qu’un seul corps de publication, alors assemblez chaque langue dans un seul document Markdown. Ajoutez `.github/workflows/release.yml` :

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

Confirmez que l’action s’exécute sur un événement `pull_request` et définit `github-diff: true`. L’action a besoin de `pull-requests: read` pour pouvoir récupérer le correctif. La vérification limitée au diff s’applique aux fichiers de traduction structurés pris en charge ; gardez les vérifications sur l’ensemble du projet dans une tâche planifiée distincte si vous souhaitez également avoir une visibilité sur le retard accumulé.

### La source push ne peut pas s’authentifier

Vérifiez que `HYPERLOCALISE_API_KEY` et `HYPERLOCALISE_PROJECT_ID` existent dans l’environnement GitHub sélectionné. Les secrets d’environnement ne sont disponibles que si le job déclare cet environnement, et les environnements protégés peuvent rester en attente d’une approbation.

### Le téléchargement des traductions ne produit aucune différence Git

Confirmez d’abord que le travail de traduction est terminé dans le même projet nommé par `HYPERLOCALISE_PROJECT_ID`. Vérifiez ensuite les chemins cibles dans `i18n.yml`. Exécutez localement `hl sync pull --dry-run` pour inspecter le téléchargement prévu sans écraser les fichiers.

### La version ne trouve pas ses notes

Le tag et le nom de fichier Markdown doivent correspondre exactement. Le tag `v1.8.0` attend `release-notes/<locale>/v1.8.0.md`. Conservez le `v` aux deux endroits, ou modifiez la construction du chemin du workflow dans le cadre d’une mise à jour délibérée de la convention.

### Les traductions arrivent après la sortie du produit

Ne faites pas de la synchronisation des traductions une tâche post-publication non suivie. Exigez la pull request de traduction avant de créer le tag, ou modélisez la localisation comme une vérification explicite de la release candidate dans votre workflow de déploiement.

## Liste de contrôle de publication

Avant de baliser une version multilingue, vérifiez que :

- [ ] chaînes sources et notes de version en anglais fusionnées ;
- [ ] la vérification de localisation de la pull request a réussi ;
- [ ] `hl sync push` terminé après la fusion;
- [ ] les langues cibles ont été révisées et approuvées dans Hyperlocalise ;
- [ ] `hl sync pull` a ouvert une pull request de traduction ;
- [ ] vérifications automatisées, linguistiques et visuelles réussies ;
- [ ] la pull request de traduction a été fusionnée ; et
- [ ] chaque paramètre régional des notes de version possède un fichier non vide correspondant à la balise.

## Gardez la localisation dans le processus de publication

L’élément important de la localisation de GitHub n’est pas le YAML. C’est la succession de transmissions dont la responsabilité est clairement définie.

La `hyperlocalise` CLI relie les fichiers du dépôt à la plateforme. L’action GitHub fournit aux ingénieurs un retour rapide sur les chaînes modifiées. Hyperlocalise fournit aux réviseurs linguistiques le contexte et le workflow d’approbation que Git seul ne peut pas offrir. Le tag final publie exactement ce que l’équipe a révisé.

Cela transforme la localisation d’une tâche effectuée après le développement en une partie intégrante de la mise en production.

[Découvrez Hyperlocalise pour la localisation de produits](/use-cases/product-localisation) afin de connecter vos référentiels, de vérifier vos workflows et de gérer vos versions multilingues.
