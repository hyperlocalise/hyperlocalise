# [BUG] Phrase translation-memory downloads can hang indefinitely

**File:** [`apps/cli/cmd/phrase.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/phrase.go#L75-L322) (lines 75, 76, 322)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-timeout`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

newPhraseTranslationMemoryWriter creates the TMS HTTP client with &http.Client{} and no Timeout, and execution uses backgroundContext() for the write. The TMS helper has a poll attempt limit, but an individual HTTP call can block forever if the server or network stalls, unlike the other Phrase commands that use a 30-second client timeout.

## Recommendation

Use a finite HTTP timeout for the TMS client and/or wrap the operation in a context with a deadline; keep it consistent with the 30-second Phrase clients.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
