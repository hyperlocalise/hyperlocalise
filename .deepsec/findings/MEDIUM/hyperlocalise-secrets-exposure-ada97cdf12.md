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

## Revalidation

**Verdict:** true-positive

The current code has added validatePhraseBaseURL, so plain http to non-loopback hosts, userinfo, query strings, and fragments are rejected. That does not fully address the finding title because any HTTPS host is still accepted. The manual commands read PHRASE_API_TOKEN or the selected token env var, then call phrase.NewHTTPClientWithBaseURL with --api-base-url and send Authorization: token <token> through the Phrase client or c.doRequest. The config-backed commands also load phrase.host from .phrase.yml and use it unless the flag overrides it, while resolvePhraseAccessToken falls back to PHRASE_ACCESS_TOKEN or PHRASE_API_TOKEN. A malicious repository can therefore provide .phrase.yml with host: https://attacker.example and otherwise valid push/pull settings; when an operator or CI job runs the Phrase command with a real token in the environment, the first API request sends that token to the attacker-controlled HTTPS endpoint. This is not cleartext exposure anymore, but it remains arbitrary-host credential disclosure. No allowlist, explicit unsafe-host opt-in, or trusted enterprise-domain policy is enforced.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-17)
