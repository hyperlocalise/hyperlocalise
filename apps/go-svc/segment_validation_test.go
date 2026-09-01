package main

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

func TestComposeSegmentValidationSpellingNotRequested(t *testing.T) {
	fake := &fakeSpellChecker{}
	h := &handler{
		validate: func(req segmentvalidate.Request) []segmentvalidate.Check {
			return []segmentvalidate.Check{{ID: "format-parity", Status: segmentvalidate.StatusPass}}
		},
		spellChecker: fake,
	}

	checks, skipped, err := h.composeSegmentValidation(context.Background(), validateSegmentRequest{}, "", false)

	require.NoError(t, err)
	require.Nil(t, skipped)
	require.Len(t, checks, 1)
	require.Nil(t, fake.receivedCtx, "spell checker must not be invoked when spelling is not requested")
}

func TestComposeSegmentValidationSkipsOnUnsupportedLocale(t *testing.T) {
	fake := &fakeSpellChecker{err: fmt.Errorf("%w: %q", spellcheck.ErrUnsupportedLocale, "en-CA")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "en-CA", true)

	require.NoError(t, err)
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)
	require.Len(t, checks, 1)
	require.Equal(t, "format-parity", checks[0].ID)
}

func TestComposeSegmentValidationSkipsOnUnavailableProvider(t *testing.T) {
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: NoopSpellChecker{}}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.NoError(t, err)
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)
	require.Len(t, checks, 1)
	require.Equal(t, "format-parity", checks[0].ID)
}

func TestComposeSegmentValidationSkipsOnUnexpectedProviderError(t *testing.T) {
	fake := &fakeSpellChecker{err: errors.New("provider exploded")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.NoError(t, err, "an unexpected provider error must not fail the request")
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)
	require.Len(t, checks, 1)
	require.Equal(t, "format-parity", checks[0].ID)
}

func TestComposeSegmentValidationPropagatesCancellation(t *testing.T) {
	fake := &fakeSpellChecker{err: context.Canceled}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.ErrorIs(t, err, context.Canceled)
	require.Nil(t, checks, "a canceled request must not silently succeed with format/QA checks")
	require.Nil(t, skipped, "cancellation must not be reported as a skipped mode")
}

func TestComposeSegmentValidationPropagatesDeadlineExceeded(t *testing.T) {
	fake := &fakeSpellChecker{err: context.DeadlineExceeded}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Nil(t, checks)
	require.Nil(t, skipped)
}

func TestComposeSegmentValidationPropagatesContextToProvider(t *testing.T) {
	fake := &fakeSpellChecker{}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	type ctxKey struct{}
	ctx := context.WithValue(context.Background(), ctxKey{}, "marker")

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	_, _, err := h.composeSegmentValidation(ctx, req, "fr-FR", true)

	require.NoError(t, err)
	require.Equal(t, "marker", fake.receivedCtx.Value(ctxKey{}))
}

func TestComposeSegmentValidationAppendsSpellingWarnings(t *testing.T) {
	fake := &fakeSpellChecker{
		issues: []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}},
	}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{
		SourceText: "Hello",
		TargetText: "Please recieve the update",
		SourcePath: "/messages/en.json",
	}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.NoError(t, err)
	require.Empty(t, skipped)
	require.Len(t, checks, 2)
	require.Equal(t, "format-parity", checks[0].ID)
	require.Equal(t, "spelling-recieve", checks[1].ID)
	require.Equal(t, QA_MODE_SPELLING, checks[1].Category)
	require.Equal(t, segmentvalidate.StatusWarn, checks[1].Status)
	require.Equal(t, []string{"recieve", "receive"}, checks[1].RelatedTokens)
}

func TestComposeSegmentValidationRepeatedMisspellingProducesOneWarning(t *testing.T) {
	fake := &fakeSpellChecker{
		issues: []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}},
	}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{
		SourceText: "Hello",
		TargetText: "Please recieve recieve recieve the update",
		SourcePath: "/messages/en.json",
	}
	checks, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)

	require.NoError(t, err)
	require.Empty(t, skipped)

	var recieveOccurrences int
	for _, word := range fake.receivedWords {
		if word == "recieve" {
			recieveOccurrences++
		}
	}
	require.Equal(t, 1, recieveOccurrences, "checkSpelling must dedupe before calling the provider")

	var spellingChecks int
	for _, check := range checks {
		if check.Category == QA_MODE_SPELLING {
			spellingChecks++
		}
	}
	require.Equal(t, 1, spellingChecks)
}
