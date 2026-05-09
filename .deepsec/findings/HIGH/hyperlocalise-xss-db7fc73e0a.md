# [HIGH] Markdown translations can introduce raw inline HTML

**File:** [`internal/i18n/translationfileparser/markdown_parser.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translationfileparser/markdown_parser.go#L672-L679) (lines 672, 678, 679)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Markdown source inline syntax is protected with placeholders, but rendered translated segments with no placeholders are returned verbatim. The translation validator checks block-structure heuristics and internal placeholder preservation, not newly introduced inline HTML. An attacker controlling translation output can inject raw HTML into a paragraph without changing the Markdown structural path set; if the generated Markdown is rendered by a site or MDX pipeline that permits raw HTML, this becomes stored XSS.

## Recommendation

Reject or escape raw HTML/JSX syntax that was not present as a source placeholder. Add validation that compares inline HTML/JSX token presence before accepting Markdown translations, and keep AST parity as a secondary structural check rather than the only safeguard.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-10)
