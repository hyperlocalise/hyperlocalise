package main

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)

const (
	maxSpellingIssues      = 5
	maxSpellingSuggestions = 3
)

func spellingWarningChecks(issues []SpellingIssue) []segmentvalidate.Check {
	if len(issues) > maxSpellingIssues {
		issues = issues[:maxSpellingIssues]
	}

	checks := make([]segmentvalidate.Check, 0, len(issues))
	for _, issue := range issues {
		suggestions := issue.Suggestions
		if len(suggestions) > maxSpellingSuggestions {
			suggestions = suggestions[:maxSpellingSuggestions]
		}

		relatedTokens := make([]string, 0, 1+len(suggestions))
		relatedTokens = append(relatedTokens, issue.Word)
		relatedTokens = append(relatedTokens, suggestions...)

		checks = append(checks, segmentvalidate.Check{
			ID:            spellingCheckID(issue.Word),
			Label:         "Spelling",
			Status:        segmentvalidate.StatusWarn,
			Message:       spellingMessage(issue.Word, suggestions),
			Category:      QA_MODE_SPELLING,
			RelatedTokens: relatedTokens,
		})
	}
	return checks
}

func spellingCheckID(word string) string {
	return QA_MODE_SPELLING + "-" + word
}

func spellingMessage(word string, suggestions []string) string {
	if len(suggestions) == 0 {
		return fmt.Sprintf("%q may be misspelled.", word)
	}
	return fmt.Sprintf("%q may be misspelled. Suggestions: %s.", word, strings.Join(suggestions, ", "))
}
