# [BUG] Editing a glossary term can erase its part of speech

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/glossaries/[glossaryId]/page.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/glossaries/[glossaryId]/page.tsx#L17) (lines 17)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-data-loss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This page delegates term editing to GlossaryDetailPageContent. That component initializes the edit form from the term list response with partOfSpeech defaulting to an empty string, and saveTerm always sends partOfSpeech back in the PATCH payload. The terms list API is backed by listGlossaryTermsByGlossaryId, whose select omits schema.glossaryTerms.partOfSpeech. As a result, an existing term's partOfSpeech is not returned to the editor; saving any edit to that term can overwrite the stored partOfSpeech with an empty string. Auth and org scoping are enforced, so this is a non-security data-loss bug for authorized glossary editors.

## Recommendation

Include partOfSpeech in the glossary terms list query/response, or make the edit PATCH omit fields that were not actually loaded or changed.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
