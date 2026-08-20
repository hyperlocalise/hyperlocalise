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

const QAModeSpelling = "spelling"

type SpellChecker interface {
	Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error)
}

type NoopSpellChecker struct{}

func (NoopSpellChecker) Check(_ context.Context, _ string, _ []string) ([]SpellingIssue, error) {
	return nil, ErrSpellCheckUnavailable
}
