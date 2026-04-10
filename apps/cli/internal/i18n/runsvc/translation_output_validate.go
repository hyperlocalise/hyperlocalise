package runsvc

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/htmltagparity"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

// translationOutputKind selects which post-translate checks apply to a source file segment.
type translationOutputKind int

const (
	translationOutputMarkdown translationOutputKind = iota
	translationOutputHTML
	translationOutputICUInvariant
)

// translationOutputKindForSourcePath maps file extension to validation strategy (aligned with check: ICU shape skipped for markdown paths).
func translationOutputKindForSourcePath(path string) translationOutputKind {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".mdx":
		return translationOutputMarkdown
	case ".html":
		return translationOutputHTML
	default:
		return translationOutputICUInvariant
	}
}

// validateTranslatedOutput runs all applicable post-translate checks for the task's source path kind.
//
//   - Markdown / MDX: internal HLMDPH sentinel multiset only (ICU rules are not applied; see check command).
//   - HTML: normalized HTML tag-name sequence must match source, then ICU invariant on the segment text.
//   - Everything else: ICU MessageFormat / placeholder parity via validateTranslatedInvariant.
func validateTranslatedOutput(task Task, translated string) error {
	return validateTranslatedOutputForKind(translationOutputKindForSourcePath(task.SourcePath), task.SourceText, translated)
}

func validateTranslatedOutputForKind(kind translationOutputKind, source, translated string) error {
	switch kind {
	case translationOutputMarkdown:
		if err := translationfileparser.ValidateMarkdownInternalPlaceholders(source, translated); err != nil {
			return &postTranslateValidationError{msg: err.Error()}
		}
		return nil
	case translationOutputHTML:
		if htmltagparity.Mismatch(source, translated) {
			return &postTranslateValidationError{
				msg: fmt.Sprintf("html tag structure differs from source | %s", formatInvariantDebugContext(source, translated)),
			}
		}
		return validateTranslatedInvariant(source, translated)
	default:
		return validateTranslatedInvariant(source, translated)
	}
}
