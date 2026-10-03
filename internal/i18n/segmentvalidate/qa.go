package segmentvalidate

import "strings"

const (
	QAModeSameAsSource   = "same_as_source"
	QAModeWhitespaceOnly = "whitespace_only"
	QAModeNotLocalized   = "not_localized"
	QAModeEscapedChar    = "escaped_char_mismatch"
	QAModeNumbers        = "numbers_mismatch"
	QAModePunctuation    = "punctuation_mismatch"
	QAModeCharacterCase  = "character_case_mismatch"
)

// KnownQAModes lists supported optional QA mode identifiers.
func KnownQAModes() []string {
	return []string{
		QAModeSameAsSource,
		QAModeWhitespaceOnly,
		QAModeNotLocalized,
		QAModeEscapedChar,
		QAModeNumbers,
		QAModePunctuation,
		QAModeCharacterCase,
	}
}

func qaChecks(checks []Check, req Request) []Check {
	if len(req.Modes) == 0 {
		return checks
	}

	// Parse active modes with local flags to avoid allocating a mode set.
	var hasNotLocalized, hasWhitespaceOnly, hasSameAsSource, hasEscapedChar bool
	var hasNumbers, hasPunctuation, hasCase bool
	for _, mode := range req.Modes {
		mode = strings.TrimSpace(mode)
		switch mode {
		case QAModeNotLocalized:
			hasNotLocalized = true
		case QAModeWhitespaceOnly:
			hasWhitespaceOnly = true
		case QAModeSameAsSource:
			hasSameAsSource = true
		case QAModeEscapedChar:
			hasEscapedChar = true
		case QAModeNumbers:
			hasNumbers = true
		case QAModePunctuation:
			hasPunctuation = true
		case QAModeCharacterCase:
			hasCase = true
		}
	}

	if !hasNotLocalized && !hasWhitespaceOnly && !hasSameAsSource && !hasEscapedChar && !hasNumbers && !hasPunctuation && !hasCase {
		return checks
	}

	// BOLT OPTIMIZATION: Append directly into destination slice to avoid secondary
	// slice allocation and copying.
	if hasNotLocalized {
		if check, include := notLocalizedCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasWhitespaceOnly {
		if check, include := whitespaceOnlyCheck(req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasSameAsSource {
		if check, include := sameAsSourceCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasEscapedChar {
		if check, include := escapedCharCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasNumbers {
		if check, include := numberMismatchCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasPunctuation {
		if check, include := punctuationMismatchCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if hasCase {
		if check, include := caseMismatchCheck(req.SourceText, req.TargetText, req.TargetLocale); include {
			checks = append(checks, check)
		}
	}
	return checks
}

func notLocalizedCheck(source, target string) (Check, bool) {
	if strings.TrimSpace(target) != "" {
		return Check{}, false
	}
	message := "Target value is empty."
	if strings.TrimSpace(source) == "" {
		message = "Target value is empty while source is also empty."
	}
	return Check{
		ID:       "qa-not-localized",
		Label:    "Translation",
		Status:   StatusFail,
		Message:  message,
		Category: "qa",
	}, true
}

func whitespaceOnlyCheck(target string) (Check, bool) {
	if target == "" || strings.TrimSpace(target) != "" {
		return Check{}, false
	}
	return Check{
		ID:       "qa-whitespace-only",
		Label:    "Whitespace",
		Status:   StatusWarn,
		Message:  "Target value contains only whitespace.",
		Category: "qa",
	}, true
}

func sameAsSourceCheck(source, target string) (Check, bool) {
	if strings.TrimSpace(target) == "" {
		return Check{}, false
	}
	sourceTrimmed := strings.TrimSpace(source)
	targetTrimmed := strings.TrimSpace(target)
	if sourceTrimmed == "" || sourceTrimmed != targetTrimmed {
		return Check{}, false
	}
	return Check{
		ID:       "qa-same-as-source",
		Label:    "Same as source",
		Status:   StatusWarn,
		Message:  "Target value matches source.",
		Category: "qa",
	}, true
}

func escapedCharCheck(source, target string) (Check, bool) {
	tokens := IntroducedEscapedChars(source, target)
	if len(tokens) == 0 {
		return Check{}, false
	}
	return Check{
		ID:            "qa-escaped-char-mismatch",
		Label:         "Escaped characters",
		Status:        StatusWarn,
		Message:       DescribeIntroducedEscapedChars(tokens),
		Category:      "qa",
		RelatedTokens: tokens,
	}, true
}

// DescribeIntroducedEscapedChars formats a warning for tokens returned by IntroducedEscapedChars.
func DescribeIntroducedEscapedChars(tokens []string) string {
	if len(tokens) == 0 {
		return "Target introduces escaped characters that are not in the source."
	}
	if len(tokens) == 1 {
		return "Target introduces escaped characters (" + tokens[0] + ") that are not in the source."
	}
	return "Target introduces escaped characters (" + strings.Join(tokens, ", ") + ") that are not in the source."
}
