package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
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
