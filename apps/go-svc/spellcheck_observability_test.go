package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

func captureSlog(t *testing.T) *bytes.Buffer {
	t.Helper()

	var buf bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(original) })
	return &buf
}

func findLogEntry(t *testing.T, buf *bytes.Buffer, message string) map[string]any {
	t.Helper()

	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &entry))
		if entry["msg"] == message {
			return entry
		}
	}
	t.Fatalf("no log line with message %q found in: %s", message, buf.String())
	return nil
}

const spellingObservabilityLogMessage = "spellcheck: request completed"

func TestComposeSegmentValidationLogsSpellingObservabilityOnSuccess(t *testing.T) {
	buf := captureSlog(t)
	fake := &fakeSpellChecker{issues: []SpellingIssue{
		{Word: "recieve", Suggestions: []string{"receive"}},
		{Word: "wierd", Suggestions: []string{"weird"}},
	}}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{
		SourceText: "Hello",
		TargetText: "Please recieve the wierd update",
		SourcePath: "/messages/en.json",
	}
	_, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)
	require.NoError(t, err)
	require.Empty(t, skipped)

	entry := findLogEntry(t, buf, spellingObservabilityLogMessage)
	require.Contains(t, entry, "spelling_duration_ms")
	require.Equal(t, false, entry["spelling_locale_skipped"])
	require.Equal(t, float64(0), entry["spelling_provider_error_count"])
	require.Equal(t, float64(2), entry["spelling_warning_count"])
}

func TestComposeSegmentValidationLogsSpellingObservabilityOnLocaleSkip(t *testing.T) {
	buf := captureSlog(t)
	fake := &fakeSpellChecker{err: fmt.Errorf("%w: %q", spellcheck.ErrUnsupportedLocale, "en-CA")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	_, skipped, err := h.composeSegmentValidation(context.Background(), req, "en-CA", true)
	require.NoError(t, err)
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)

	entry := findLogEntry(t, buf, spellingObservabilityLogMessage)
	require.Contains(t, entry, "spelling_duration_ms")
	require.Equal(t, true, entry["spelling_locale_skipped"])
	require.Equal(t, float64(0), entry["spelling_provider_error_count"])
	require.Equal(t, float64(0), entry["spelling_warning_count"])
}

func TestComposeSegmentValidationLogsSpellingObservabilityOnUnavailableProvider(t *testing.T) {
	buf := captureSlog(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: NoopSpellChecker{}}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	_, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)
	require.NoError(t, err)
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)

	entry := findLogEntry(t, buf, spellingObservabilityLogMessage)
	require.Equal(t, true, entry["spelling_locale_skipped"])
	require.Equal(t, float64(0), entry["spelling_provider_error_count"])
	require.Equal(t, float64(0), entry["spelling_warning_count"])
}

func TestComposeSegmentValidationLogsSpellingObservabilityOnProviderError(t *testing.T) {
	buf := captureSlog(t)
	fake := &fakeSpellChecker{err: errors.New("provider exploded")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	_, skipped, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)
	require.NoError(t, err)
	require.Equal(t, []string{QA_MODE_SPELLING}, skipped)

	entry := findLogEntry(t, buf, spellingObservabilityLogMessage)
	require.Equal(t, false, entry["spelling_locale_skipped"])
	require.Equal(t, float64(1), entry["spelling_provider_error_count"])
	require.Equal(t, float64(0), entry["spelling_warning_count"])
}

func TestComposeSegmentValidationDoesNotLogSpellingObservabilityWhenNotRequested(t *testing.T) {
	buf := captureSlog(t)
	h := &handler{
		validate: func(req segmentvalidate.Request) []segmentvalidate.Check {
			return []segmentvalidate.Check{{ID: "format-parity", Status: segmentvalidate.StatusPass}}
		},
		spellChecker: &fakeSpellChecker{},
	}

	_, _, err := h.composeSegmentValidation(context.Background(), validateSegmentRequest{}, "", false)
	require.NoError(t, err)
	require.Empty(t, buf.String(), "no spelling observability should be logged when spelling was not requested")
}

func TestComposeSegmentValidationDoesNotLogSpellingObservabilityOnCancellation(t *testing.T) {
	buf := captureSlog(t)
	fake := &fakeSpellChecker{err: context.Canceled}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{SourceText: "Hello", TargetText: "Bonjour", SourcePath: "/messages/en.json"}
	_, _, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)
	require.ErrorIs(t, err, context.Canceled)
	require.Empty(t, buf.String(), "a canceled spelling check has no completed outcome to report")
}

func TestComposeSegmentValidationSpellingObservabilityNeverLogsSegmentText(t *testing.T) {
	buf := captureSlog(t)
	const canary = "CANARY-SECRET-do-not-log-this-9f2c"
	fake := &fakeSpellChecker{issues: []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}}}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}

	req := validateSegmentRequest{
		SourceText: "Source " + canary,
		TargetText: "Target " + canary + " recieve",
		SourcePath: "/messages/" + canary + ".json",
	}
	_, _, err := h.composeSegmentValidation(context.Background(), req, "fr-FR", true)
	require.NoError(t, err)

	require.NotContains(t, buf.String(), canary, "spelling observability logs must never include segment text")
}
