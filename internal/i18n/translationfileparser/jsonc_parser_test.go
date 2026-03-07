package translationfileparser

import "testing"

func TestJSONCParserParsesFormatJSDefaultMessageOnly(t *testing.T) {
	content := []byte(`{
	  // top-level comment
	  "checkout.submit": {
	    "defaultMessage": "Submit order", // inline comment
	    "description": "Checkout submit button"
	  },
	  /* block comment */
	  "home.title": {
	    "defaultMessage": "Welcome",
	    "description": "Home page title"
	  }
	}`)

	got, err := (JSONCParser{}).Parse(content)
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

func TestJSONCParserParsesStandardJSONAfterStrippingComments(t *testing.T) {
	content := []byte(`{
	  // comment before key
	  "meta": {
	    "defaultMessage": "Do not treat as FormatJS root",
	    "note": "still nested data"
	  },
	  "home": {
	    /* comment before nested key */
	    "title": "Welcome"
	  }
	}`)

	got, err := (JSONCParser{}).Parse(content)
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
}

func TestJSONCParserRejectsInvalidShape(t *testing.T) {
	_, err := (JSONCParser{}).Parse([]byte(`{
	  // numeric leaves are still invalid
	  "count": 1
	}`))
	if err == nil {
		t.Fatalf("expected invalid jsonc translation error")
	}
}
