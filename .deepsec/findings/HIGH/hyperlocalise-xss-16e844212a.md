# [HIGH] Liquid translations can inject raw HTML or script tags

**File:** [`internal/i18n/translationfileparser/liquid_parser.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translationfileparser/liquid_parser.go#L422-L434) (lines 422, 428, 429, 434)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Liquid text parts are rendered by expanding placeholders and returning the translated string without HTML escaping. Attribute translations are escaped, but normal text translations are not. The post-translation validation for Liquid only checks internal Liquid/HTML sentinel preservation and ICU invariants, so a malicious or compromised translation provider can return additional raw markup such as a script tag or event-handler-bearing element; the parser will write it into the generated Liquid template, where it can execute when the template is served.

## Recommendation

Reject newly introduced raw HTML/Liquid tag syntax in translated text, or escape translated text and only restore source-derived placeholders. Apply an HTML tag parity check for Liquid text segments in addition to internal placeholder validation.

## Revalidation

**Verdict:** true-positive

I read the full Liquid parser and traced that Liquid files are masked, parsed through the HTML document parser, and marshaled through MarshalLiquid or MarshalLiquidWithTargetFallback in the CLI output path. Attribute translations go through html.EscapeString, but normal Liquid text parts are still returned raw from renderTextPart after placeholder expansion. The current code at liquid_parser.go:437 rejects missing placeholders and complete HTML tags in the translated segment, which fixes the straightforward complete <script> payload covered by e5ea788. That mitigation is segment-local and only uses containsHTMLTag before source literals are appended. A compromised provider can return an incomplete HTML opener, for example <img src=x onerror=alert(1)//, for a text segment before a source closing tag such as </p>. This contains no complete <...> tag, has no Liquid placeholder mismatch, and passes the Liquid post-translation validation, which only checks internal Liquid/HTML sentinel preservation plus ICU invariants. When the renderer appends the source closing tag literal, the generated Liquid template contains executable raw HTML. The finding remains real, although the complete-script example is now partially mitigated.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
