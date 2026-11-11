# next-intl tutorial and unreachable plural QA

Date: 2026-10-22

## Decision

Document next-intl as a first-class framework guide. Add a Cloud QA check that flags ICU plural cases the target locale never selects, and stop requiring target catalogs to copy unused source categories.

## next-intl

next-intl stores nested JSON with ICU and optional rich-text tags. That already matches generic JSON plus ICU. Support is a Platform tutorial, not a new parser or extractor.

`docs/platform/tutorials/next-intl.mdx` follows the i18next and vue-i18n shape:

- `messages/{{locale}}.json` mapped in `i18n.yml`
- JSON is the source of truth; `hl extract` does not scan `t()`
- `getRequestConfig` / `useTranslations` load approved files
- Type-safe messages or an equivalent CI gate catch missing keys
- Message format stays `auto` or `icu`, not i18next

Navigation and [Supported formats](/platform/file-formats) link to the page.

## Unreachable plural case

`unreachable_plural_case` is an error, on by default.

It flags `plural` and `selectordinal` CLDR categories (`zero`, `one`, `two`, `few`, `many`) that the message locale never selects. Exact matches (`=0`, `=1`) stay allowed. `other` stays required.

Japanese `{count, plural, one {…} other {…}}` fails. Japanese `{count, plural, other {…}}` passes.

ICU parity still requires argument names, block types, offsets, and exact `=N` labels. CLDR category sets may differ by locale.

Surfaces: Cloud QA / `hl validate`, CAT format checks, and `hl check`. Policy files that omit the new check get enabled/error. Categories come from `golang.org/x/text` CLDR data.
