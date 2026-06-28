package translationfileparser

import "testing"

func TestParseCSVLocaleReadsTargetColumn(t *testing.T) {
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")

	got, err := ParseCSVLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse csv locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestParseCSVLocaleFallsBackWhenColumnMissing(t *testing.T) {
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")

	got, err := ParseCSVLocale(content, "de")
	if err != nil {
		t.Fatalf("parse csv fallback: %v", err)
	}
	if got["hello"] != "Hello" {
		t.Fatalf("unexpected fallback translation: %q", got["hello"])
	}
}

func TestParseCSVLocaleMatchesMixedCaseHeader(t *testing.T) {
	content := []byte("id,en,Fr\nhello,Hello,Bonjour\n")

	got, err := ParseCSVLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse csv mixed case header: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestStrategyParseWithLocaleReadsCSVTargetLocale(t *testing.T) {
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
