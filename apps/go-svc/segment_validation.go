package main

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
)

// composeSegmentValidation adds optional spelling warnings to format/QA checks.
// Spelling failures are non-fatal, except for context cancellation.
func (h *handler) composeSegmentValidation(
	ctx context.Context,
	req validateSegmentRequest,
	targetLocale string,
	spellingRequested bool,
) ([]segmentvalidate.Check, []string, error) {
	checks := h.validate(segmentvalidate.Request{
		SourceText: req.SourceText,
		TargetText: req.TargetText,
		SourcePath: req.SourcePath,
		MaxLength:  req.MaxLength,
		Modes:      req.Modes,
	})

	if !spellingRequested {
		return checks, nil, nil
	}

	startedAt := time.Now()
	issues, err := h.checkSpelling(ctx, targetLocale, req.TargetText)
	duration := time.Since(startedAt)

	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return nil, nil, err
	case errors.Is(err, ErrSpellCheckUnavailable), errors.Is(err, spellcheck.ErrUnsupportedLocale):
		logSpellingObservability(duration, true, 0, 0)
		return checks, []string{QA_MODE_SPELLING}, nil
	case err != nil:
		slog.Warn("spellcheck: skipping spelling checks after unexpected provider error", "error", err)
		logSpellingObservability(duration, false, 1, 0)
		return checks, []string{QA_MODE_SPELLING}, nil
	default:
		logSpellingObservability(duration, false, 0, len(issues))
		return append(checks, spellingWarningChecks(issues)...), nil, nil
	}
}
