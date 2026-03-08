package translationfileparser

import "testing"

func TestJSONCParserParseWithContextIgnoresDoubleSlashInsideStringValues(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  "homepage": "https://example.com"
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["homepage"] != "https://example.com" {
		t.Fatalf("unexpected homepage message: %q", messages["homepage"])
	}
	if _, ok := contextByKey["homepage"]; ok {
		t.Fatalf("did not expect fabricated context for homepage: %q", contextByKey["homepage"])
	}
}

func TestJSONCParserParseWithContextCombinesPendingAndInlineComments(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  // Detailed description of this key used in the landing page hero section.
  "hero_title": "Welcome" // short hint
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["hero_title"] != "Welcome" {
		t.Fatalf("unexpected hero_title message: %q", messages["hero_title"])
	}

	want := "Detailed description of this key used in the landing page hero section.\nshort hint"
	if contextByKey["hero_title"] != want {
		t.Fatalf("unexpected hero_title context: %q", contextByKey["hero_title"])
	}
}

func TestJSONCParserParseWithContextDoesNotLeakTrailingNestedCommentsToSiblingKey(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  "nested": {
    "inner": "value"
    // orphan comment
  },
  "next_key": "other"
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["next_key"] != "other" {
		t.Fatalf("unexpected next_key message: %q", messages["next_key"])
	}
	if _, ok := contextByKey["next_key"]; ok {
		t.Fatalf("did not expect leaked context for next_key: %q", contextByKey["next_key"])
	}
}

func TestJSONCParserParseWithContextDoesNotLeakSingleLineObjectScopeToSiblingKey(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  "opts": { "a": "b" },
  "title": "Hello" // page title
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["title"] != "Hello" {
		t.Fatalf("unexpected title message: %q", messages["title"])
	}
	if got := contextByKey["title"]; got != "page title" {
		t.Fatalf("unexpected title context: %q", got)
	}
	if _, ok := contextByKey["opts.title"]; ok {
		t.Fatalf("did not expect leaked opts.title context: %q", contextByKey["opts.title"])
	}
}
