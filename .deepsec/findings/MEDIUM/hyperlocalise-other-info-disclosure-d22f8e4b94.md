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

## Revalidation

**Verdict:** true-positive

The workflow calls `logDiagnosticsStep()` for every translated target locale after reading the translated output and before storing the output file. That step passes `sourceFile.filename`, `targetLocale`, the translated `Buffer`, and the generated `outputFilename` into `logTranslatedFileDiagnostics()`. The diagnostics helper computes and logs the output filename, byte length, full SHA-256, content type, UTF-8/JSON parse status, JSON parse errors, and `firstBytesHex` from the first 16 bytes of translated content. There is no production/debug guard, redaction, sampling gate, or environment check around this `console.info`. The original source filename is customer-controlled metadata, and the output filename is derived from it; the first bytes are exact customer content, merely hex-encoded. A normal user who submits a translation file whose filename or first bytes contain sensitive values will cause those values to be retained in application logs. The web app’s local logging guidance explicitly says not to log file contents, user-supplied text, filenames, or customer-identifying values, so this violates the intended boundary. This is exploitable through ordinary file translation job creation, without needing to trigger an error path.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
