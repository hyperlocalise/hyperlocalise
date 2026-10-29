# Loops localisation models

## Status

Accepted. Implemented on the Loops email localisation branch. Product
docs live on one page, `docs/platform/connections/loops.mdx`.

## Date

2026-10-29

## Context

Loops exposes three email surfaces that operators localize:

| Surface | Read | Write-back |
| --- | --- | --- |
| Transactional emails | Draft email message as LMX | New unpublished email via `POST /v1/transactional-emails` |
| Campaigns | Draft campaign email message as LMX | New draft campaign via `POST /v1/campaigns` |
| Workflows | `SendEmailAction` node email messages | No duplicate-workflow endpoint |

Bodies are LMX (XML), not HTML. Updates require the current
`contentRevisionId` as `expectedRevisionId`, and the server answers
409 for stale revisions or legacy MJML content. The `languageCode`
field is documented as ISO 639-1 (`en`, `fr`) in the
[update email message reference](https://loops.so/docs/api-reference/update-email-message).

Hyperlocalise stores one Loops API key through Pipes. The client is
built on the official `loops` JavaScript SDK and exposes SDK response
types directly instead of local duplicates.

## Decision

Implement one workspace skill, **Translate Loops Emails**
(`translate-loops-emails`), covering all three surfaces.

1. Import transactional, campaign, and workflow emails as HTML source
   files at `loops/transactional/`, `loops/campaigns/`, and
   `loops/workflows/`. Extract LMX text segments, protect
   `{data.*}`, `{contact.*}`, and `{event.*}` variables, skip legacy
   MJML and existing locale copies.
2. Push approved locales as separate unpublished locale copies named
   `{source} [{locale}]` (for example `Welcome [fr-FR]`). Never
   update the source email. Never publish.
3. Workflow locale copies are created as unpublished transactional
   copies, since Loops has no duplicate-workflow endpoint.
4. Set `languageCode` from the primary subtag of the project locale
   (`fr-FR` writes `fr`), because Loops only accepts ISO 639-1. The
   copy name keeps the full tag, so regional variants stay
   distinguishable in the Loops dashboard. When Loops rejects a label,
   push retries without it and the copy still lands.

## Alternatives considered

1. **Locale-region `languageCode` (`fr-FR`)** — rejected. The API
   reference defines the field as ISO 639-1 with `en`/`fr` examples,
   so a regional tag risks a 400. The retry-without-label fallback
   would then fire on every push instead of only when translation is
   disabled for the language.
2. **One skill per surface** — rejected. All three surfaces share the
   same HTML envelope, the same copy-naming convention, and the same
   never-publish guarantee. Splitting them would triple the skill
   surface for no operator benefit.
3. **Locale variants on the source email** — rejected. Loops
   multi-language support is account-gated per language and has no
   per-message variant write path like Braze. Separate copies keep
   the source untouched and reviewable.

## Consequences

- One **Integrations → Loops** row with an API-key-only connection.
  Save pings `GET /v1/api-key` before the key is stored.
- One automation template, `translate-loops-emails`, mutually
  exclusive with Braze and Customer.io tools on the same automation.
- `toLoopsLanguageCode` maps via the primary subtag. Regional copy
  names (`[fr-FR]` vs `[fr-CA]`) can share one `languageCode`
  (`fr`); operators tell them apart by name in Loops.
