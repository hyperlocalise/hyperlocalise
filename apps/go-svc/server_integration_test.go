package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

// This file proves production server assembly and lifecycle: the same
// *http.Server construction main.go uses (newHTTPServer + registerRoutes +
// requestLogMiddleware + withOptionalPrefix), listening on a real TCP
// socket, handling concurrent requests, and shutting down gracefully. It
// deliberately does not require the cgo_hunspell build tag or real
// dictionaries — that is the job of the handler-to-Hunspell integration
// tests, which exercise the spelling provider itself.

// stubSpellChecker is a stateless SpellChecker safe for concurrent use
// across goroutines (unlike fakeSpellChecker in spellcheck_test.go, which
// records the last request into shared struct fields and is only meant for
// single-goroutine unit tests).
type stubSpellChecker struct{}

func (stubSpellChecker) Check(_ context.Context, locale string, _ []string) ([]SpellingIssue, error) {
	switch locale {
	case "fr-FR":
		return []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}}, nil
	case "en-CA":
		return nil, fmt.Errorf("%w: %q", spellcheck.ErrUnsupportedLocale, locale)
	default:
		return nil, ErrSpellCheckUnavailable
	}
}

type delayedSpellChecker struct {
	delay    time.Duration
	delegate SpellChecker
}

func (d delayedSpellChecker) Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error) {
	select {
	case <-time.After(d.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return d.delegate.Check(ctx, locale, words)
}

func startTestServer(t *testing.T, h *handler) (baseURL string, server *http.Server) {
	t.Helper()

	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})
	rootHandler := requestLogMiddleware(withOptionalPrefix(publicPathPrefix, mux))

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	srv := newHTTPServer(listener.Addr().String(), rootHandler)

	serveErrCh := make(chan error, 1)
	go func() {
		serveErrCh <- srv.Serve(listener)
	}()
	t.Cleanup(func() {
		_ = srv.Close()
		<-serveErrCh
	})

	return "http://" + listener.Addr().String(), srv
}

func postSegment(client *http.Client, baseURL, payload string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/validate/segment", strings.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	return client.Do(req)
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

type concurrentValidationCase struct {
	name        string
	payload     string
	wantStatus  int
	wantSkipped []string
}

func TestServerConcurrentValidationRequests(t *testing.T) {
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: stubSpellChecker{}}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{Timeout: 5 * time.Second}

	cases := []concurrentValidationCase{
		{
			name:       "supported locale returns spelling warning",
			payload:    `{"sourceText":"Hello","targetText":"Please recieve the update","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`,
			wantStatus: http.StatusOK,
		},
		{
			name:        "unsupported locale skips spelling but keeps format checks",
			payload:     `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"en-CA"}`,
			wantStatus:  http.StatusOK,
			wantSkipped: []string{QA_MODE_SPELLING},
		},
		{
			name:       "no modes requested runs only format checks",
			payload:    `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json"}`,
			wantStatus: http.StatusOK,
		},
	}

	const requestsPerCase = 8
	var wg sync.WaitGroup
	errCh := make(chan error, len(cases)*requestsPerCase)

	for _, tc := range cases {
		for i := 0; i < requestsPerCase; i++ {
			wg.Add(1)
			go func(tc concurrentValidationCase) {
				defer wg.Done()

				resp, err := postSegment(client, baseURL, tc.payload)
				if err != nil {
					errCh <- fmt.Errorf("%s: request error: %w", tc.name, err)
					return
				}
				defer func() { _ = resp.Body.Close() }()

				body, err := io.ReadAll(resp.Body)
				if err != nil {
					errCh <- fmt.Errorf("%s: read body: %w", tc.name, err)
					return
				}
				if resp.StatusCode != tc.wantStatus {
					errCh <- fmt.Errorf("%s: status = %d, want %d (body=%s)", tc.name, resp.StatusCode, tc.wantStatus, body)
					return
				}

				var parsed validateSegmentResponse
				if err := json.Unmarshal(body, &parsed); err != nil {
					errCh <- fmt.Errorf("%s: decode: %w", tc.name, err)
					return
				}
				if !sameStrings(parsed.SkippedModes, tc.wantSkipped) {
					errCh <- fmt.Errorf("%s: skippedModes = %v, want %v", tc.name, parsed.SkippedModes, tc.wantSkipped)
				}
			}(tc)
		}
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Error(err)
	}
}

func TestServerGracefulShutdownCompletesInFlightRequests(t *testing.T) {
	h := &handler{
		validate:     segmentvalidate.ValidateSegment,
		spellChecker: delayedSpellChecker{delay: 200 * time.Millisecond, delegate: stubSpellChecker{}},
	}
	baseURL, srv := startTestServer(t, h)
	client := &http.Client{Timeout: 5 * time.Second}

	const payload = `{"sourceText":"Hello","targetText":"Please recieve the update","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`

	var wg sync.WaitGroup
	var resp *http.Response
	var reqErr error
	wg.Add(1)
	go func() {
		defer wg.Done()
		resp, reqErr = postSegment(client, baseURL, payload)
	}()

	time.Sleep(50 * time.Millisecond)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	require.NoError(t, srv.Shutdown(shutdownCtx), "graceful shutdown must wait for the in-flight request instead of aborting it")

	wg.Wait()
	require.NoError(t, reqErr, "the in-flight request must complete successfully despite the shutdown")
	require.NotNil(t, resp)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, err := client.Post(baseURL+"/v1/validate/segment", "application/json", strings.NewReader(`{}`))
	require.Error(t, err, "the server must refuse new connections once shutdown has completed")
}

func TestServerRequestsNeverLogSegmentText(t *testing.T) {
	buf := captureSlog(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: stubSpellChecker{}}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{Timeout: 5 * time.Second}

	const canary = "CANARY-SECRET-server-integration-8b31"
	payload := fmt.Sprintf(
		`{"sourceText":"Source %s","targetText":"Target %s","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`,
		canary, canary,
	)

	resp, err := postSegment(client, baseURL, payload)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	_, err = io.ReadAll(resp.Body)
	require.NoError(t, err)

	require.NotContains(t, buf.String(), canary, "request and observability logs must never include segment text")
	require.Contains(t, buf.String(), "spelling_duration_ms", "spelling observability fields must be present end-to-end for a real HTTP spelling request")
}
