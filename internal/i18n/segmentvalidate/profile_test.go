package segmentvalidate

import "testing"

func TestExtractExtraPlaceholders(t *testing.T) {
	tests := []struct {
		text string
		want []string
	}{
		{"Hello %s", []string{"%s"}},
		{"%s and %s", []string{"%s", "%s"}},
		{"Item %1$d of %2$d", []string{"%1$d", "%2$d"}},
		{"Hello %(name)s", []string{"%(name)s"}},
		{"Path ${HOME}/file", []string{"${HOME}"}},
		{"Wrap $token$ here", []string{"$token$"}},
		{"Hello {name}", nil},
		{"step %i of %d", []string{"%d"}},
	}
	for _, tt := range tests {
		got := extractExtraPlaceholders(tt.text)
		if !stringSlicesEqual(got, tt.want) {
			t.Fatalf("extractExtraPlaceholders(%q) = %v, want %v", tt.text, got, tt.want)
		}
	}
}

func TestValidateExtraPlaceholderParity(t *testing.T) {
	if err := validateExtraPlaceholderParity("Hello %s", "Bonjour %s"); err != nil {
		t.Fatalf("expected parity pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Hello %s", "Bonjour"); err == nil {
		t.Fatal("expected missing placeholder to fail")
	}
	if err := validateExtraPlaceholderParity("%s %s", "%s"); err == nil {
		t.Fatal("expected missing duplicate placeholder to fail")
	}
	if err := validateExtraPlaceholderParity("%s %s", "%s %s"); err != nil {
		t.Fatalf("expected duplicate placeholder parity pass, got %v", err)
	}
}

func TestValidateWhitespaceProfile(t *testing.T) {
	if err := validateWhitespaceProfile(" Hello ", " Bonjour "); err != nil {
		t.Fatalf("expected matching edge whitespace, got %v", err)
	}
	if err := validateWhitespaceProfile(" Hello ", "Bonjour "); err == nil {
		t.Fatal("expected leading whitespace mismatch")
	}
	if err := validateWhitespaceProfile("Hello&nbsp;world", "Hello world"); err == nil {
		t.Fatal("expected nbsp count mismatch")
	}
	if err := validateWhitespaceProfile("Hello\t", "Hello\t"); err != nil {
		t.Fatalf("expected trailing tab parity, got %v", err)
	}
}

func TestExtractSpecialCharLiterals(t *testing.T) {
	got := extractSpecialCharLiterals(`Line1\nLine2\tTab\r\nEnd \u00A0 \x1F`)
	want := []string{`\n`, `\r\n`, `\t`, `\u00A0`, `\x1F`}
	if !stringSlicesEqual(got, want) {
		t.Fatalf("extractSpecialCharLiterals() = %v, want %v", got, want)
	}
}

func TestValidateSpecialCharParity(t *testing.T) {
	if err := validateSpecialCharParity(`Save\n`, `Enregistrer\n`); err != nil {
		t.Fatalf("expected special char parity pass, got %v", err)
	}
	if err := validateSpecialCharParity(`Save\n`, `Enregistrer`); err == nil {
		t.Fatal("expected missing \\n literal to fail")
	}
}

func TestValidateProfileParityInSegmentValidation(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: " Hello %s ",
		TargetText: " Bonjour %s ",
		SourcePath: "/messages/en.json",
	})
	if len(checks) != 1 || checks[0].Status != StatusPass {
		t.Fatalf("expected pass, got %+v", checks)
	}

	checks = ValidateSegment(Request{
		SourceText: " Hello %s ",
		TargetText: "Bonjour %s",
		SourcePath: "/messages/en.json",
	})
	if len(checks) != 1 || checks[0].ID != "format-whitespace-profile" {
		t.Fatalf("expected whitespace profile failure, got %+v", checks)
	}

	checks = ValidateSegment(Request{
		SourceText: `Path C:\tmp\n`,
		TargetText: `Chemin C:\tmp`,
		SourcePath: "/messages/en.json",
	})
	if len(checks) != 1 || checks[0].ID != "format-special-char-mismatch" {
		t.Fatalf("expected special char failure, got %+v", checks)
	}
}
