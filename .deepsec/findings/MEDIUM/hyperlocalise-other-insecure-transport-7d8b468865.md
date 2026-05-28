# [MEDIUM] Phrase TMS token can be sent over non-HTTPS Memsource URLs

**File:** [`apps/hyperlocalise-web/src/lib/providers/phrase/phrase-content-puller.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/phrase/phrase-content-puller.ts#L66-L72) (lines 66, 67, 68, 72)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-insecure-transport`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The content puller passes the decrypted provider token and stored credential.baseUrl into PhraseTmsApiClient. The TMS base URL resolver allowlists memsource.com hostnames but does not require the https: protocol, so a stored baseUrl such as http://cloud.memsource.com/web would send the ApiToken authorization header over plaintext during job-part loading.

## Recommendation

Require https: in the Phrase TMS base URL resolver and reject non-HTTPS credential base URLs before storing or using them.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
