package lokalise

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestWaitForQueuedProcessSucceedsAfterPreProcessing(t *testing.T) {
	oldInterval := lokaliseQueuedProcessPollInterval
	lokaliseQueuedProcessPollInterval = time.Millisecond
	t.Cleanup(func() { lokaliseQueuedProcessPollInterval = oldInterval })

	var calls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1:main/processes/proc-1", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s", r.Method)
		}
		n := calls.Add(1)
		status := "pre_processing"
		if n >= 2 {
			status = "finished"
		}
		writeLokaliseJSON(t, w, map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"type":       "file-import",
				"status":     status,
			},
		})
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	result, err := client.WaitForQueuedProcess(context.Background(), QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
		Branch:    "main",
	})
	if err != nil {
		t.Fatalf("WaitForQueuedProcess: %v", err)
	}
	if result.Status != "finished" || result.ProcessID != "proc-1" {
		t.Fatalf("result = %#v", result)
	}
	if calls.Load() < 2 {
		t.Fatalf("calls = %d, want at least 2", calls.Load())
	}
}

func TestWaitForQueuedProcessFinishedWithEmptyDetails(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/processes/proc-1", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"type":       "file-import",
				"status":     "finished",
			},
		})
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	result, err := client.WaitForQueuedProcess(context.Background(), QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
	})
	if err != nil {
		t.Fatalf("WaitForQueuedProcess: %v", err)
	}
	if result.Status != "finished" {
		t.Fatalf("result = %#v", result)
	}
}

func TestWaitForQueuedProcessFailsOnFailedStatus(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/processes/proc-1", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"status":     "failed",
				"message":    "import failed",
			},
		})
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	result, err := client.WaitForQueuedProcess(context.Background(), QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
	})
	if err == nil || !strings.Contains(err.Error(), "status=failed") {
		t.Fatalf("error = %v, want failed", err)
	}
	if result.ProcessID != "proc-1" {
		t.Fatalf("result = %#v, want process id kept", result)
	}
}

func TestWaitForQueuedProcessFailsClosedOnUnknownStatus(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/processes/proc-1", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"status":     "mystery",
			},
		})
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	_, err := client.WaitForQueuedProcess(context.Background(), QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
	})
	if err == nil || !strings.Contains(err.Error(), "unknown status") {
		t.Fatalf("error = %v, want unknown status", err)
	}
}

func TestWaitForQueuedProcessTimeoutKeepsProcessID(t *testing.T) {
	oldInterval := lokaliseQueuedProcessPollInterval
	lokaliseQueuedProcessPollInterval = 20 * time.Millisecond
	t.Cleanup(func() { lokaliseQueuedProcessPollInterval = oldInterval })

	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/processes/proc-1", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"status":     "running",
			},
		})
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	result, err := client.WaitForQueuedProcess(ctx, QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
	})
	if err == nil || !strings.Contains(err.Error(), "wait timed out") || !strings.Contains(err.Error(), "proc-1") {
		t.Fatalf("error = %v, want timeout with process id", err)
	}
	if result.ProcessID != "proc-1" {
		t.Fatalf("result = %#v, want process id kept", result)
	}
}

func TestWaitForQueuedProcessDoesNotRequireDetailsCounts(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/processes/proc-1", func(w http.ResponseWriter, _ *http.Request) {
		payload := map[string]any{
			"process": map[string]any{
				"process_id": "proc-1",
				"status":     "finished",
				"details": map[string]any{
					"files": []any{
						map[string]any{"status": "finished", "key_count_skipped": 1},
					},
				},
			},
		}
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			t.Fatalf("encode: %v", err)
		}
	})
	client, teardown := newQueuedProcessClient(t, mux)
	defer teardown()

	if _, err := client.WaitForQueuedProcess(context.Background(), QueuedProcessWaitInput{
		ProjectID: "proj-1",
		ProcessID: "proc-1",
	}); err != nil {
		t.Fatalf("skipped keys must not fail: %v", err)
	}
}

func newQueuedProcessClient(t *testing.T, mux *http.ServeMux) (*HTTPClient, func()) {
	t.Helper()
	srv := httptest.NewServer(mux)
	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	return client, srv.Close
}
