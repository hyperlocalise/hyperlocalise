package main

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/stretchr/testify/require"
)

func TestSpellingWarningChecksNilAndEmpty(t *testing.T) {
	require.Empty(t, spellingWarningChecks(nil))
	require.Empty(t, spellingWarningChecks([]SpellingIssue{}))
}

func TestSpellingWarningChecksFieldShape(t *testing.T) {
	checks := spellingWarningChecks([]SpellingIssue{
		{Word: "recieve", Suggestions: []string{"receive", "relieve"}},
	})

	require.Len(t, checks, 1)
	check := checks[0]
	require.Equal(t, QA_MODE_SPELLING, check.ID)
	require.Equal(t, "Spelling", check.Label)
	require.Equal(t, segmentvalidate.StatusWarn, check.Status)
	require.Equal(t, QA_MODE_SPELLING, check.Category)
	require.Equal(t, []string{"recieve", "receive", "relieve"}, check.RelatedTokens)
	require.Contains(t, check.Message, "recieve")
	require.Contains(t, check.Message, "receive")
}

func TestSpellingWarningChecksZeroSuggestions(t *testing.T) {
	checks := spellingWarningChecks([]SpellingIssue{
		{Word: "xyzzy", Suggestions: nil},
	})

	require.Len(t, checks, 1)
	require.Equal(t, []string{"xyzzy"}, checks[0].RelatedTokens)
	require.NotContains(t, checks[0].Message, "Suggestions:")
}

func TestSpellingWarningChecksCapsSuggestionsAtThree(t *testing.T) {
	checks := spellingWarningChecks([]SpellingIssue{
		{Word: "helo", Suggestions: []string{"hello", "help", "held", "helot", "halo"}},
	})

	require.Len(t, checks, 1)
	require.Equal(t, []string{"helo", "hello", "help", "held"}, checks[0].RelatedTokens)
}

func TestSpellingWarningChecksCapsIssuesAtFivePreservingOrder(t *testing.T) {
	issues := []SpellingIssue{
		{Word: "w1"},
		{Word: "w2"},
		{Word: "w3"},
		{Word: "w4"},
		{Word: "w5"},
		{Word: "w6"},
		{Word: "w7"},
	}

	checks := spellingWarningChecks(issues)

	require.Len(t, checks, maxSpellingIssues)
	var gotWords []string
	for _, check := range checks {
		gotWords = append(gotWords, check.RelatedTokens[0])
	}
	require.Equal(t, []string{"w1", "w2", "w3", "w4", "w5"}, gotWords)
}

func TestSpellingMessage(t *testing.T) {
	require.Equal(t, `"foo" may be misspelled.`, spellingMessage("foo", nil))
	require.Equal(t, `"foo" may be misspelled. Suggestions: bar, baz.`, spellingMessage("foo", []string{"bar", "baz"}))
}
