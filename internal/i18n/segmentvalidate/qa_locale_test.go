package segmentvalidate

import (
	"slices"
	"strings"
	"testing"
)

func TestNumeralSequence(t *testing.T) {
	tests := []struct {
		name   string
		value  string
		want   string
		wantOK bool
	}{
		{name: "empty", value: "", want: "", wantOK: true},
		{name: "no digits", value: "Hello world", want: "", wantOK: true},
		{name: "ascii digits", value: "Order 42 of 7", want: "427", wantOK: true},
		{name: "arabic-indic", value: "٤٢", want: "42", wantOK: true},
		{name: "extended arabic-indic", value: "۱۹", want: "19", wantOK: true},
		{name: "devanagari", value: "१०", want: "10", wantOK: true},
		{name: "thai", value: "๓", want: "3", wantOK: true},
		{name: "fullwidth", value: "２０２６", want: "2026", wantOK: true},
		{name: "mixed systems", value: "1 ٢ ３", want: "123", wantOK: true},
		// U+1810 MONGOLIAN DIGIT ZERO is a Unicode digit outside digitZeros.
		{name: "unsupported system", value: "1᠐", want: "", wantOK: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := numeralSequence(tt.value)
			if ok != tt.wantOK {
				t.Fatalf("numeralSequence(%q) ok = %v, want %v", tt.value, ok, tt.wantOK)
			}
			if !ok {
				if got != nil {
					t.Fatalf("numeralSequence(%q) = %q, want nil when unsupported", tt.value, string(got))
				}
				return
			}
			if string(got) != tt.want {
				t.Fatalf("numeralSequence(%q) = %q, want %q", tt.value, string(got), tt.want)
			}
		})
	}
}

func TestNumberMismatchCheck(t *testing.T) {
	tests := []struct {
		name   string
		source string
		target string
		want   bool
	}{
		{name: "same digits", source: "You have 3 items", target: "Vous avez 3 articles", want: false},
		{name: "different digits", source: "You have 3 items", target: "Vous avez 4 articles", want: true},
		{name: "missing digits", source: "Page 10", target: "Page", want: true},
		{name: "added digits", source: "Page", target: "Page 1", want: true},
		{name: "reordered digits", source: "12", target: "21", want: true},
		{name: "equivalent numeral system", source: "Step 42", target: "الخطوة ٤٢", want: false},
		{name: "empty target", source: "Page 10", target: "", want: false},
		{name: "whitespace target", source: "Page 10", target: "  \t", want: false},
		{name: "unsupported source numerals", source: "᠑", target: "2", want: false},
		{name: "unsupported target numerals", source: "1", target: "᠒", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check, got := numberMismatchCheck(tt.source, tt.target)
			if got != tt.want {
				t.Fatalf("numberMismatchCheck(%q, %q) = %v, want %v", tt.source, tt.target, got, tt.want)
			}
			if !got {
				if check.ID != "" {
					t.Fatalf("expected zero Check when not included, got %+v", check)
				}
				return
			}
			assertQALocaleCheck(t, check, "qa-numbers-mismatch", "Numbers")
		})
	}
}

func TestTerminalPunctuation(t *testing.T) {
	tests := []struct {
		value string
		want  rune
	}{
		{value: "", want: 0},
		{value: "   ", want: 0},
		{value: "Hello", want: 0},
		{value: "Hello.", want: '.'},
		{value: "Hello.  \n", want: '.'},
		{value: "Really?", want: '?'},
		{value: "Wow!", want: '!'},
		{value: "Note:", want: ':'},
		{value: "List;", want: ';'},
		{value: "Wait…", want: '…'},
		{value: "こんにちは。", want: '.'},
		{value: "ｺﾝﾆﾁﾊ｡", want: '.'},
		{value: "本当？", want: '?'},
		{value: "هل؟", want: '?'},
		{value: "قائمة؛", want: ';'},
		{value: "すごい！", want: '!'},
		{value: "Hello,", want: 0},
		{value: "(Hello)", want: 0},
	}
	for _, tt := range tests {
		if got := terminalPunctuation(tt.value); got != tt.want {
			t.Errorf("terminalPunctuation(%q) = %q, want %q", tt.value, got, tt.want)
		}
	}
}

func TestEquivalentTerminalPunctuationPassesThroughOtherRunes(t *testing.T) {
	for _, r := range []rune{'a', '.', ',', '?', '…', 'é'} {
		if got := equivalentTerminalPunctuation(r); got != r {
			t.Errorf("equivalentTerminalPunctuation(%q) = %q, want unchanged", r, got)
		}
	}
}

func TestPunctuationMismatchCheck(t *testing.T) {
	tests := []struct {
		name   string
		source string
		target string
		want   bool
	}{
		{name: "same period", source: "Saved.", target: "Enregistré.", want: false},
		{name: "cjk period equivalent", source: "Saved.", target: "保存しました。", want: false},
		{name: "fullwidth question equivalent", source: "Continue?", target: "続けますか？", want: false},
		{name: "arabic question equivalent", source: "Continue?", target: "متابعة؟", want: false},
		{name: "missing period", source: "Saved.", target: "Enregistré", want: true},
		{name: "question to period", source: "Continue?", target: "Continuer.", want: true},
		{name: "source without terminal punctuation", source: "Saved", target: "Enregistré.", want: false},
		{name: "empty target", source: "Saved.", target: "", want: false},
		{name: "whitespace target", source: "Saved.", target: " ", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check, got := punctuationMismatchCheck(tt.source, tt.target)
			if got != tt.want {
				t.Fatalf("punctuationMismatchCheck(%q, %q) = %v, want %v", tt.source, tt.target, got, tt.want)
			}
			if got {
				assertQALocaleCheck(t, check, "qa-punctuation-mismatch", "Punctuation")
			}
		})
	}
}

func TestFirstLetter(t *testing.T) {
	tests := []struct {
		value string
		want  rune
	}{
		{value: "", want: 0},
		{value: "123 !?", want: 0},
		{value: "Hello", want: 'H'},
		{value: "  hello", want: 'h'},
		{value: "{name} hello", want: 'n'},
		{value: "42 Éclairs", want: 'É'},
		{value: "«bonjour»", want: 'b'},
		{value: "日本", want: '日'},
	}
	for _, tt := range tests {
		if got := firstLetter(tt.value); got != tt.want {
			t.Errorf("firstLetter(%q) = %q, want %q", tt.value, got, tt.want)
		}
	}
}

func TestCaseMismatchCheck(t *testing.T) {
	tests := []struct {
		name   string
		source string
		target string
		locale string
		want   bool
	}{
		{name: "both upper", source: "Save", target: "Enregistrer", locale: "fr", want: false},
		{name: "both lower", source: "save", target: "enregistrer", locale: "fr-FR", want: false},
		{name: "upper to lower", source: "Save", target: "enregistrer", locale: "fr", want: true},
		{name: "lower to upper", source: "save", target: "Speichern", locale: "de", want: true},
		{name: "underscore locale", source: "Save", target: "guardar", locale: "es_MX", want: true},
		{name: "uppercase locale", source: "Save", target: "salva", locale: "IT-it", want: true},
		{name: "unsupported language", source: "Save", target: "kaydet", locale: "tr", want: false},
		{name: "empty locale", source: "Save", target: "save", locale: "", want: false},
		{name: "non-latin target", source: "Save", target: "сохранить", locale: "en", want: false},
		{name: "non-latin source", source: "保存", target: "save", locale: "en", want: false},
		{name: "no letters in target", source: "Save", target: "123", locale: "en", want: false},
		{name: "no letters in source", source: "42", target: "save", locale: "en", want: false},
		{name: "leading digits ignored", source: "3 Items", target: "3 articles", locale: "fr", want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check, got := caseMismatchCheck(tt.source, tt.target, tt.locale)
			if got != tt.want {
				t.Fatalf("caseMismatchCheck(%q, %q, %q) = %v, want %v", tt.source, tt.target, tt.locale, got, tt.want)
			}
			if got {
				assertQALocaleCheck(t, check, "qa-character-case-mismatch", "Capitalization")
			}
		})
	}
}

func TestValidateExtraPlaceholderParityPublic(t *testing.T) {
	tests := []struct {
		name       string
		source     string
		translated string
		wantErr    bool
	}{
		{name: "no placeholders", source: "Hello", translated: "Bonjour", wantErr: false},
		{name: "printf preserved", source: "Hello %s", translated: "Bonjour %s", wantErr: false},
		{name: "printf dropped", source: "Hello %s", translated: "Bonjour", wantErr: true},
		{name: "printf added", source: "Hello", translated: "Bonjour %d", wantErr: true},
		{name: "printf changed verb", source: "%d items", translated: "%s articles", wantErr: true},
		{name: "mustache preserved", source: "Hi {{name}}", translated: "Salut {{name}}", wantErr: false},
		{name: "mustache dropped", source: "Hi {{name}}", translated: "Salut", wantErr: true},
		{name: "escaped percent", source: "100%% done", translated: "100%% fait", wantErr: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateExtraPlaceholderParity(tt.source, tt.translated)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateExtraPlaceholderParity(%q, %q) err = %v, wantErr %v", tt.source, tt.translated, err, tt.wantErr)
			}
			if err != nil && !strings.Contains(err.Error(), "extra placeholder parity mismatch") {
				t.Fatalf("unexpected error message: %v", err)
			}
		})
	}
}

func TestDigitZerosAreDistinctBlocks(t *testing.T) {
	// numeralSequence relies on each zero starting a block of ten digits that
	// does not overlap another block.
	zeros := slices.Clone(digitZeros)
	slices.Sort(zeros)
	for i := 1; i < len(zeros); i++ {
		if zeros[i]-zeros[i-1] < 10 {
			t.Fatalf("digit blocks overlap: %U and %U", zeros[i-1], zeros[i])
		}
	}
}

func assertQALocaleCheck(t *testing.T, check Check, wantID, wantLabel string) {
	t.Helper()
	if check.ID != wantID || check.Label != wantLabel {
		t.Fatalf("check = %+v, want ID %q label %q", check, wantID, wantLabel)
	}
	if check.Status != StatusWarn || check.Category != "qa" || check.Message == "" {
		t.Fatalf("check = %+v, want warn status, qa category, non-empty message", check)
	}
}
