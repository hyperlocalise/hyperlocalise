package runsvc

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestIsStrictFormatJSTemplate(t *testing.T) {
	if !isStrictFormatJSTemplate(map[string]any{"hello": map[string]any{"defaultMessage": "Hello"}}) {
		t.Fatalf("expected strict formatjs template")
	}
	if isStrictFormatJSTemplate(map[string]any{"hello": "Hello"}) {
		t.Fatalf("did not expect strict formatjs template")
	}
}

func TestMarshalJSONTargetFormatJSPruneAndUpdate(t *testing.T) {
	template := []byte(`{"keep":{"defaultMessage":"Old"},"drop":{"defaultMessage":"Drop"}}`)
	content, err := marshalJSONTarget("/tmp/messages.json", template, map[string]string{"keep": "New", "add": "Added"}, map[string]struct{}{"keep": {}, "add": {}})
	if err != nil {
		t.Fatalf("marshal json formatjs: %v", err)
	}

	var payload map[string]map[string]string
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	if _, ok := payload["drop"]; ok {
		t.Fatalf("expected pruned key drop to be removed")
	}
	if got := payload["keep"]["defaultMessage"]; got != "New" {
		t.Fatalf("keep value mismatch: %q", got)
	}
	if got := payload["add"]["defaultMessage"]; got != "Added" {
		t.Fatalf("add value mismatch: %q", got)
	}
}

func TestMarshalJSONTargetNestedPruneAndUpdate(t *testing.T) {
	template := []byte(`{"home":{"title":"Old","body":"Body"},"meta":1}`)
	values := map[string]string{"home.title": "New", "home.subtitle": "Sub"}
	content, err := marshalJSONTarget("/tmp/nested.json", template, values, map[string]struct{}{"home.title": {}, "home.subtitle": {}})
	if err != nil {
		t.Fatalf("marshal nested json: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode nested payload: %v", err)
	}

	home := payload["home"].(map[string]any)
	if got := home["title"]; got != "New" {
		t.Fatalf("title mismatch: %v", got)
	}
	if got := home["subtitle"]; got != "Sub" {
		t.Fatalf("subtitle mismatch: %v", got)
	}
	if _, ok := home["body"]; ok {
		t.Fatalf("expected body to be pruned")
	}
	if _, ok := payload["meta"]; !ok {
		t.Fatalf("expected non-string key meta to remain")
	}
}

func TestParseJSONEntriesLenient(t *testing.T) {
	got, err := parseJSONEntriesLenient("/tmp/messages.json", []byte(`{"hello":{"defaultMessage":"Bonjour"},"bye":{"defaultMessage":"Salut"}}`))
	if err != nil {
		t.Fatalf("parse lenient formatjs: %v", err)
	}
	want := map[string]string{"hello": "Bonjour", "bye": "Salut"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("formatjs entries mismatch\nwant: %#v\n got: %#v", want, got)
	}

	got, err = parseJSONEntriesLenient("/tmp/messages.json", []byte(`{"app":{"title":"Hello","desc":"World"},"count":1}`))
	if err != nil {
		t.Fatalf("parse lenient nested: %v", err)
	}
	if got["app.title"] != "Hello" || got["app.desc"] != "World" {
		t.Fatalf("nested entries mismatch: %#v", got)
	}
}

func TestParseJSONEntriesLenientIgnoresNonStringLeaves(t *testing.T) {
	got, err := parseJSONEntriesLenient("/tmp/messages.json", []byte(`{"a":{"s":"x","n":1,"b":true,"arr":["x"],"nil":null}}`))
	if err != nil {
		t.Fatalf("parse lenient non-string leaves: %v", err)
	}
	want := map[string]string{"a.s": "x"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch\nwant: %#v\n got: %#v", want, got)
	}
}

func TestSetNestedValueCreatesAndReplacesIntermediateNodes(t *testing.T) {
	payload := map[string]any{"a": "not-an-object"}
	setNestedValue(payload, "a.b.c", "value")
	a := payload["a"].(map[string]any)
	b := a["b"].(map[string]any)
	if got := b["c"]; got != "value" {
		t.Fatalf("nested value mismatch: %v", got)
	}
}

func TestMarshalJSONTargetWithFallback(t *testing.T) {
	svc := newTestService()
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case "/tmp/target.json":
			return []byte("{"), nil // malformed target template
		case "/tmp/source.json":
			return []byte(`{"hello":"Hello"}`), nil
		default:
			return nil, os.ErrNotExist
		}
	}

	content, err := svc.marshalJSONTargetWithFallback("/tmp/target.json", "/tmp/source.json", map[string]string{"hello": "Bonjour"}, nil)
	if err != nil {
		t.Fatalf("marshal with fallback: %v", err)
	}
	if !strings.Contains(string(content), `"hello": "Bonjour"`) {
		t.Fatalf("expected translated value in fallback content: %s", content)
	}
}

func TestMarshalJSONTargetWithFallbackJoinError(t *testing.T) {
	svc := newTestService()
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case "/tmp/target.json", "/tmp/source.json":
			return []byte("{"), nil
		default:
			return nil, os.ErrNotExist
		}
	}

	_, err := svc.marshalJSONTargetWithFallback("/tmp/target.json", "/tmp/source.json", map[string]string{"hello": "Bonjour"}, nil)
	if err == nil {
		t.Fatalf("expected joined fallback error")
	}
	if !strings.Contains(err.Error(), "unexpected end of JSON input") {
		t.Fatalf("expected json syntax error text, got %v", err)
	}
	if !strings.Contains(err.Error(), "fallback template") {
		t.Fatalf("expected fallback template context, got %v", err)
	}
}

func TestMarshalJSONTargetParsesJSONC(t *testing.T) {
	template := []byte(`{
  // Section comment
  "home": {
    "title": "Old",
  },
}`)
	values := map[string]string{"home.title": "New"}
	content, err := marshalJSONTarget("/tmp/messages.jsonc", template, values, map[string]struct{}{"home.title": {}})
	if err != nil {
		t.Fatalf("marshal jsonc: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	home := payload["home"].(map[string]any)
	if got := home["title"]; got != "New" {
		t.Fatalf("title mismatch: %v", got)
	}
}

func TestParseJSONEntriesLenientJSONC(t *testing.T) {
	got, err := parseJSONEntriesLenient("/tmp/messages.jsonc", []byte(`{
  // comments allowed
  "app": {
    "title": "Hello",
  },
}`))
	if err != nil {
		t.Fatalf("parse lenient jsonc: %v", err)
	}
	if got["app.title"] != "Hello" {
		t.Fatalf("nested entries mismatch: %#v", got)
	}
}
