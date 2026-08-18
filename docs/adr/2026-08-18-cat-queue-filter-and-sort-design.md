# CAT Queue Filters and Sort

## Context

Crowdin’s editor Filter menu includes views our CAT queue does not: Unsaved translations, QA issues, Machine translations, and With comments. It also treats **All, Untranslated First** as a filter, which hides the fact that it is a sort and prevents combining it with Untranslated, Approved, or Has issues.

Our CAT queue is a single-select filter (`queueFilter`) with file order only. Crowdin already maps Untranslated, Needs review, Approved, Has issues, and Hidden through CroQL. Native CAT uses SQL `WHERE` on the same filter names.

## Decision

Keep Filter as what to show. Add Sort as how to order.

### Filters

Crowdin CAT adds three server filters, expressed in CroQL for the target language:

- **QA issues** — `has qa issues`
- **Machine translations** — `is pre translated` (TM / MT / AI applied without edits)
- **With comments** — `count of comments > 0`

**Unsaved translations** is client-only, like Skipped: strings with dirty drafts in this CAT session. It does not call Crowdin. It is available on every CAT provider.

Existing labels stay (**Needs review**, **Has issues**). New Crowdin labels follow Crowdin (**QA issues**, **Machine translations**, **With comments**, **Unsaved translations**).

Phrase, Lokalise, and Smartling keep today’s shorter filter list. Invalid filter values for a provider fall back to All strings.

### Sort

Add a compact Sort control next to Filter:

- **File order** (default) — Crowdin file order; native key, then id
- **Untranslated first** — pending / untranslated, then needs review / not approved, then approved, then skipped last (native only). File order within each band.

Untranslated first is available for Crowdin and native only. It composes with the active filter (for example Has issues + Untranslated first). Phrase, Lokalise, and Smartling stay on File order.

URL: `queueSort=untranslated_first` when set; omit for the default. Changing filter or sort resets the queue to offset 0.

Do not add Crowdin Advanced sorts (alphabet, dates, length, votes) in this change.

### Implementation

- Extend `projectFileCatQueueFilterSchema` with `qa_issues`, `machine_translated`, `with_comments`. Keep `unsaved` and `skipped` as client-only union members, not server query values.
- Add `projectFileCatQueueSortSchema`: `file_order` | `untranslated_first`.
- Native: same filter `WHERE`, plus `ORDER BY` status band when sort is untranslated first.
- Crowdin: CroQL cannot `ORDER BY` translation status. Paginate three buckets in order: (filter ∧ untranslated), (filter ∧ not approved), (filter ∧ approved). Offset walks across buckets. Empty buckets are skipped.
- Unsaved: do not send a server filter. Show dirty drafts retained in the workspace store.

## Alternatives considered

- Put Untranslated first inside Filter, as Crowdin does: rejected; it cannot compose with other filters.
- Crowdin-only filter menu with Crowdin wording for every option: rejected; a shared queue filter with provider gating is enough.
- Crowdin Advanced Filter (QA subtypes, engine, comment types, extra sorts): out of scope.

## Testing

- CroQL coverage for QA issues, machine translations, and with comments, including search composition.
- Native `ORDER BY` status bands for untranslated first, including skipped last.
- Crowdin bucket pagination across offsets and empty buckets.
- Toolbar gating: Crowdin extra filters; sort hidden or file-order-only for Phrase / Lokalise / Smartling.
- URL round-trip for `queueFilter` and `queueSort`.
- Unsaved shows dirty drafts only and does not issue a Crowdin CroQL filter.
