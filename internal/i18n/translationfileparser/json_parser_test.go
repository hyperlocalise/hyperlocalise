package translationfileparser

import "testing"

func TestJSONParserParsesFormatJSDefaultMessageOnly(t *testing.T) {
	content := []byte(`{
  "checkout.submit": {
    "defaultMessage": "Submit order",
    "description": "Checkout submit button"
  },
  "home.title": {
    "defaultMessage": "Welcome",
    "description": "Home page title"
  }
}`)

	got, err := (JSONParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["checkout.submit"] != "Submit order" {
		t.Fatalf("unexpected checkout.submit translation: %q", got["checkout.submit"])
	}
	if got["home.title"] != "Welcome" {
		t.Fatalf("unexpected home.title translation: %q", got["home.title"])
	}
	if _, ok := got["checkout.submit.description"]; ok {
		t.Fatalf("description must not be parsed as translatable entry")
	}
}

func TestJSONParserRejectsFormatJSDefaultMessageNonString(t *testing.T) {
	_, err := (JSONParser{}).Parse([]byte(`{
  "checkout.submit": {
    "defaultMessage": 123,
    "description": "Checkout submit button"
  }
}`))
	if err == nil {
		t.Fatalf("expected invalid FormatJS defaultMessage error")
	}
}

func TestJSONParserMixedShapeFallsBackToStandardJSONFlattening(t *testing.T) {
	content := []byte(`{
  "meta": {
    "defaultMessage": "Do not treat as FormatJS root",
    "note": "still nested data"
  },
  "home": {
    "title": "Welcome"
  }
}`)

	got, err := (JSONParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["meta.defaultMessage"] != "Do not treat as FormatJS root" {
		t.Fatalf("unexpected meta.defaultMessage: %q", got["meta.defaultMessage"])
	}
	if got["meta.note"] != "still nested data" {
		t.Fatalf("unexpected meta.note: %q", got["meta.note"])
	}
	if got["home.title"] != "Welcome" {
		t.Fatalf("unexpected home.title: %q", got["home.title"])
	}
	if _, ok := got["meta"]; ok {
		t.Fatalf("unexpected top-level meta key in flattened output")
	}
}

func TestJSONParserFlattensStringArraysToIndexedKeys(t *testing.T) {
	content := []byte(`{
  "home": {
    "steps": ["One", "Two"],
    "title": "Welcome"
  }
}`)

	got, err := (JSONParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["home.steps[0]"] != "One" {
		t.Fatalf("unexpected home.steps[0]: %q", got["home.steps[0]"])
	}
	if got["home.steps[1]"] != "Two" {
		t.Fatalf("unexpected home.steps[1]: %q", got["home.steps[1]"])
	}
	if got["home.title"] != "Welcome" {
		t.Fatalf("unexpected home.title: %q", got["home.title"])
	}
}

func TestJSONParserFlattensObjectArraysToIndexedKeys(t *testing.T) {
	content := []byte(`{
  "home": {
    "steps": [
      {"title": "One", "description": "First"},
      {"title": "Two", "description": "Second"}
    ]
  }
}`)
	got, err := (JSONParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["home.steps[0].title"] != "One" {
		t.Fatalf("unexpected home.steps[0].title: %q", got["home.steps[0].title"])
	}
	if got["home.steps[0].description"] != "First" {
		t.Fatalf("unexpected home.steps[0].description: %q", got["home.steps[0].description"])
	}
	if got["home.steps[1].title"] != "Two" {
		t.Fatalf("unexpected home.steps[1].title: %q", got["home.steps[1].title"])
	}
	if got["home.steps[1].description"] != "Second" {
		t.Fatalf("unexpected home.steps[1].description: %q", got["home.steps[1].description"])
	}
}

func TestJSONParserRejectsUnsupportedArrayElements(t *testing.T) {
	_, err := (JSONParser{}).Parse([]byte(`{
  "home": {
    "steps": ["One", 2]
  }
}`))
	if err == nil {
		t.Fatalf("expected invalid array element error")
	}
}

func TestMarshalJSONRewritesNestedObjectArrays(t *testing.T) {
	template := []byte(`{
  "home": {
    "steps": [
      {"title": "One", "description": "First"},
      {"title": "Two", "description": "Second"}
    ]
  }
}`)

	got, err := MarshalJSON(template, map[string]string{
		"home.steps[0].title":       "Uno",
		"home.steps[1].description": "Segundo",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	parsed, err := (JSONParser{}).Parse(got)
	if err != nil {
		t.Fatalf("parse marshaled output: %v", err)
	}
	if parsed["home.steps[0].title"] != "Uno" {
		t.Fatalf("unexpected rewritten home.steps[0].title: %q", parsed["home.steps[0].title"])
	}
	if parsed["home.steps[0].description"] != "First" {
		t.Fatalf("unexpected unchanged home.steps[0].description: %q", parsed["home.steps[0].description"])
	}
	if parsed["home.steps[1].title"] != "Two" {
		t.Fatalf("unexpected unchanged home.steps[1].title: %q", parsed["home.steps[1].title"])
	}
	if parsed["home.steps[1].description"] != "Segundo" {
		t.Fatalf("unexpected rewritten home.steps[1].description: %q", parsed["home.steps[1].description"])
	}
}

func TestJSONParserParseWithContextIncludesFormatJSDescriptions(t *testing.T) {
	content := []byte(`{
  "checkout.submit": {
    "defaultMessage": "Submit order",
    "description": "Checkout submit button"
  },
  "home.title": {
    "defaultMessage": "Welcome"
  }
}`)

	messages, contextByKey, err := (JSONParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if messages["checkout.submit"] != "Submit order" {
		t.Fatalf("unexpected checkout.submit translation: %q", messages["checkout.submit"])
	}
	if contextByKey["checkout.submit"] != "Checkout submit button" {
		t.Fatalf("unexpected checkout.submit context: %q", contextByKey["checkout.submit"])
	}
	if _, ok := contextByKey["home.title"]; ok {
		t.Fatalf("did not expect context for home.title")
	}
}
