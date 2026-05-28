# [HIGH] Translated HTML text is emitted as raw markup

**File:** [`internal/i18n/translationfileparser/html_parser.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translationfileparser/html_parser.go#L408-L429) (lines 408, 423, 429)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

HTML text translations are written directly into the reconstructed document after placeholder expansion. Source inline tags are protected as placeholders and missing placeholders fall back safely, but the final translated text is appended raw at render time. The related post-translation guard only compares known HTML tag names, so attacker-controlled translation output can introduce tag-shaped markup that the guard ignores, such as custom elements with event-handler attributes, and that markup will be persisted into the generated HTML.

## Recommendation

Escape translated text by default and restore only source-derived placeholders as markup, or reject any raw tag syntax in translated values after removing expected placeholders. Ensure the validation treats unknown/custom tags as markup rather than ignoring them.

## Revalidation

**Verdict:** true-positive

The current renderer has been hardened since the finding was written, but the underlying issue is still exploitable. I read the full parser and traced the CLI marshal path through apps/cli/internal/i18n/runsvc/output_marshal.go and translation_output_validate.go. Normal HTML text parts are still emitted raw after preserveChunkBoundaryWhitespace, while only void-element attributes are escaped with html.EscapeString. The added containsHTMLTag check at html_parser.go:438 catches complete translated tags such as <img ...>, and the e5ea788 tests cover that case. However, containsHTMLTag only matches a complete <...> sequence inside the translated segment before the following template literal is appended. A malicious translation for a source like <p>Hello</p> can use an incomplete opener such as <img src=x onerror=alert(1)//, which has no > and therefore passes both htmltagparity validation and the render-time containsHTMLTag check. The source literal </p> then supplies the closing > in the final document, producing raw attacker-controlled markup with an event handler. Placeholder preservation does not mitigate this case because no placeholder is needed, and the raw text path is not escaped.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
- chnttx <110407360+chnttx@users.noreply.github.com> (2026-03-22)
