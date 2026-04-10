package translationfileparser

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	markdownHeadingLineRe       = regexp.MustCompile(`(?m)^#{1,6}\s`)
	markdownFenceBacktickLineRe = regexp.MustCompile("(?m)^```")
	markdownThematicBreakLineRe = regexp.MustCompile(`(?m)^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$`)
	markdownBlockquoteLineRe    = regexp.MustCompile(`(?m)^>`)
	markdownOrderedListLineRe   = regexp.MustCompile(`(?m)^\d+[.)][ \t]`)
	markdownBulletListLineRe    = regexp.MustCompile(`(?m)^[-*+][ \t]`)
)

// ValidateMarkdownTranslatedBlockStructure rejects translations that introduce common
// block-level markdown line patterns absent from the source segment. This is a cheap
// pre-check; full-document safety still requires [ValidateMarkdownMarshaledASTParity].
//
// Rules apply only when the source segment contains no newlines, so multi-line source
// segments (headings, lists, etc. in context) are not rejected aggressively.
func ValidateMarkdownTranslatedBlockStructure(source, translated string) error {
	if strings.TrimSpace(translated) == "" {
		return nil
	}
	if strings.Contains(source, "\n") {
		return nil
	}
	if markdownHeadingLineRe.MatchString(translated) && !markdownHeadingLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces ATX heading line(s); keep block structure aligned with the source segment")
	}
	if markdownFenceBacktickLineRe.MatchString(translated) && !markdownFenceBacktickLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces fenced code delimiter line(s)")
	}
	if markdownThematicBreakLineRe.MatchString(translated) && !markdownThematicBreakLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces thematic break line(s)")
	}
	if markdownBlockquoteLineRe.MatchString(translated) && !markdownBlockquoteLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces blockquote line(s)")
	}
	if markdownOrderedListLineRe.MatchString(translated) && !markdownOrderedListLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces ordered list line(s)")
	}
	if markdownBulletListLineRe.MatchString(translated) && !markdownBulletListLineRe.MatchString(source) {
		return fmt.Errorf("markdown structure: translation introduces bullet list line(s)")
	}
	return nil
}
