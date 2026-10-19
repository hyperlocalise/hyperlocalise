package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type fakeMatchRepo struct {
	process     claimedProcess
	ok          bool
	claimErr    error
	candidates  []matchCandidate
	loadErr     error
	bound       int
	completeErr error
	failErr     error

	claimCalls    int
	completeCalls int
	failCalls     int
	failCode      string
	checked       int
	matches       []stringMatch
}

func (r *fakeMatchRepo) ClaimProcess(context.Context, string) (claimedProcess, bool, error) {
	r.claimCalls++
	if r.claimErr != nil {
		return claimedProcess{}, false, r.claimErr
	}
	return r.process, r.ok, nil
}

func (r *fakeMatchRepo) LoadCandidates(context.Context, claimedProcess, int) ([]matchCandidate, error) {
	if r.loadErr != nil {
		return nil, r.loadErr
	}
	return r.candidates, nil
}

func (r *fakeMatchRepo) CompleteProcess(_ context.Context, _ claimedProcess, checked int, matches []stringMatch) (int, error) {
	r.completeCalls++
	r.checked = checked
	r.matches = matches
	if r.completeErr != nil {
		return 0, r.completeErr
	}
	return r.bound, nil
}

func (r *fakeMatchRepo) FailProcess(_ context.Context, _, code string) error {
	r.failCalls++
	r.failCode = code
	return r.failErr
}

type fakeDetector struct {
	lines []ocrLine
	err   error
	calls int
}

func (d *fakeDetector) DetectLines(context.Context, []byte) ([]ocrLine, error) {
	d.calls++
	return d.lines, d.err
}

func testWorker(t *testing.T, repo *fakeMatchRepo, detector textDetector, objects *objectstore.Registry) *matchWorker {
	t.Helper()
	return &matchWorker{
		logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		repo:     repo,
		objects:  objects,
		detector: detector,
	}
}

func TestProcessSkipsWhenClaimFindsNoQueuedRow(t *testing.T) {
	repo := &fakeMatchRepo{}
	err := testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, 1, repo.claimCalls)
	require.Zero(t, repo.completeCalls)
	require.Zero(t, repo.failCalls)
}

func TestProcessFailsImmediatelyAfterTooManyAttempts(t *testing.T) {
	repo := &fakeMatchRepo{
		ok:      true,
		process: claimedProcess{ID: "proc-1", Attempts: maxMatchAttempts + 1},
	}
	err := testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, 1, repo.failCalls)
	require.Equal(t, errorCodeProcessingFailed, repo.failCode)
	require.Zero(t, repo.completeCalls)
}

func TestProcessFailsPermanentlyWhenScreenshotIsNotReady(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "uploading",
		},
	}
	err := testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, errorCodeScreenshotNotReady, repo.failCode)
}

func TestProcessFailsPermanentlyWhenTooManyCandidates(t *testing.T) {
	candidates := make([]matchCandidate, maxCandidateStrings+1)
	for i := range candidates {
		candidates[i] = matchCandidate{KeyID: "k", SourceText: "Hello"}
	}
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
		},
		candidates: candidates,
	}
	err := testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, errorCodeTooManyStrings, repo.failCode)
}

func TestProcessCompletesWithNoCandidates(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
		},
	}
	err := testWorker(t, repo, &fakeDetector{}, nil).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, 1, repo.completeCalls)
	require.Zero(t, repo.checked)
	require.Nil(t, repo.matches)
	require.Zero(t, repo.failCalls)
}

func TestProcessReturnsRetryableDetectorErrorUntilAttemptsAreExhausted(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
			ObjectLocation:   "local",
			ObjectKey:        "shot.png",
			ContentType:      "image/png",
		},
		candidates: []matchCandidate{{KeyID: "hello", SourceText: "Hello"}},
	}
	store := memory.New()
	pngBytes := mustTestPNG(t, 2, 2)
	_, err := store.Put(context.Background(), objectstore.PutInput{
		Key:         "shot.png",
		Body:        bytes.NewReader(pngBytes),
		Size:        int64(len(pngBytes)),
		ContentType: "image/png",
	})
	require.NoError(t, err)
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": store})
	require.NoError(t, err)
	detector := &fakeDetector{err: errors.New("textract timeout")}

	err = testWorker(t, repo, detector, registry).Process(context.Background(), "proc-1")
	require.EqualError(t, err, "textract timeout")
	require.Equal(t, 1, detector.calls)
	require.Zero(t, repo.failCalls)

	repo.process.Attempts = maxMatchAttempts
	err = testWorker(t, repo, detector, registry).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, errorCodeProcessingFailed, repo.failCode)
}

func TestProcessFailsPermanentlyWhenScreenshotIsMissing(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
			ObjectLocation:   "local",
			ObjectKey:        "missing.png",
			ContentType:      "image/png",
		},
		candidates: []matchCandidate{{KeyID: "hello", SourceText: "Hello"}},
	}
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": memory.New()})
	require.NoError(t, err)

	err = testWorker(t, repo, &fakeDetector{}, registry).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, errorCodeUnsupportedImage, repo.failCode)
}

func TestProcessCompletesMatchesFromDetectedLines(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
			ObjectLocation:   "local",
			ObjectKey:        "shot.png",
			ContentType:      "image/png",
		},
		candidates: []matchCandidate{{KeyID: "hello", SourceText: "Hello"}},
		bound:      1,
	}
	store := memory.New()
	pngBytes := mustTestPNG(t, 2, 2)
	_, err := store.Put(context.Background(), objectstore.PutInput{
		Key:         "shot.png",
		Body:        bytes.NewReader(pngBytes),
		Size:        int64(len(pngBytes)),
		ContentType: "image/png",
	})
	require.NoError(t, err)
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": store})
	require.NoError(t, err)

	err = testWorker(t, repo, &fakeDetector{lines: []ocrLine{confidentLine("Hello", 0.1, 0.1, 0.2, 0.05)}}, registry).
		Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, 1, repo.completeCalls)
	require.Equal(t, 1, repo.checked)
	require.Len(t, repo.matches, 1)
	require.Equal(t, []string{"hello"}, repo.matches[0].KeyIDs)
	require.Zero(t, repo.failCalls)
}

func TestProcessFailsPermanentlyForUnsupportedImageBytes(t *testing.T) {
	repo := &fakeMatchRepo{
		ok: true,
		process: claimedProcess{
			ID:               "proc-1",
			Attempts:         1,
			ScreenshotStatus: "ready",
			ObjectLocation:   "local",
			ObjectKey:        "shot.bin",
			ContentType:      "application/octet-stream",
		},
		candidates: []matchCandidate{{KeyID: "hello", SourceText: "Hello"}},
	}
	store := memory.New()
	body := []byte("not-an-image")
	_, err := store.Put(context.Background(), objectstore.PutInput{
		Key:         "shot.bin",
		Body:        bytes.NewReader(body),
		Size:        int64(len(body)),
		ContentType: "application/octet-stream",
	})
	require.NoError(t, err)
	registry, err := objectstore.NewRegistry("local", map[string]objectstore.Store{"local": store})
	require.NoError(t, err)

	err = testWorker(t, repo, &fakeDetector{}, registry).Process(context.Background(), "proc-1")
	require.NoError(t, err)
	require.Equal(t, errorCodeUnsupportedImage, repo.failCode)
}
