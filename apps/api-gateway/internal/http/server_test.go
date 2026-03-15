package httpserver

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
	"github.com/quiet-circles/hyperlocalise/pkg/client/tmsgrpc"
	platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"
	"github.com/quiet-circles/hyperlocalise/pkg/platform/observability"
)

func TestCreateTranslationJobReturnsAccepted(t *testing.T) {
	t.Parallel()

	server := newTestServer(t)
	payload := openapi.CreateTranslationJobRequest{
		ProjectID:    "proj_demo",
		SourceLocale: "en",
		TargetLocale: "fr",
		InlinePayload: &openapi.TranslationInlinePayload{
			Items: []openapi.TranslationInlineItem{
				{Key: "hero.title", Text: "Hello world"},
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, openapi.TranslationJobsPath, bytes.NewReader(body))
	recorder := httptest.NewRecorder()

	server.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recorder.Code)
	}

	var job openapi.TranslationJob
	if err := json.Unmarshal(recorder.Body.Bytes(), &job); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if job.ProjectID != "proj_demo" {
		t.Fatalf("expected projectId proj_demo, got %q", job.ProjectID)
	}
	if job.Mode != "inline" {
		t.Fatalf("expected mode inline, got %q", job.Mode)
	}
}

func TestGetTranslationJobByID(t *testing.T) {
	t.Parallel()

	server := newTestServer(t)
	createBody := `{"projectId":"proj_demo","sourceLocale":"en","targetLocale":"de","inlinePayload":{"items":[{"key":"hero.title","text":"Hello"}]}}`
	createReq := httptest.NewRequest(http.MethodPost, openapi.TranslationJobsPath, bytes.NewBufferString(createBody))
	createResp := httptest.NewRecorder()
	server.httpServer.Handler.ServeHTTP(createResp, createReq)

	var created openapi.TranslationJob
	if err := json.Unmarshal(createResp.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, openapi.TranslationJobsPath+"/"+created.ID, http.NoBody)
	recorder := httptest.NewRecorder()
	server.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestCreateTranslationJobValidationErrorReturnsBadRequest(t *testing.T) {
	t.Parallel()

	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, openapi.TranslationJobsPath, bytes.NewBufferString(`{"sourceLocale":"en","targetLocale":"fr"}`))
	recorder := httptest.NewRecorder()

	server.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func newTestServer(t *testing.T) *Server {
	t.Helper()

	cfg := platformconfig.ServiceConfig{
		ServiceName:       "api-gateway",
		Host:              "127.0.0.1",
		Port:              0,
		ReadHeaderTimeout: time.Second,
		ShutdownTimeout:   time.Second,
	}
	logger := observability.Wrap(log.New(testWriter{t: t}, "", 0), "api-gateway")
	return NewServer(cfg, tmsgrpc.NewStubBackend(), logger)
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Logf("%s", p)

	return len(p), nil
}
