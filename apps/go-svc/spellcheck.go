package main

import "context"

type SpellingIssue struct {
	Word        string
	Suggestions []string
}

type SpellChecker interface {
	Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error)
}

type NoopSpellChecker struct{}

func (NoopSpellChecker) Check(_ context.Context, _ string, _ []string) ([]SpellingIssue, error) {
	return nil, nil
}
