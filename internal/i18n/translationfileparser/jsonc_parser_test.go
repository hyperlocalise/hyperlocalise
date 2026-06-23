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

func TestJSONCParserParseWithContextHandlesEscapedQuotedKeys(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  "home": {
    // CTA with a quoted key segment.
    "title\"cta": "Start now"
  }
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages[`home.title"cta`] != "Start now" {
		t.Fatalf("unexpected escaped key message: %q", messages[`home.title"cta`])
	}
	if contextByKey[`home.title"cta`] != "CTA with a quoted key segment." {
		t.Fatalf("unexpected escaped key context: %q", contextByKey[`home.title"cta`])
	}
}

func TestJSONCParserParseWithContextFindsInlineCommentAfterEscapedStringValue(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  "quote": "Open \"https://example.com\"" // Link copy hint.
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["quote"] != `Open "https://example.com"` {
		t.Fatalf("unexpected quote message: %q", messages["quote"])
	}
	if contextByKey["quote"] != "Link copy hint." {
		t.Fatalf("unexpected quote context: %q", contextByKey["quote"])
	}
}

func TestJSONCParserParseWithContextUsesSameLineBlockCommentBeforeKey(t *testing.T) {
	messages, contextByKey, err := (JSONCParser{}).ParseWithContext([]byte(`{
  /* Checkout submit button. */ "checkout_submit": "Submit"
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["checkout_submit"] != "Submit" {
		t.Fatalf("unexpected checkout_submit message: %q", messages["checkout_submit"])
	}
	if contextByKey["checkout_submit"] != "Checkout submit button." {
		t.Fatalf("unexpected checkout_submit context: %q", contextByKey["checkout_submit"])
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
