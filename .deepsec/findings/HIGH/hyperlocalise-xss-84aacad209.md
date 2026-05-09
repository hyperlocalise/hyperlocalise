# [HIGH] Translated HTML text is emitted as raw markup

**File:** [`internal/i18n/translationfileparser/html_parser.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translationfileparser/html_parser.go#L408-L429) (lines 408, 423, 429)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `110407360+chnttx@users.noreply.github.com` _(via last-committer)_

## Finding

HTML text translations are written directly into the reconstructed document after placeholder expansion. Source inline tags are protected as placeholders and missing placeholders fall back safely, but the final translated text is appended raw at render time. The related post-translation guard only compares known HTML tag names, so attacker-controlled translation output can introduce tag-shaped markup that the guard ignores, such as custom elements with event-handler attributes, and that markup will be persisted into the generated HTML.

## Recommendation

Escape translated text by default and restore only source-derived placeholders as markup, or reject any raw tag syntax in translated values after removing expected placeholders. Ensure the validation treats unknown/custom tags as markup rather than ignoring them.

## Recent committers (`git log`)

- chnttx <110407360+chnttx@users.noreply.github.com> (2026-03-22)
