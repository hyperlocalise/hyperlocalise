package translationfileparser

import "testing"

func TestPlainTextParserParse(t *testing.T) {
	parser := PlainTextParser{}
	values, err := parser.Parse([]byte("Hello world\n\nSecond paragraph"))
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(values) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(values))
	}
	if values["txt.p0001"] != "Hello world" {
		t.Fatalf("unexpected first paragraph: %q", values["txt.p0001"])
	}
}
