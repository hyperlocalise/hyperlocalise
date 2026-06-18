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
	want := map[string]string{"a.s": "x", "a.arr[0]": "x"}
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

func TestUnmarshalJSONForPathResetsTargetBeforeJSONCRetry(t *testing.T) {
	payload := map[string]any{"stale": "value"}
	err := unmarshalJSONForPath("/tmp/messages.jsonc", []byte(`{
  "first": "one",
  // comment
  "second": "two"
}`), &payload)
	if err != nil {
		t.Fatalf("unmarshal jsonc: %v", err)
	}

	want := map[string]any{"first": "one", "second": "two"}
	if !reflect.DeepEqual(payload, want) {
		t.Fatalf("payload mismatch\nwant: %#v\n got: %#v", want, payload)
	}
}

func TestMarshalJSONTargetPreservesObjectArrayShape(t *testing.T) {
	template := []byte(`{
  "home": {
    "title": "Welcome",
    "steps": [
      {"title": "One", "description": "First"},
      {"title": "Two", "description": "Second"},
      {"title": "Three", "description": "Third"}
    ]
  }
}`)
	values := map[string]string{
		"home.steps[0].title":       "Uno",
		"home.steps[1].description": "Segundo",
	}
	content, err := marshalJSONTarget("/tmp/nested.json", template, values, nil)
	if err != nil {
		t.Fatalf("marshal nested json with arrays: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode nested payload: %v", err)
	}

	home := payload["home"].(map[string]any)
	steps, ok := home["steps"].([]any)
	if !ok {
		t.Fatalf("expected steps array, got %T", home["steps"])
	}
	if len(steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(steps))
	}
	if _, ok := home["steps[0]"]; ok {
		t.Fatalf("expected indexed keys to remain inside steps array")
	}

	first := steps[0].(map[string]any)
	if got := first["title"]; got != "Uno" {
		t.Fatalf("first step title mismatch: %v", got)
	}
	second := steps[1].(map[string]any)
	if got := second["description"]; got != "Segundo" {
		t.Fatalf("second step description mismatch: %v", got)
	}
}

func TestMarshalJSONTargetPrunesArrayStringFields(t *testing.T) {
	template := []byte(`{
  "home": {
    "steps": [
      {"title": "One", "description": "First"},
      {"title": "Two", "description": "Second"},
      {"title": "Three", "description": "Third"}
    ],
    "tags": ["Alpha", "Beta"]
  }
}`)
	values := map[string]string{
		"home.steps[0].title":       "Uno",
		"home.steps[1].description": "Segundo",
	}
	pruneKeys := map[string]struct{}{
		"home.steps[0].title":       {},
		"home.steps[1].description": {},
	}
	content, err := marshalJSONTarget("/tmp/nested.json", template, values, pruneKeys)
	if err != nil {
		t.Fatalf("marshal nested json with array pruning: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode nested payload: %v", err)
	}

	home := payload["home"].(map[string]any)
	steps := home["steps"].([]any)
	if len(steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(steps))
	}

	first := steps[0].(map[string]any)
	if got := first["title"]; got != "Uno" {
		t.Fatalf("first step title mismatch: %v", got)
	}
	if _, ok := first["description"]; ok {
		t.Fatalf("expected first step description to be pruned")
	}

	second := steps[1].(map[string]any)
	if got := second["description"]; got != "Segundo" {
		t.Fatalf("second step description mismatch: %v", got)
	}
	if _, ok := second["title"]; ok {
		t.Fatalf("expected second step title to be pruned")
	}

	third := steps[2].(map[string]any)
	if len(third) != 0 {
		t.Fatalf("expected third step object to be empty after pruning, got %#v", third)
	}

	tags := home["tags"].([]any)
	if len(tags) != 2 {
		t.Fatalf("expected tags array length to be preserved, got %d", len(tags))
	}
	if tags[0] != nil {
		t.Fatalf("expected pruned tags[0] to be nil, got %v", tags[0])
	}
	if tags[1] != nil {
		t.Fatalf("expected pruned tags[1] to be nil, got %v", tags[1])
	}
}

func TestMarshalJSONTargetNestedStringArrayRoundTrip(t *testing.T) {
	template := []byte(`{"rows":[["a","b"],["c"]]}`)
	values := map[string]string{
		"rows[0][0]": "alpha",
		"rows[0][1]": "beta",
		"rows[1][0]": "gamma",
	}
	content, err := marshalJSONTarget("/tmp/nested.json", template, values, nil)
	if err != nil {
		t.Fatalf("marshal nested string arrays: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode nested payload: %v", err)
	}

	rows := payload["rows"].([]any)
	inner := rows[0].([]any)
	if got := inner[0]; got != "alpha" {
		t.Fatalf("rows[0][0] mismatch: %v", got)
	}
	if got := inner[1]; got != "beta" {
		t.Fatalf("rows[0][1] mismatch: %v", got)
	}
	outer := rows[1].([]any)
	if got := outer[0]; got != "gamma" {
		t.Fatalf("rows[1][0] mismatch: %v", got)
	}
}

func TestParseJSONPathNestedArrayIndices(t *testing.T) {
	segments, err := parseJSONPath("rows[0][1]")
	if err != nil {
		t.Fatalf("parse nested array path: %v", err)
	}
	if len(segments) != 2 || segments[0].key != "rows" || segments[0].index == nil || *segments[0].index != 0 {
		t.Fatalf("unexpected first segment: %#v", segments)
	}
	if segments[1].key != "" || segments[1].index == nil || *segments[1].index != 1 {
		t.Fatalf("unexpected second segment: %#v", segments)
	}
}

func TestParseJSONEntriesLenientCollectsArrayStrings(t *testing.T) {
	got, err := parseJSONEntriesLenient("/tmp/messages.json", []byte(`{
  "home": {
    "steps": [
      {"title": "One", "description": "First"},
      {"title": "Two", "description": "Second"}
    ],
    "tags": ["Alpha", "Beta"]
  }
}`))
	if err != nil {
		t.Fatalf("parse lenient arrays: %v", err)
	}

	if got["home.steps[0].title"] != "One" {
		t.Fatalf("unexpected home.steps[0].title: %q", got["home.steps[0].title"])
	}
	if got["home.steps[1].description"] != "Second" {
		t.Fatalf("unexpected home.steps[1].description: %q", got["home.steps[1].description"])
	}
	if got["home.tags[0]"] != "Alpha" {
		t.Fatalf("unexpected home.tags[0]: %q", got["home.tags[0]"])
	}
}

func TestSetNestedValueHandlesArrayIndexedPaths(t *testing.T) {
	payload := map[string]any{
		"home": map[string]any{
			"steps": []any{
				map[string]any{"title": "Old", "description": "First"},
			},
		},
	}

	setNestedValue(payload, "home.steps[0].title", "New title")
	setNestedValue(payload, "home.tags[0]", "Alpha")

	home := payload["home"].(map[string]any)
	steps := home["steps"].([]any)
	first := steps[0].(map[string]any)
	if got := first["title"]; got != "New title" {
		t.Fatalf("step title mismatch: %v", got)
	}
	tags := home["tags"].([]any)
	if got := tags[0]; got != "Alpha" {
		t.Fatalf("tags[0] mismatch: %v", got)
	}
}
