package segmentvalidate

import (
	"testing"
)

// Coverage for Bolt #1837: dual-string fast-paths and match-sized slice sizing
// when signal characters (%/$/\) appear without real placeholders or escapes.

func TestExtractExtraPlaceholdersLiteralMarkers(t *testing.T) {
	tests := []struct {
		name string
		text string
		want []string
	}{
		{
			name: "percent off has signal but no placeholder",
			text: "Save 50% off today",
			want: nil,
		},
		{
			name: "currency dollar has signal but no placeholder",
			text: "Only $5 today",
			want: nil,
		},
		{
			name: "many literal percents still yield no matches",
			text: "%%%% % % % 100% complete",
			want: nil,
		},
		{
			name: "literal markers mixed with a real placeholder",
			text: "Save 50% with code %s",
			want: []string{"%s"},
		},
		{
			name: "dollar amount then shell-style placeholder",
			text: "Pay $5 then use ${coupon}",
			want: []string{"${coupon}"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractExtraPlaceholders(tt.text)
			if !stringSlicesEqual(got, tt.want) {
				t.Fatalf("extractExtraPlaceholders(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}

func TestValidateExtraPlaceholderParityDualStringFastPath(t *testing.T) {
	if err := validateExtraPlaceholderParity("Hello world", "Bonjour le monde"); err != nil {
		t.Fatalf("plain text without %%/$ should pass dual-string fast-path, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Save 50% off", "Économisez 50%"); err != nil {
		t.Fatalf("literal percent-only text should pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Only $5", "Seulement $5"); err != nil {
		t.Fatalf("literal dollar-only text should pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Hello %s", "Bonjour"); err == nil {
		t.Fatal("expected real placeholder missing from target to fail")
	}
	if err := validateExtraPlaceholderParity("Save 50%", "Économisez %s"); err == nil {
		t.Fatal("expected literal percent vs real placeholder mismatch to fail")
	}
}

func TestValidateSpecialCharParityDualStringFastPath(t *testing.T) {
	if err := validateSpecialCharParity("Hello world", "Bonjour le monde"); err != nil {
		t.Fatalf("plain text without backslash should pass dual-string fast-path, got %v", err)
	}
	if err := validateSpecialCharParity(`Save\n`, `Enregistrer\n`); err != nil {
		t.Fatalf("matching escaped literals should pass, got %v", err)
	}
	if err := validateSpecialCharParity(`Save\n`, "Enregistrer"); err == nil {
		t.Fatal("expected missing escaped literal on target to fail")
	}
	// One side has a backslash signal but no valid escape token; treat as empty on both.
	if err := validateSpecialCharParity(`Bad \u12G4`, `Aussi mauvais`); err != nil {
		t.Fatalf("malformed escapes ignored on both sides should pass, got %v", err)
	}
}
