package poeditor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDebugWritesLogFileWhenEnabled(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), ".hyperlocalise", "logs", "poeditor.log")
	t.Setenv("DEBUG", "1")
	t.Setenv("HYPERLOCALISE_POEDITOR_DEBUG_FILE", logPath)

	debug("adapter", "push_start", map[string]any{
		"project_id": "123",
		"api_token":  "secret",
	})

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read debug log: %v", err)
	}
	text := string(data)
	if !strings.Contains(text, `"component":"adapter"`) {
		t.Fatalf("expected component in log, got %s", text)
	}
	if !strings.Contains(text, `"event":"push_start"`) {
		t.Fatalf("expected event in log, got %s", text)
	}
}

func TestSanitizeValuesRedactsToken(t *testing.T) {
	values := sanitizeValues(map[string][]string{
		"api_token": {"secret"},
		"id":        {"123"},
		"data":      {"payload"},
	})
	if got := values["api_token"]; got != "[redacted]" {
		t.Fatalf("expected token redacted, got %#v", got)
	}
	if got := values["id"]; got != "123" {
		t.Fatalf("expected id preserved, got %#v", got)
	}
}
