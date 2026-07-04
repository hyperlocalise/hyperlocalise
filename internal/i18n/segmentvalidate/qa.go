package segmentvalidate

import "strings"

const (
	QAModeSameAsSource   = "same_as_source"
	QAModeWhitespaceOnly = "whitespace_only"
	QAModeNotLocalized   = "not_localized"
)

// KnownQAModes lists supported optional QA mode identifiers.
func KnownQAModes() []string {
	return []string{
		QAModeSameAsSource,
		QAModeWhitespaceOnly,
		QAModeNotLocalized,
	}
}

func qaChecks(req Request) []Check {
	if len(req.Modes) == 0 {
		return nil
	}

	modeSet := make(map[string]struct{}, len(req.Modes))
	for _, mode := range req.Modes {
		mode = strings.TrimSpace(mode)
		if mode == "" {
			continue
		}
		modeSet[mode] = struct{}{}
	}
	if len(modeSet) == 0 {
		return nil
	}

	checks := make([]Check, 0, len(modeSet))
	if _, ok := modeSet[QAModeNotLocalized]; ok {
		if check, include := notLocalizedCheck(req.SourceText, req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if _, ok := modeSet[QAModeWhitespaceOnly]; ok {
		if check, include := whitespaceOnlyCheck(req.TargetText); include {
			checks = append(checks, check)
		}
	}
	if _, ok := modeSet[QAModeSameAsSource]; ok {
		if check, include := sameAsSourceCheck(req.SourceText, req.TargetText); include {
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
