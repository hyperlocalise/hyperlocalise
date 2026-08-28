package main

import (
	"context"
	"errors"
)

type SpellingIssue struct {
	Word        string
	Suggestions []string
}

var ErrSpellCheckUnavailable = errors.New("spell checking is not available")

const QA_MODE_SPELLING = "spelling"

type SpellChecker interface {
	Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error)
}

type NoopSpellChecker struct{}

func (NoopSpellChecker) Check(_ context.Context, _ string, _ []string) ([]SpellingIssue, error) {
	return nil, ErrSpellCheckUnavailable
}

// uniqueWords returns words in first-seen order, dropping later duplicates.
func uniqueWords(words []string) []string {
	if len(words) < 2 {
		return words
	}

	seen := make(map[string]struct{}, len(words))
	unique := make([]string, 0, len(words))
	for _, word := range words {
		if _, ok := seen[word]; ok {
			continue
		}
		seen[word] = struct{}{}
		unique = append(unique, word)
	}
	return unique
}
