package main

import (
	"context"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

type fakeSpellChecker struct {
	receivedCtx    context.Context
	receivedLocale string
	receivedWords  []string

	issues []SpellingIssue
	err    error
}

func (f *fakeSpellChecker) Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error) {
	f.receivedCtx = ctx
	f.receivedLocale = locale
	f.receivedWords = words
	return f.issues, f.err
}

func TestCheckSpellingInjectsConfiguredProvider(t *testing.T) {
	fake := &fakeSpellChecker{
		issues: []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}},
	}
	h := &handler{spellChecker: fake}

	text := "Please recieve the {name} update"
	issues, err := h.checkSpelling(context.Background(), "fr-FR", text)

	require.NoError(t, err)
	require.Equal(t, fake.issues, issues)
	require.Equal(t, "fr-FR", fake.receivedLocale)
	require.Equal(t, spellcheck.Tokenize(text), fake.receivedWords)
}

func TestCheckSpellingPropagatesContextCancellation(t *testing.T) {
	fake := &fakeSpellChecker{}
	h := &handler{spellChecker: fake}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _ = h.checkSpelling(ctx, "", "Hello there")

	require.NotNil(t, fake.receivedCtx)
	require.ErrorIs(t, fake.receivedCtx.Err(), context.Canceled)
}

func TestCheckSpellingNoopWhenUnconfigured(t *testing.T) {
	h := newHandler()

	issues, err := h.checkSpelling(context.Background(), "", "Hello there")

	require.ErrorIs(t, err, ErrSpellCheckUnavailable)
	require.Nil(t, issues)
}

func TestCheckSpellingDeduplicatesTokens(t *testing.T) {
	fake := &fakeSpellChecker{}
	h := &handler{spellChecker: fake}

	_, err := h.checkSpelling(context.Background(), "en-US", "helo helo hello helo")

	require.NoError(t, err)
	require.Equal(t, []string{"helo", "hello"}, fake.receivedWords)
}

func TestUniqueWords(t *testing.T) {
	tests := []struct {
		name  string
		words []string
		want  []string
	}{
		{name: "nil", words: nil, want: nil},
		{name: "empty", words: []string{}, want: []string{}},
		{name: "single word", words: []string{"hello"}, want: []string{"hello"}},
		{name: "already unique", words: []string{"hello", "world"}, want: []string{"hello", "world"}},
		{name: "repeated misspelling", words: []string{"helo", "helo", "helo"}, want: []string{"helo"}},
		{name: "preserves first-seen order", words: []string{"helo", "hello", "helo", "world", "hello"}, want: []string{"helo", "hello", "world"}},
		{name: "case-sensitive", words: []string{"Hello", "hello", "Hello"}, want: []string{"Hello", "hello"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := uniqueWords(tt.words)
			require.Equal(t, tt.want, got)
		})
	}
}
