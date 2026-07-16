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
		{"step %i of %d", []string{"%d", "%i"}},
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

func TestReadSpecialCharLiteralEdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantToken string
		wantWidth int
		wantOK    bool
	}{
		{
			name:      "unicode escape",
			input:     `\u00A0`,
			wantToken: `\u00A0`,
			wantWidth: 6,
			wantOK:    true,
		},
		{
			name:      "wide unicode escape",
			input:     `\U0001F600`,
			wantToken: `\U0001F600`,
			wantWidth: 10,
			wantOK:    true,
		},
		{
			name:  "short unicode escape ignored",
			input: `\u123`,
		},
		{
			name:  "malformed unicode escape ignored",
			input: `\u12G4`,
		},
		{
			name:  "short wide unicode escape ignored",
			input: `\U0001F60`,
		},
		{
			name:  "malformed wide unicode escape ignored",
			input: `\U0001F60Z`,
		},
		{
			name:      "one digit hex escape",
			input:     `\x1`,
			wantToken: `\x1`,
			wantWidth: 3,
			wantOK:    true,
		},
		{
			name:      "two digit hex escape stops before next byte",
			input:     `\x1F2`,
			wantToken: `\x1F`,
			wantWidth: 4,
			wantOK:    true,
		},
		{
			name:  "empty hex escape ignored",
			input: `\x`,
		},
		{
			name:  "malformed hex escape ignored",
			input: `\xG1`,
		},
		{
			name:  "non literal backslash ignored",
			input: `\q`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotToken, gotWidth, gotOK := readSpecialCharLiteral(tt.input, 0)
			if gotToken != tt.wantToken || gotWidth != tt.wantWidth || gotOK != tt.wantOK {
				t.Fatalf(
					"readSpecialCharLiteral(%q) = (%q, %d, %t), want (%q, %d, %t)",
					tt.input,
					gotToken,
					gotWidth,
					gotOK,
					tt.wantToken,
					tt.wantWidth,
					tt.wantOK,
				)
			}
		})
	}
}

func TestExtractSpecialCharLiteralsEdgeCases(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []string
	}{
		{
			name:  "empty fast path",
			input: "",
			want:  nil,
		},
		{
			name:  "no backslash fast path",
			input: "Plain text without escaped literals",
			want:  nil,
		},
		{
			name:  "malformed escapes ignored",
			input: `Bad \u12G4 short \u123 wide \U0001F60Z hex \x nope \xG1`,
			want:  nil,
		},
		{
			name:  "duplicates and unicode escapes sorted",
			input: `Emoji \U0001F600 nbsp \u00A0 newline \n again \n byte \x1F`,
			want:  []string{`\U0001F600`, `\n`, `\n`, `\u00A0`, `\x1F`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractSpecialCharLiterals(tt.input)
			if !stringSlicesEqual(got, tt.want) {
				t.Fatalf("extractSpecialCharLiterals(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestValidateSpecialCharParity(t *testing.T) {
	if err := validateSpecialCharParity(`Save\n`, `Enregistrer\n`); err != nil {
		t.Fatalf("expected special char parity pass, got %v", err)
	}
	if err := validateSpecialCharParity(`Save\n`, `Enregistrer`); err == nil {
		t.Fatal("expected missing \\n literal to fail")
	}
	if err := validateSpecialCharParity(`Icon \U0001F600 and \x1F`, `Icône \U0001F600 and \x1F`); err != nil {
		t.Fatalf("expected unicode and hex parity pass, got %v", err)
	}
	if err := validateSpecialCharParity(`Bad \u12G4`, `Mauvais \u1234`); err == nil {
		t.Fatal("expected valid target unicode escape without source counterpart to fail")
	}
	if err := validateSpecialCharParity(`Bad \u12G4`, `Mauvais \u12G4`); err != nil {
		t.Fatalf("expected malformed unicode escapes to be ignored on both sides, got %v", err)
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

	checks = ValidateSegment(Request{
		SourceText: `Smile \U0001F600`,
		TargetText: `Sourire \U0001F60Z`,
		SourcePath: "/messages/en.json",
	})
	if len(checks) != 1 || checks[0].ID != "format-special-char-mismatch" {
		t.Fatalf("expected malformed wide unicode target to fail parity, got %+v", checks)
	}
}
