# Crowdin Hidden String CAT UI

## Context

Crowdin source strings expose `isHidden`. Hidden strings stay available to managers and proofreaders but are withheld from translators. Our CAT live Crowdin path already returns those strings, but we drop `isHidden` at the API client and never surface it in the editor or queue.

## Decision

Treat hidden as a first-class optional CAT segment flag and show a clear indicator when it is true.

1. Parse `isHidden` on `CrowdinSourceString`.
2. Pass `isHidden` through `projectFileCatSegmentSchema` and into `CatQueueSegment` / `CatSegment`.
3. Map it from Crowdin live CAT (single-file and all-files).
4. Show a compact "Hidden" badge in the editor header, queue row, and side-by-side status row.
5. Do not label hidden pending strings as **Untranslated**. Suppress the pending status badge when `isHidden` is true so the Hidden badge is the status signal.
6. Exclude hidden strings from the Crowdin and client **Untranslated** queue filters (`not is hidden` in CroQL). They remain visible under **All**.

Do not block editing. Managers using CAT with Crowdin credentials should still translate hidden strings; the badge is informational, matching Crowdin's manager editor.

## Alternatives considered

- Filter hidden strings out of the queue: wrong for manager workflows that need to see them.
- Crowdin-only UI branch: rejected; a shared `isHidden` field keeps the CAT UI provider-agnostic if other TMS adapters later map the same concept.
- Keep Untranslated + Hidden badges together: rejected; dual labels made hidden strings look like open translator work.

## Testing

- Unit coverage for Crowdin → CAT segment mapping of `isHidden: true`.
- Mapper coverage that queue/workspace state carries the flag.
- Light UI assertion that the badge renders when `segment.isHidden` is set.
- Assert pending + hidden does not render the Untranslated status badge.
- Assert untranslated CroQL and client queue filters exclude hidden strings.
