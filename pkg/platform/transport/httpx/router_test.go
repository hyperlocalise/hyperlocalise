package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewMux(t *testing.T) {
	a, b := NewMux(), NewMux()
	if a == nil || a == b {
		t.Fatal("NewMux must return a new non-nil mux on each call")
	}

	a.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	tests := []struct {
		method string
		path   string
		want   int
	}{
		{http.MethodGet, "/healthz", http.StatusNoContent},
		{http.MethodPost, "/healthz", http.StatusMethodNotAllowed},
		{http.MethodGet, "/missing", http.StatusNotFound},
	}
	for _, tt := range tests {
		rec := httptest.NewRecorder()
		a.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
		if rec.Code != tt.want {
			t.Fatalf("%s %s = %d, want %d", tt.method, tt.path, rec.Code, tt.want)
		}
	}

	rec := httptest.NewRecorder()
	b.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("second mux shares routes: got %d", rec.Code)
	}
}
