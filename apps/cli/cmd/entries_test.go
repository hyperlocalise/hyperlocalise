package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestEntriesCommandOutputsParsedEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "en.json")
	if err := os.WriteFile(path, []byte(`{"title":"Hello","nested":{"cta":"Click"}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", path})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if payload["title"] != "Hello" || payload["nested.cta"] != "Click" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}
