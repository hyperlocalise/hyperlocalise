---
title: "GitHub Localisation Workflow: From Pull Request to Multilingual Release"
date: 2026-09-09T00:00:00.000Z
excerpt: Build a practical GitHub localisation workflow that checks changed strings, sends source content to Hyperlocalise, brings reviewed translations back, and publishes multilingual release notes.
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

A GitHub localization workflow should do more than copy locale files around. It should catch changed strings in a pull request, give reviewers a clear translation handoff, keep release notes in sync, and prevent a release from shipping with stale content.

This tutorial builds that workflow with GitHub Actions, the `hyperlocalise` CLI, and the Hyperlocalise platform. By the end, a product change will move through four visible stages:

1. An engineer changes an English UI string and its release notes.
2. GitHub checks the pull request for localisation problems.
3. The CLI pushes source content to Hyperlocalise, where the team reviews translations.
4. GitHub pulls the reviewed files and publishes one release with English, French, and German notes.

The result is a repository-native process. Engineers stay in pull requests, language reviewers work with context in Hyperlocalise, and the release only uses translations that have returned to Git.

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## What we will build

Assume a web application has this structure:

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

English is the source locale. French and German are target locales. JSON files hold product copy, while Markdown files hold release notes. Hyperlocalise treats both as translatable content, so the same review cycle covers the interface and the announcement.

You will need:

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- permission to add workflows and repository secrets.

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## Step 1: map source and target files

Create `i18n.yml` at the repository root:

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

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

The LLM profile is used when your project generates translations with that provider. Store provider credentials in Hyperlocalise rather than adding them to the workflow. The GitHub runner only needs credentials for the Hyperlocalise project.

## Step 2: make one product change

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

Commit source content together with the feature. This gives reviewers the code change, UI copy, and customer-facing explanation in one pull request. It also means Git history can answer which wording shipped with a release.

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## Step 3: check changed strings in the pull request

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

The action also uploads its JSON report and text summary. Keep those artifacts when a check fails: they separate structural errors, missing translations, and content findings from an installation or configuration failure.

This check is the first review gate, not the language review. It catches repository problems early, while a reviewer still decides whether each translation is accurate, consistent, and appropriate for the product.

## Step 4: push merged source content to Hyperlocalise

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

You can run the same operation before committing:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## Step 5: review product strings and release notes together

Once the source sync completes, review the new content in Hyperlocalise. The UI strings and release notes remain in separate buckets, but they share project terminology, instructions, and target locales.

For this example, a reviewer should check more than literal accuracy:

| Content | Review question |
| --- | --- |
| `filters.save` | Is this clearly an action, rather than a saved state? |
| `filters.saved` | Does the term match navigation and settings copy? |
| Description | Does it fit the UI and preserve “workspace” terminology? |
| Release title | Does it use the same name as the product feature? |
| Release bullets | Are commands, menu names, and user outcomes consistent? |

Attach product context or screenshots when a short string is ambiguous. A translator who only sees “Save filter” cannot know whether it labels a button, a toast, or a page heading. That context is where the platform complements the CLI: Git moves files, while Hyperlocalise carries the knowledge needed to make a sound language decision.

Resolve review comments and approve the translations according to your project workflow before pulling them back. Treat approval as a release gate, not an administrative step.

## Step 6: pull reviewed translations into GitHub

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

For production, pin third-party actions to full commit SHAs according to your dependency policy. Moving major tags keep this tutorial readable, but immutable references reduce supply-chain risk.

## Step 7: test the translated pull request

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

At minimum, verify:

- every target catalogue contains the new keys;
- placeholders and ICU arguments match the source;
- translated buttons fit at supported viewport sizes;
- Markdown headings, lists, links, and code spans still render correctly;
- the product and release notes use the same feature name; and
- source strings did not leak into target files.

The reviewer should also open the rendered product. File-level review catches terminology errors, but it cannot reveal a clipped button or a line break that hides important text.

Merge the translation pull request only when those checks pass. Git now contains the release's approved language state.

## Step 8: publish multilingual release notes

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

Create the tag only after the feature and translation pull requests have merged:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

The release job fails if any locale's notes are missing or empty. That is deliberate. Silent fallback would label an incomplete release as multilingual; a failed job tells the team exactly which file must return through review.

The same tag can drive your build and deployment jobs. Make the release job depend on those jobs if binaries must exist before the announcement goes live.

## How the complete flow behaves

The finished GitHub localisation workflow has a clear direction:

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

Each transition has one responsibility. Pull requests review repository changes. Hyperlocalise reviews language decisions. Tags publish an immutable, already-reviewed state.

## Common failure modes

### The PR check reports unrelated translations

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### Source push cannot authenticate

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### Pulling translations produces no Git diff

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### The release cannot find its notes

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Translations arrive after the product release

Do not make translation sync an untracked post-release task. Require the translation pull request before creating the tag, or model localisation as an explicit release-candidate check in your deployment workflow.

## Release checklist

Before tagging a multilingual version, confirm that:

- [ ] source strings and English release notes merged together;
- [ ] the pull request localisation check passed;
- [ ] `hl sync push` completed after merge;
- [ ] target languages were reviewed and approved in Hyperlocalise;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] automated, linguistic, and visual checks passed;
- [ ] the translation pull request merged; and
- [ ] every release-note locale has a non-empty file matching the tag.

## Keep localisation inside the release process

The important part of GitHub localization is not the YAML. It is the sequence of accountable handoffs.

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

That turns localisation from a task after development into part of the release itself.

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
