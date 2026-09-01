package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

type mockSessionVerifier struct {
	claims AuthClaims
	err    error
}

func (m mockSessionVerifier) Verify(_ context.Context, _ string) (SessionResult, error) {
	if m.err != nil {
		return SessionResult{}, m.err
	}
	return SessionResult{Claims: m.claims}, nil
}

func TestHealth(t *testing.T) {
	h := newHandler()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)

	h.health(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}

func TestValidateSegmentUnauthorized(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	mux.Handle("POST /v1/validate/segment", authMiddleware(mockSessionVerifier{err: context.Canceled})(http.HandlerFunc(h.validateSegment)))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(`{}`))
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "unauthorized", body["error"])
}

func TestRegisterRoutesServesStrippedPaths(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})
	handler := withOptionalPrefix(publicPathPrefix, mux)

	for _, path := range []string{"/health", publicPathPrefix + "/health"} {
		healthRec := httptest.NewRecorder()
		healthReq := httptest.NewRequest(http.MethodGet, path, nil)
		handler.ServeHTTP(healthRec, healthReq)
		require.Equal(t, http.StatusOK, healthRec.Code, path)
		require.JSONEq(t, `{"status":"ok"}`, healthRec.Body.String())
	}

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json"}`
	for _, path := range []string{"/v1/validate/segment", publicPathPrefix + "/v1/validate/segment"} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(payload))
		req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
		handler.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, path)
	}
}

func TestValidateSegmentSuccess(t *testing.T) {
	h := &handler{
		validate: func(req segmentvalidate.Request) []segmentvalidate.Check {
			require.Equal(t, "Hello {name}", req.SourceText)
			require.Equal(t, "Bonjour {name}", req.TargetText)
			require.Equal(t, "/messages/en.json", req.SourcePath)
			return []segmentvalidate.Check{
				{
					ID:      "format-parity",
					Label:   "Placeholders & ICU",
					Status:  segmentvalidate.StatusPass,
					Message: "Target keeps the required placeholders and ICU structure.",
				},
			}
		},
		spellChecker: NoopSpellChecker{},
	}

	mux := http.NewServeMux()
	mux.Handle(
		"POST /v1/validate/segment",
		authMiddleware(mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(h.validateSegment)),
	)

	payload := `{"sourceText":"Hello {name}","targetText":"Bonjour {name}","sourcePath":"/messages/en.json"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(payload))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1)
	require.Equal(t, "format-parity", resp.Checks[0].ID)
	require.Equal(t, segmentvalidate.StatusPass, resp.Checks[0].Status)
}

func TestValidateSegmentWithQAModes(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	mux.Handle(
		"POST /v1/validate/segment",
		authMiddleware(mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(h.validateSegment)),
	)

	payload := `{"sourceText":"Hello","targetText":"Hello","sourcePath":"/messages/en.json","modes":["same_as_source"]}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(payload))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 2)
	require.Equal(t, "qa-same-as-source", resp.Checks[1].ID)
	require.Equal(t, segmentvalidate.StatusWarn, resp.Checks[1].Status)
}

func TestValidateSegmentInvalidJSON(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	mux.Handle(
		"POST /v1/validate/segment",
		authMiddleware(mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(h.validateSegment)),
	)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(`{`))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestValidateSegmentBodyTooLarge(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	mux.Handle(
		"POST /v1/validate/segment",
		authMiddleware(mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(h.validateSegment)),
	)

	padding := strings.Repeat("x", maxValidateSegmentBodyBytes+1)
	payload := `{"sourceText":"` + padding + `","targetText":"y","sourcePath":"/messages/en.json"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(payload))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "payload_too_large", body["error"])
}

func newAuthedValidateSegmentMux(h *handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle(
		"POST /v1/validate/segment",
		authMiddleware(mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(h.validateSegment)),
	)
	return mux
}

func postValidateSegment(mux *http.ServeMux, payload string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", bytes.NewBufferString(payload))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "test-session"})
	mux.ServeHTTP(rec, req)
	return rec
}

func TestValidateSegmentResponseOmitsSkippedModesWithoutSpelling(t *testing.T) {
	mux := newAuthedValidateSegmentMux(newHandler())

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var raw map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &raw))
	_, present := raw["skippedModes"]
	require.False(t, present, "skippedModes must be omitted from the wire format when spelling is not requested")
}

func TestValidateSegmentIgnoresTargetLocaleWithoutSpelling(t *testing.T) {
	mux := newAuthedValidateSegmentMux(newHandler())

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","targetLocale":"???"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestValidateSegmentSpellingRequiresTargetLocale(t *testing.T) {
	mux := newAuthedValidateSegmentMux(newHandler())

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"]}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "bad_request", body["error"])
}

func TestValidateSegmentSpellingRejectsMalformedTargetLocale(t *testing.T) {
	mux := newAuthedValidateSegmentMux(newHandler())

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"???"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "bad_request", body["error"])
}

func TestValidateSegmentSpellingSkippedWhenProviderUnavailable(t *testing.T) {
	mux := newAuthedValidateSegmentMux(newHandler())

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1)
	require.Equal(t, "format-parity", resp.Checks[0].ID)
	require.Equal(t, []string{"spelling"}, resp.SkippedModes)
}

func TestValidateSegmentSpellingSkippedWhenLocaleUnsupported(t *testing.T) {
	fake := &fakeSpellChecker{err: fmt.Errorf("%w: %q", spellcheck.ErrUnsupportedLocale, "en-CA")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"en-CA"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1)
	require.Equal(t, []string{"spelling"}, resp.SkippedModes)
}

func TestValidateSegmentSpellingSucceedsWithoutSkip(t *testing.T) {
	fake := &fakeSpellChecker{}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1)
	require.Empty(t, resp.SkippedModes)
	require.Equal(t, "fr-FR", fake.receivedLocale)
}

func TestValidateSegmentSpellingSurfacesIssuesAsWarnings(t *testing.T) {
	fake := &fakeSpellChecker{
		issues: []SpellingIssue{{Word: "recieve", Suggestions: []string{"receive"}}},
	}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	targetText := "Please recieve the update"
	payload := `{"sourceText":"Hello","targetText":"Please recieve the update","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 2, "spelling issues must be surfaced as an additional warning check")
	require.Equal(t, "format-parity", resp.Checks[0].ID)
	spelling := resp.Checks[1]
	require.Equal(t, "spelling-recieve", spelling.ID, "each spelling warning needs a stable per-word ID so the frontend doesn't produce duplicate React keys")
	require.Equal(t, QA_MODE_SPELLING, spelling.Category)
	require.Equal(t, segmentvalidate.StatusWarn, spelling.Status, "spelling issues are warnings, not failures")
	require.Equal(t, []string{"recieve", "receive"}, spelling.RelatedTokens)
	require.Empty(t, resp.SkippedModes, "a successful check must not be reported as skipped")
	require.Equal(t, "fr-FR", fake.receivedLocale)
	require.Equal(t, spellcheck.Tokenize(targetText), fake.receivedWords, "only target text reaches the provider")
}

func TestValidateSegmentSpellingUnexpectedProviderErrorPreservesFormatChecks(t *testing.T) {
	fake := &fakeSpellChecker{err: errors.New("provider exploded")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code, "an unexpected provider error must not erase format/QA results")

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1)
	require.Equal(t, "format-parity", resp.Checks[0].ID)
	require.Equal(t, []string{QA_MODE_SPELLING}, resp.SkippedModes)
}

func TestValidateSegmentSpellingCancellationWritesNoResponse(t *testing.T) {
	fake := &fakeSpellChecker{err: context.Canceled}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Zero(t, rec.Body.Len(), "a canceled request must not receive a success body")
	require.Empty(t, rec.Header().Get("Content-Type"), "a canceled request must not receive a JSON response")
}

func TestValidateSegmentSpellingDeadlineExceededWritesNoResponse(t *testing.T) {
	fake := &fakeSpellChecker{err: context.DeadlineExceeded}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Zero(t, rec.Body.Len(), "a timed-out request must not receive a success body")
	require.Empty(t, rec.Header().Get("Content-Type"), "a timed-out request must not receive a JSON response")
}

func TestValidateSegmentSpellingCapsIssuesAndSuggestions(t *testing.T) {
	issues := make([]SpellingIssue, 0, 7)
	for i := 1; i <= 7; i++ {
		issues = append(issues, SpellingIssue{
			Word:        fmt.Sprintf("word%d", i),
			Suggestions: []string{"s1", "s2", "s3", "s4", "s5"},
		})
	}
	fake := &fakeSpellChecker{issues: issues}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp validateSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Checks, 1+maxSpellingIssues, "must cap at 5 unique misspellings")

	spellingChecks := resp.Checks[1:]
	var gotWords []string
	seenIDs := make(map[string]bool, len(spellingChecks))
	for _, check := range spellingChecks {
		require.Len(t, check.RelatedTokens, 1+maxSpellingSuggestions, "must cap at 3 suggestions per word")
		require.False(t, seenIDs[check.ID], "each spelling warning must have a unique ID to avoid duplicate React keys on the frontend")
		seenIDs[check.ID] = true
		gotWords = append(gotWords, check.RelatedTokens[0])
	}
	require.Equal(t, []string{"word1", "word2", "word3", "word4", "word5"}, gotWords, "must preserve first-seen order")
}
