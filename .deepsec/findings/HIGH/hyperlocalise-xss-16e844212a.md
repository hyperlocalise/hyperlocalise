# [HIGH] Liquid translations can inject raw HTML or script tags

**File:** [`internal/i18n/translationfileparser/liquid_parser.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translationfileparser/liquid_parser.go#L422-L434) (lines 422, 428, 429, 434)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

Liquid text parts are rendered by expanding placeholders and returning the translated string without HTML escaping. Attribute translations are escaped, but normal text translations are not. The post-translation validation for Liquid only checks internal Liquid/HTML sentinel preservation and ICU invariants, so a malicious or compromised translation provider can return additional raw markup such as a script tag or event-handler-bearing element; the parser will write it into the generated Liquid template, where it can execute when the template is served.

## Recommendation

Reject newly introduced raw HTML/Liquid tag syntax in translated text, or escape translated text and only restore source-derived placeholders. Apply an HTML tag parity check for Liquid text segments in addition to internal placeholder validation.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-05)
