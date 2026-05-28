# [MEDIUM] Translated file diagnostics log customer file metadata and content bytes

**File:** [`apps/hyperlocalise-web/src/workflows/file-translation-job.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/workflows/file-translation-job.ts#L139-L442) (lines 139, 442)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The workflow logs diagnostics for every translated file via logTranslatedFileDiagnostics. That helper logs sourceFilename, targetLocale, output filename, hashes, parse errors, and the first 16 bytes of translated content. Translation files can contain customer strings, secrets, or identifiers, so production logs can retain sensitive customer data beyond the intended storage boundary.

## Recommendation

Do not log file content bytes or customer-controlled filenames in production. Prefer opaque job/file IDs, byte counts, and coarse status fields; gate deeper diagnostics behind a non-production debug flag with explicit redaction.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
