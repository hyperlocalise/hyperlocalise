package runsvc

import (
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

// acceptTranslatedOutput recovers markdown HLMDPH tokens when the model wrote
// real markdown, then runs post-translate checks. The returned string is what
// must be stored so marshal can expand tokens instead of falling back to English.
func acceptTranslatedOutput(task Task, translated string) (string, error) {
	accepted := translated
	if segmentvalidate.KindForSourcePath(task.SourcePath) == segmentvalidate.FormatMarkdown {
		recovered, err := translationfileparser.RecoverMarkdownInternalPlaceholders(task.SourceText, translated)
		if err != nil {
			return "", validationErrorFromSegment(err)
		}
		accepted = recovered
	}
	if err := validateTranslatedOutput(task, accepted); err != nil {
		return "", err
	}
	return accepted, nil
}

// validateTranslatedOutput runs all applicable post-translate checks for the task's source path kind.
//
//   - Markdown / MDX: cheap single-line-segment block-structure heuristic, then internal HLMDPH sentinel multiset (ICU rules are not applied; see check command). Full composed files still use AST parity at flush.
//   - HTML: normalized HTML tag-name sequence must match source, then ICU invariant on the segment text.
//   - Liquid: internal Liquid/HTML sentinel multiset, then ICU invariant on the segment text.
//   - Everything else: ICU MessageFormat / placeholder parity via validateTranslatedInvariant.
func validateTranslatedOutput(task Task, translated string) error {
	return validationErrorFromSegment(
		segmentvalidate.FirstValidationError(task.SourcePath, task.SourceText, translated),
	)
}

func validationErrorFromSegment(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if strings.Contains(msg, "translation invariant violation") {
		return &invariantViolationError{msg: msg}
	}
	return &postTranslateValidationError{msg: msg}
}
