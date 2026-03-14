package httpserver

import (
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

func TestProjectsRouteReturnsJSON(t *testing.T) {
	t.Parallel()

	cfg := platformconfig.ServiceConfig{
		ServiceName:       "api-gateway",
		Host:              "127.0.0.1",
		Port:              0,
		ReadHeaderTimeout: time.Second,
		ShutdownTimeout:   time.Second,
	}
	logger := observability.Wrap(log.New(testWriter{t: t}, "", 0), "api-gateway")
	server := NewServer(cfg, tmsgrpc.NewStubBackend(), logger)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, openapi.ProjectsPath, http.NoBody)

	server.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload openapi.ProjectListResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(payload.Items) == 0 {
		t.Fatal("expected at least one project")
	}
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Logf("%s", p)

	return len(p), nil
}
