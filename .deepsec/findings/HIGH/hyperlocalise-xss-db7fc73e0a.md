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

## Revalidation

**Verdict:** true-positive

I read the full Markdown parser, the internal placeholder validators, the block-structure heuristic, AST parity check, and the CLI marshal path. The current renderer added a guard in 607902b at markdown_parser.go:679 that rejects complete raw HTML tags in untrusted translated values before Markdown placeholders are expanded. That blocks the simple payloads covered by TestMarshalMarkdownRejectsIntroducedRawHTML, but the output is still raw Markdown text and the check is performed before source-derived placeholders are restored. A translation can preserve all required HLMDPH placeholders while inserting an incomplete tag opener before a source inline HTML placeholder that later expands to a >. For example, a source line with inline HTML such as Press <kbd>Ctrl</kbd> to continue can be translated to preserve the <kbd> placeholder, add <img src=x onerror=alert(1)// before the </kbd> placeholder, and still contain no complete <...> sequence before expansion. ValidateMarkdownInternalPlaceholders accepts it because the placeholder multiset is intact, and AST path parity is unlikely to distinguish this because inline HTML remains protected within the same text segment. After placeholder expansion, the generated Markdown/MDX contains attacker-controlled raw HTML that can execute in renderers that permit inline HTML. The vulnerability is therefore still exploitable for Markdown/MDX sources containing source-derived inline HTML or JSX placeholders.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-05-19)
