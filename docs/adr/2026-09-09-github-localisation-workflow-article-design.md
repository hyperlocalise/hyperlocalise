# GitHub localisation workflow article design

## Goal

Publish an English technical tutorial that targets the search terms `github
localization` and `localize release notes`. The article should show engineers
how to move changed product strings and release notes from a pull request to a
reviewed multilingual GitHub release.

## Approach

Use one small example repository throughout the article. The example has an
English JSON catalogue, French and German targets, and Markdown release notes.
This narrative makes each command and workflow step part of a complete release
rather than presenting disconnected CLI recipes.

The tutorial will cover:

1. Repository and `i18n.yml` setup.
2. A pull request that changes a UI string and English release notes.
3. Pull-request checks with the Hyperlocalise GitHub Action.
4. Source upload with `hl sync push` after merge.
5. Translation review and approval in the Hyperlocalise platform.
6. Approved translation download with `hl sync pull`.
7. A translation pull request and multilingual GitHub release.

## Product positioning

Present the CLI as the repository-native automation layer and the platform as
the place for context, translation, review, and approval. Keep the article
instructional. Explain why each boundary exists instead of interrupting the
tutorial with broad product claims.

Link the tutorial to the product localisation use case at
`/use-cases/product-localisation`.

## Content and SEO

- Slug: `github-localisation-workflow-from-pull-request-to-multilingual-release`
- Title: `GitHub Localisation Workflow: From Pull Request to Multilingual Release`
- Primary phrase: `github localization`
- Supporting phrases: `GitHub localisation workflow`, `localize release notes`,
  `multilingual release`, and `localization GitHub Actions`
- Format: practical tutorial with copy-ready JSON, YAML, Markdown, shell, and
  GitHub Actions examples

The opening will answer the search intent directly. Later sections will include
troubleshooting guidance, a release checklist, and a concise next step.

## Validation

Run the web workspace formatter, linter, type checks, and tests with
`vp check --fix` and `vp test`. Verify article commands and action inputs against
the repository's CLI configuration template, root action, install action, and
production localisation workflow.
