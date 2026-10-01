package main

import "testing"

func TestMappedImportLocale(t *testing.T) {
	tests := []struct {
		name       string
		raw        string
		configured []string
		mapping    map[string]string
		want       string
		mapped     bool
	}{
		{name: "crowdin English ID", raw: "en", configured: []string{"en-US"}, want: "en-US", mapped: true},
		{name: "crowdin Vietnamese ID", raw: "vi", configured: []string{"en-US", "vi-VN"}, want: "vi-VN", mapped: true},
		{name: "underscore normalization", raw: "en_US", configured: []string{"en-US"}, want: "en-US", mapped: false},
		{name: "exact configured locale", raw: "en-US", configured: []string{"en-US"}, want: "en-US", mapped: false},
		{name: "explicit regional mismatch is rejected", raw: "en-GB", configured: []string{"en-US"}, want: "en-GB", mapped: false},
		{name: "explicit mapping wins", raw: "en", configured: []string{"en-GB", "en-US"}, mapping: map[string]string{"en": "en-GB"}, want: "en-GB", mapped: true},
		{name: "unique regional match", raw: "brand", configured: []string{"brand-voice"}, want: "brand-voice", mapped: true},
		{name: "ambiguous locale rejected", raw: "fr", configured: []string{"fr-CA", "fr-BE"}, want: "fr", mapped: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, mapped := mappedImportLocale(test.raw, test.configured, test.mapping)
			if got != test.want || mapped != test.mapped {
				t.Fatalf("mappedImportLocale() = (%q, %t), want (%q, %t)", got, mapped, test.want, test.mapped)
			}
		})
	}
}

func TestContainsConfiguredLocaleIsCaseInsensitive(t *testing.T) {
	if !containsConfiguredLocale("EN-us", []string{"en-US"}) {
		t.Fatal("expected locale to match case-insensitively")
	}
}

func TestCrowdinTBXLocaleMapsToConfiguredGlossaryLocale(t *testing.T) {
	content := []byte(`<?xml version="1.0"?><tbx><text><body><conceptEntry id="c-1"><langSec xml:lang="en"><termSec id="t-1"><term>Checkout</term></termSec></langSec></conceptEntry></body></text></tbx>`)
	concepts, diagnostics, err := decodeTBX(content)
	if err != nil {
		t.Fatalf("decodeTBX() error = %v", err)
	}
	if len(diagnostics) != 0 {
		t.Fatalf("decodeTBX() diagnostics = %v", diagnostics)
	}
	if len(concepts) != 1 || len(concepts[0].Terms) != 1 {
		t.Fatalf("decodeTBX() concepts = %#v", concepts)
	}
	locale, mapped := mappedImportLocale(concepts[0].Terms[0].Locale, []string{"en-US"}, nil)
	if locale != "en-US" || !mapped {
		t.Fatalf("mapped Crowdin TBX locale = (%q, %t), want (en-US, true)", locale, mapped)
	}
}
