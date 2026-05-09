# [MEDIUM] Phrase API token can be sent to arbitrary API base URLs

**File:** [`apps/cli/cmd/phrase.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/phrase.go#L147-L596) (lines 147, 180, 203, 226, 249, 373, 458, 524, 596)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The Phrase subcommands expose --api-base-url, read PHRASE_API_TOKEN or a chosen token env var, then construct a client with that base URL. The traced helpers NewHTTPClientWithBaseURL and NewTMSHTTPClientWithBaseURL only trim the string and do not require HTTPS or an allowed host; requests then include the Authorization header. If an attacker can influence CLI, wrapper, or CI arguments, or if an operator uses an http URL, the Phrase token is disclosed to that endpoint or over cleartext.

## Recommendation

Parse and validate --api-base-url before using the token. Require https, reject userinfo/query/fragments, and preferably allowlist Phrase domains or gate custom/insecure hosts behind an explicit development-only opt-in.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
