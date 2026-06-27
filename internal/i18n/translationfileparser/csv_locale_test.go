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
