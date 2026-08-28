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

func (m mockSessionVerifier) Verify(_ context.Context, _ string) (AuthClaims, error) {
	if m.err != nil {
		return AuthClaims{}, m.err
	}
	return m.claims, nil
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

func TestValidateSegmentSpellingDiscardsIssuesOnSuccess(t *testing.T) {
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
	require.Len(t, resp.Checks, 1, "spelling issues must not be surfaced as checks in this contract")
	require.Empty(t, resp.SkippedModes, "a successful check must not be reported as skipped, even with issues found")
	require.Equal(t, "fr-FR", fake.receivedLocale)
	require.Equal(t, spellcheck.Tokenize(targetText), fake.receivedWords)
}

func TestValidateSegmentSpellingUnexpectedProviderErrorReturns500(t *testing.T) {
	fake := &fakeSpellChecker{err: errors.New("provider exploded")}
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: fake}
	mux := newAuthedValidateSegmentMux(h)

	payload := `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/en.json","modes":["spelling"],"targetLocale":"fr-FR"}`
	rec := postValidateSegment(mux, payload)

	require.Equal(t, http.StatusInternalServerError, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "internal_error", body["error"])
}
