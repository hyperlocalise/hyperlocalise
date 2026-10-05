package translationfileparser

import "testing"

func TestParseCSVLocaleReadsTargetColumn(t *testing.T) {
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")

	got, err := ParseCSVLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse csv locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected fr value: %q", got["hello"])
	}
}

func TestParseCSVLocaleFallsBackWhenColumnMissing(t *testing.T) {
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")

	got, err := ParseCSVLocale(content, "de")
	if err != nil {
		t.Fatalf("parse csv locale: %v", err)
	}
	if got["hello"] != "Hello" {
		t.Fatalf("expected fallback to first value column, got %q", got["hello"])
	}
}

func TestCSVHasLocaleColumn(t *testing.T) {
	has, err := CSVHasLocaleColumn([]byte("key,en,fr\nhello,Hello,Bonjour\n"), " FR ")
	if err != nil {
		t.Fatalf("CSVHasLocaleColumn: %v", err)
	}
	if !has {
		t.Fatalf("expected to find fr column")
	}

	has, err = CSVHasLocaleColumn([]byte("key,en\nhello,Hello\n"), "de")
	if err != nil {
		t.Fatalf("CSVHasLocaleColumn missing: %v", err)
	}
	if has {
		t.Fatalf("did not expect to find de column")
	}

	has, err = CSVHasLocaleColumn([]byte("id,en,Fr\nhello,Hello,Bonjour\n"), "fr")
	if err != nil {
		t.Fatalf("CSVHasLocaleColumn mixed case: %v", err)
	}
	if !has {
		t.Fatalf("expected mixed-case locale header match")
	}
}

func TestCSVHasLocaleColumnEmptyInput(t *testing.T) {
	has, err := CSVHasLocaleColumn(nil, "value")
	if err != nil {
		t.Fatalf("CSVHasLocaleColumn empty input: %v", err)
	}
	if has {
		t.Fatalf("did not expect column match for empty input")
	}
}

func TestStrategyParseWithLocaleReadsCSVTargetLocaleColumn(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")

	got, err := s.ParseWithLocale("translations.csv", content, "fr")
	if err != nil {
		t.Fatalf("parse with locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestParseTSVLocaleReadsTargetColumn(t *testing.T) {
	content := []byte("id\ten\tfr\nhello\tHello\tBonjour\n")

	got, err := ParseTSVLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse tsv locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected fr value: %q", got["hello"])
	}
}

func TestTSVHasLocaleColumn(t *testing.T) {
	has, err := TSVHasLocaleColumn([]byte("key\ten\tfr\nhello\tHello\tBonjour\n"), "FR")
	if err != nil {
		t.Fatalf("TSVHasLocaleColumn: %v", err)
	}
	if !has {
		t.Fatalf("expected to find fr column")
	}
}

func TestStrategyParseWithLocaleReadsTSVTargetLocaleColumn(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("id\ten\tfr\nhello\tHello\tBonjour\n")

	got, err := s.ParseWithLocale("translations.tsv", content, "fr")
	if err != nil {
		t.Fatalf("parse with locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestStrategyParseSourceReadsTSVSourceLocaleWhenNotFirstColumn(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("id\tfr\ten\nhello\tBonjour\tHello\n")

	got, _, err := s.ParseSource("translations.tsv", content, "en")
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	if got["hello"] != "Hello" {
		t.Fatalf("expected English source column, got %q", got["hello"])
	}

	defaultParse, err := s.Parse("translations.tsv", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if defaultParse["hello"] != "Bonjour" {
		t.Fatalf("expected default parser to keep first value column, got %q", defaultParse["hello"])
	}
}
