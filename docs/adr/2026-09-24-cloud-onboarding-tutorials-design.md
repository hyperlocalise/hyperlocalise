# Cloud onboarding tutorials

## Goal

Add practical tutorials that take a repository from source strings to reviewed translations in Hyperlocalise Cloud and back to git.

## Information architecture

Add a **Tutorials** group to the English Cloud navigation after **Getting started**. Keep the pages under `docs/platform/tutorials/`.

The group contains:

1. GitHub localisation workflow
2. React Intl and ICU
3. Vue and vue-i18n
4. iOS Strings
5. Android string resources
6. Gettext POT and PO
7. XLIFF

The Cloud home page and getting-started page link to the tutorials. Localized documentation stays unchanged.

## Tutorial structure

Each tutorial starts with an outcome and prerequisites, then follows the same repository-native loop:

1. Map source and target files in `i18n.yml`.
2. Change or extract source content.
3. Check the change in a pull request.
4. Run `hl sync push` after merge.
5. Generate, review, and approve translations in Cloud.
6. Run `hl sync pull` and open a translation pull request.
7. Test the translated application or service.

Examples use `en-US` as the source and `fr-FR` and `de-DE` as targets. They link to the existing CLI and Cloud reference pages instead of repeating full command reference material.

## Format boundaries

- React uses React Intl descriptors, FormatJS JSON, ICU validation, `hl extract`, and `hl pack`.
- Vue uses vue-i18n nested JSON catalogs. Extraction stays in Vue tooling (`hl extract` does not scan `.vue` files).
- iOS uses `.strings` files in locale-specific `.lproj` directories. `.stringsdict` is mentioned as a separate plural format.
- Android uses `strings.xml` under `res/values*`. The tutorial covers `<string>` and `<plurals>`, skips `translatable="false"`, and calls out unsupported `<string-array>` resources.
- Gettext uses `xgettext` to create a `.pot` template and `msginit`/`msgmerge` to maintain `.po` catalogs. Hyperlocalise processes `.po`; it does not ingest `.pot` directly.
- XLIFF covers 1.2 and 2.x files, stable unit IDs, inline placeholders, and one target file per locale.

## Validation

Run a JSON parse check for `docs.json`, then run `mint broken-links` from `docs/`. Review the final diff for navigation coverage and unsupported claims.
