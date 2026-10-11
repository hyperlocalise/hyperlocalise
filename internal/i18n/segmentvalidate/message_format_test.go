package segmentvalidate

import "testing"

func TestParseMessageFormat(t *testing.T) {
	tests := map[string]MessageFormat{
		"":         MessageFormatAuto,
		"auto":     MessageFormatAuto,
		"ICU":      MessageFormatICU,
		" i18next": MessageFormatI18next,
		"bogus":    MessageFormatAuto,
	}
	for input, want := range tests {
		if got := ParseMessageFormat(input); got != want {
			t.Errorf("ParseMessageFormat(%q) = %q, want %q", input, got, want)
		}
	}
}

func formatParityFails(format MessageFormat, source, target string) bool {
	checks := ValidateSegment(Request{
		SourceText:    source,
		TargetText:    target,
		SourcePath:    "locales/en.json",
		MessageFormat: format,
	})
	for _, check := range checks {
		if check.Status == StatusFail {
			return true
		}
	}
	return false
}

func TestValidateSegmentMessageFormat(t *testing.T) {
	tests := []struct {
		name   string
		format MessageFormat
		source string
		target string
		fails  bool
	}{
		{"auto flags dropped interpolation", MessageFormatAuto, "Hi {{name}}", "Salut", true},
		{"i18next flags dropped interpolation", MessageFormatI18next, "Hi {{name}}", "Salut", true},
		{"icu keeps interpolation as text", MessageFormatICU, "Hi {{name}}", "Salut {{name}}", false},
		{"icu ignores dropped interpolation", MessageFormatICU, "Hi {{name}}", "Salut", false},
		{"icu flags dropped ICU argument", MessageFormatICU, "Hi {name}", "Salut", true},
		{"auto flags dropped ICU argument", MessageFormatAuto, "Hi {name}", "Salut", true},
		{"i18next treats single braces as text", MessageFormatI18next, "Hi {name}", "Salut", false},
		{"i18next allows unbalanced braces", MessageFormatI18next, "Use { carefully", "Utilisez { prudemment", false},
		{"i18next flags dropped nesting", MessageFormatI18next, "See $t(help.link)", "Voir", true},
		{"icu ignores nesting", MessageFormatICU, "See $t(help.link)", "Voir", false},
		{"icu still checks printf", MessageFormatICU, "Hello %s", "Bonjour", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatParityFails(tt.format, tt.source, tt.target); got != tt.fails {
				t.Fatalf("fails = %v, want %v (checks: %+v)", got, tt.fails, ValidateSegment(Request{
					SourceText: tt.source, TargetText: tt.target, SourcePath: "locales/en.json", MessageFormat: tt.format,
				}))
			}
		})
	}
}
