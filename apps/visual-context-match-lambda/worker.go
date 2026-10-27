package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	maxMatchAttempts    = 3
	maxCandidateStrings = 20000
	maxScreenshotBytes  = 10 * 1024 * 1024
)

const (
	errorCodeScreenshotNotReady = "screenshot_not_ready"
	errorCodeUnsupportedImage   = "unsupported_image"
	errorCodeTooManyStrings     = "too_many_strings"
	errorCodeProcessingFailed   = "processing_failed"
)

// permanentError fails the process immediately; retrying cannot succeed.
type permanentError struct {
	code string
	err  error
}

func (e permanentError) Error() string {
	return fmt.Sprintf("%s: %v", e.code, e.err)
}

type matchWorker struct {
	logger   *slog.Logger
	repo     matchRepository
	objects  *objectstore.Registry
	detector textDetector
}

// Process runs one match process. A returned error asks SQS to redeliver.
func (w *matchWorker) Process(ctx context.Context, processID string) error {
	process, ok, err := w.repo.ClaimProcess(ctx, processID)
	if err != nil {
		return err
	}
	if !ok {
		w.logger.InfoContext(ctx, "visual_context_match_skipped", "process_id", processID)
		return nil
	}
	if process.Attempts > maxMatchAttempts {
		return w.repo.FailProcess(ctx, process.ID, errorCodeProcessingFailed)
	}
	checked, bound, err := w.run(ctx, process)
	if err == nil {
		w.logger.InfoContext(ctx, "visual_context_match_completed", "process_id", process.ID, "checked", checked, "bound", bound)
		return nil
	}
	var permanent permanentError
	if errors.As(err, &permanent) {
		w.logger.WarnContext(ctx, "visual_context_match_rejected", "process_id", process.ID, "error", err)
		return w.repo.FailProcess(ctx, process.ID, permanent.code)
	}
	if process.Attempts >= maxMatchAttempts {
		w.logger.ErrorContext(ctx, "visual_context_match_exhausted", "process_id", process.ID, "error", err)
		return w.repo.FailProcess(ctx, process.ID, errorCodeProcessingFailed)
	}
	return err
}

func (w *matchWorker) run(ctx context.Context, process claimedProcess) (int, int, error) {
	if process.ScreenshotStatus != "ready" {
		return 0, 0, permanentError{code: errorCodeScreenshotNotReady, err: errors.New("screenshot upload is not finalized")}
	}
	candidates, err := w.repo.LoadCandidates(ctx, process, maxCandidateStrings+1)
	if err != nil {
		return 0, 0, err
	}
	if len(candidates) > maxCandidateStrings {
		return 0, 0, permanentError{code: errorCodeTooManyStrings, err: fmt.Errorf("more than %d strings in scope", maxCandidateStrings)}
	}
	if len(candidates) == 0 {
		_, err := w.repo.CompleteProcess(ctx, process, 0, nil)
		return 0, 0, err
	}
	data, err := w.download(ctx, process)
	if err != nil {
		return 0, 0, err
	}
	image, err := prepareTextractImage(data, process.ContentType)
	if err != nil {
		return 0, 0, asUnsupportedImage(err)
	}
	lines, err := w.detector.DetectLines(ctx, image)
	if err != nil {
		return 0, 0, asUnsupportedImage(err)
	}
	matches := matchStrings(lines, candidates)
	bound, err := w.repo.CompleteProcess(ctx, process, len(candidates), matches)
	if err != nil {
		return 0, 0, err
	}
	return len(candidates), bound, nil
}

func (w *matchWorker) download(ctx context.Context, process claimedProcess) ([]byte, error) {
	store, err := w.objects.Resolve(process.ObjectLocation)
	if err != nil {
		return nil, permanentError{code: errorCodeUnsupportedImage, err: err}
	}
	body, _, err := store.Get(ctx, process.ObjectKey)
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil, permanentError{code: errorCodeUnsupportedImage, err: err}
		}
		return nil, fmt.Errorf("download screenshot: %w", err)
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, maxScreenshotBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read screenshot: %w", err)
	}
	if len(data) > maxScreenshotBytes {
		return nil, permanentError{code: errorCodeUnsupportedImage, err: errors.New("screenshot exceeds size limit")}
	}
	return data, nil
}

func asUnsupportedImage(err error) error {
	if errors.Is(err, errUnsupportedImage) {
		return permanentError{code: errorCodeUnsupportedImage, err: err}
	}
	return err
}
