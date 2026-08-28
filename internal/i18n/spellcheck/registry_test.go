package spellcheck

import (
	"errors"
	"slices"
	"testing"
)

func TestRegistryResolve(t *testing.T) {
	tests := []struct {
		name   string
		locale string
		want   DictionaryFiles
	}{
		{
			name:   "supported locale with a non-obvious filename (not locale.replace('-', '_'))",
			locale: "de-DE",
			want:   DictionaryFiles{AffFile: "de_DE_frami.aff", DicFile: "de_DE_frami.dic"},
		},
		{
			name:   "supported locale with a non-obvious filename in a nested upstream path",
			locale: "fr-FR",
			want:   DictionaryFiles{AffFile: "fr.aff", DicFile: "fr.dic"},
		},
		{
			name:   "supported locale with an unrelated sibling variant in the same upstream folder",
			locale: "sv-SE",
			want:   DictionaryFiles{AffFile: "sv_SE.aff", DicFile: "sv_SE.dic"},
		},
		{
			name:   "supported locale, derived filename happens to match the pattern",
			locale: "pt-BR",
			want:   DictionaryFiles{AffFile: "pt_BR.aff", DicFile: "pt_BR.dic"},
		},
	}

	r := LoadRegistry()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Resolve(tt.locale)
			if err != nil {
				t.Fatalf("Resolve(%q) error = %v, want nil", tt.locale, err)
			}
			if got != tt.want {
				t.Errorf("Resolve(%q) = %+v, want %+v", tt.locale, got, tt.want)
			}
		})
	}
}

func TestRegistryResolveUnsupportedLocale(t *testing.T) {
	tests := []struct {
		name   string
		locale string
	}{
		{name: "documented unsupported: no exact dictionary from any authoritative source", locale: "en-SG"},
		{name: "documented unsupported: no exact dictionary, not silently mapped to fr-FR", locale: "fr-CA"},
		{name: "documented unsupported: no whitespace word boundaries", locale: "ja-JP"},
		{name: "documented unsupported: requires word segmentation the architecture lacks", locale: "th-TH"},
		{name: "documented unsupported: no acceptable reproducible upstream source", locale: "tl-PH"},
		{name: "missing: empty locale string", locale: ""},
		{name: "missing: well-formed but entirely unknown locale", locale: "xx-XX"},
		{name: "missing: base language alone, without a region", locale: "en"},
		{name: "missing: base language alone, without a region", locale: "fr"},
		{name: "missing: case variant is not folded to the registered casing", locale: "en-us"},
		{name: "missing: garbage input", locale: "???"},
	}

	r := LoadRegistry()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := r.Resolve(tt.locale)
			if !errors.Is(err, ErrUnsupportedLocale) {
				t.Fatalf("Resolve(%q) error = %v, want error wrapping ErrUnsupportedLocale", tt.locale, err)
			}
		})
	}
}

func TestRegistryNoFallbackBetweenVariants(t *testing.T) {
	tests := []struct {
		name              string
		supportedVariant  string
		unsupportedSubset string
	}{
		{name: "English: en-GB is supported but en-SG is not", supportedVariant: "en-GB", unsupportedSubset: "en-SG"},
		{name: "French: fr-FR is supported but fr-CA is not", supportedVariant: "fr-FR", unsupportedSubset: "fr-CA"},
	}

	r := LoadRegistry()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := r.Resolve(tt.supportedVariant); err != nil {
				t.Fatalf("Resolve(%q) error = %v, want nil (expected to be supported)", tt.supportedVariant, err)
			}
			if _, err := r.Resolve(tt.unsupportedSubset); !errors.Is(err, ErrUnsupportedLocale) {
				t.Fatalf("Resolve(%q) error = %v, want error wrapping ErrUnsupportedLocale (must not fall back to %q)", tt.unsupportedSubset, err, tt.supportedVariant)
			}
		})
	}
}

func TestRegistrySupportedLocalesIsSortedAndComplete(t *testing.T) {
	r := LoadRegistry()
	got := r.SupportedLocales()

	if len(got) != len(supportedDictionaries) {
		t.Fatalf("SupportedLocales() returned %d locale(s), want %d", len(got), len(supportedDictionaries))
	}
	if !slices.IsSorted(got) {
		t.Errorf("SupportedLocales() = %v, want sorted", got)
	}
	for _, locale := range got {
		if _, ok := supportedDictionaries[locale]; !ok {
			t.Errorf("SupportedLocales() contains %q, which is not in supportedDictionaries", locale)
		}
	}
}

func TestNewRegistryIsIndependentOfCallerMap(t *testing.T) {
	source := map[string]DictionaryFiles{
		"xx-YY": {AffFile: "xx_YY.aff", DicFile: "xx_YY.dic"},
	}
	r := NewRegistry(source)

	source["xx-YY"] = DictionaryFiles{AffFile: "mutated.aff", DicFile: "mutated.dic"}
	source["zz-WW"] = DictionaryFiles{AffFile: "zz_WW.aff", DicFile: "zz_WW.dic"}

	got, err := r.Resolve("xx-YY")
	if err != nil {
		t.Fatalf("Resolve(%q) error = %v, want nil", "xx-YY", err)
	}
	want := DictionaryFiles{AffFile: "xx_YY.aff", DicFile: "xx_YY.dic"}
	if got != want {
		t.Errorf("Resolve(%q) = %+v, want %+v (NewRegistry must copy its input)", "xx-YY", got, want)
	}

	if _, err := r.Resolve("zz-WW"); !errors.Is(err, ErrUnsupportedLocale) {
		t.Errorf("Resolve(%q) error = %v, want error wrapping ErrUnsupportedLocale (registry must not observe later mutations to the source map)", "zz-WW", err)
	}
}
