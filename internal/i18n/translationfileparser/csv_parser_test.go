package translationfileparser

import (
	"strings"
	"testing"
)

func TestCSVParserParsesKeyValueLayout(t *testing.T) {
	p := CSVParser{}
	got, err := p.Parse([]byte("key,value\nhello,Bonjour\n"))
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected value: %q", got["hello"])
	}
}

func TestCSVParserParsesPerLocaleColumnLayout(t *testing.T) {
	p := CSVParser{KeyColumn: "id", ValueColumn: "fr"}
	got, err := p.Parse([]byte("id,en,fr\nhello,Hello,Bonjour\n"))
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected locale column value: %q", got["hello"])
	}
}

func TestCSVParserDelimiterQuoteAndEscaping(t *testing.T) {
	p := CSVParser{Delimiter: ';'}
	got, err := p.Parse([]byte("key;value\nwelcome;\"He said \"\"Bonjour\"\"\\nAgain\"\n"))
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if got["welcome"] != "He said \"Bonjour\"\\nAgain" {
		t.Fatalf("unexpected escaped value: %q", got["welcome"])
	}
}

func TestCSVParserHandlesBOMPrefixedHeader(t *testing.T) {
	p := CSVParser{KeyColumn: "id", ValueColumn: "fr"}
	got, err := p.Parse([]byte("\ufeffid,en,fr\nhello,Hello,Bonjour\n"))
	if err != nil {
		t.Fatalf("parse csv with bom header: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected value from bom header csv: %q", got["hello"])
	}
}

func TestMarshalCSVPreservesColumnsAndAppendsDeterministically(t *testing.T) {
	template := []byte("key,en,fr\nhello,Hello,Salut\n")
	out, err := MarshalCSV(template, map[string]string{"hello": "Bonjour", "bye": "Au revoir"}, CSVParser{ValueColumn: "fr"})
	if err != nil {
		t.Fatalf("marshal csv: %v", err)
	}
	text := string(out)
	if !strings.Contains(text, "hello,Hello,Bonjour") {
		t.Fatalf("expected existing row update, got %q", text)
	}
	if !strings.Contains(text, "bye,,Au revoir") {
		t.Fatalf("expected deterministic append for new key, got %q", text)
	}
}

func TestMarshalCSVTemplateLargerThanValuesWithExtraKey(t *testing.T) {
	// Template contains key1..key5 (5 keys).
	// Values contains key1 (1 key present in template) + new_key (1 key not present in template).
	// Here len(seen) = 5 and len(values) = 2, so len(seen) > len(values).
	template := []byte("key,value\nkey1,v1\nkey2,v2\nkey3,v3\nkey4,v4\nkey5,v5\n")
	values := map[string]string{
		"key1":    "v1_updated",
		"new_key": "v_new",
	}

	out, err := MarshalCSV(template, values, CSVParser{})
	if err != nil {
		t.Fatalf("marshal csv: %v", err)
	}

	text := string(out)
	if !strings.Contains(text, "key1,v1_updated") {
		t.Errorf("expected key1 update, got %q", text)
	}
	if !strings.Contains(text, "new_key,v_new") {
		t.Errorf("expected new_key append, got %q", text)
	}
}
