# CLI locale copies

Regional locales often share a catalog. `en-AU` can ship as a copy of
`en-GB` without a second translation pass.

Add optional `locales.copies` to the i18n config. Keys are target locales.
Values are the origin locale, which must be `locales.source` or another
target that is not itself a copy. `run` still writes per-locale output
files. It skips LLM and MT for copy locales and copies origin values
instead.

A dedicated map is clearer than overloading `locales.fallbacks`. Fallbacks
describe missing-key chains and are unused by `run` today. Copies are a
whole-catalog identity.

Copy locales cannot share a target path with their origin, combine with
`fallbacks` on the same locale, or copy another copy locale. `--locale`
for a copy locale reads existing origin files. Missing origin files fail
with an instruction to translate the origin first.

Verify config validation, planning marks copy tasks, `run` translates the
origin once, copy-only runs reuse origin files, and copying from source
writes source text with no provider calls.
