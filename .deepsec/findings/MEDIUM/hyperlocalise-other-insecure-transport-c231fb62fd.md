# [MEDIUM] Phrase TMS glossary fetch can use non-HTTPS base URLs

**File:** [`apps/hyperlocalise-web/src/lib/providers/phrase/phrase-glossary-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/phrase/phrase-glossary-fetcher.ts#L17-L24) (lines 17, 18, 19, 24)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-insecure-transport`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The glossary fetcher passes secretMaterial and credential.baseUrl to PhraseTmsApiClient before fetching project term bases. The TMS resolver allows memsource.com hostnames without checking the protocol, so a stored http:// Memsource URL would transmit the ApiToken header over plaintext.

## Recommendation

Require HTTPS for Phrase TMS base URLs and reject non-HTTPS values when credentials are saved.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
