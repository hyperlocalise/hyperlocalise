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
	translationOutputLiquid
	translationOutputICUInvariant
)

// translationOutputKindForSourcePath maps file extension to validation strategy (aligned with check: ICU shape skipped for markdown paths).
func translationOutputKindForSourcePath(path string) translationOutputKind {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".mdx":
		return translationOutputMarkdown
	case ".html":
		return translationOutputHTML
	case ".liquid":
		return translationOutputLiquid
	default:
		return translationOutputICUInvariant
	}
}

// validateTranslatedOutput runs all applicable post-translate checks for the task's source path kind.
//
//   - Markdown / MDX: cheap single-line-segment block-structure heuristic, then internal HLMDPH sentinel multiset (ICU rules are not applied; see check command). Full composed files still use AST parity at flush.
//   - HTML: normalized HTML tag-name sequence must match source, then ICU invariant on the segment text.
//   - Liquid: internal Liquid/HTML sentinel multiset, then ICU invariant on the segment text.
//   - Everything else: ICU MessageFormat / placeholder parity via validateTranslatedInvariant.
func validateTranslatedOutput(task Task, translated string) error {
	return validateTranslatedOutputForKind(translationOutputKindForSourcePath(task.SourcePath), task.SourceText, translated)
}

func validateTranslatedOutputForKind(kind translationOutputKind, source, translated string) error {
	switch kind {
	case translationOutputMarkdown:
		if err := translationfileparser.ValidateMarkdownTranslatedBlockStructure(source, translated); err != nil {
			return &postTranslateValidationError{msg: err.Error()}
		}
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
	case translationOutputLiquid:
		if err := translationfileparser.ValidateLiquidInternalPlaceholders(source, translated); err != nil {
			return &postTranslateValidationError{msg: err.Error()}
		}
		return validateTranslatedInvariant(source, translated)
	default:
		return validateTranslatedInvariant(source, translated)
	}
}
