package translationfileparser

import (
	"strings"
	"testing"
)

func TestPHPArrayParserParsesNestedStringsAndPluralVariants(t *testing.T) {
	content := []byte(`<?php

return [
    // Authentication copy.
    'auth' => [
        'failed' => 'These credentials do not match our records.',
        'password' => "The provided password is incorrect.",
    ],
    'items' => [
        'one' => ':count item',
        'other' => ':count items',
    ],
    'welcome' => 'Welcome, :name!',
];
`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := map[string]string{
		"auth.failed":   "These credentials do not match our records.",
		"auth.password": "The provided password is incorrect.",
		"items.one":     ":count item",
		"items.other":   ":count items",
		"welcome":       "Welcome, :name!",
	}
	if len(got) != len(want) {
		t.Fatalf("entry count = %d, want %d (%#v)", len(got), len(want), got)
	}
	for key, value := range want {
		if got[key] != value {
			t.Fatalf("value for %s = %q, want %q", key, got[key], value)
		}
	}
}

func TestMarshalPHPArrayLocalePreservesCommentsMetadataAndPlaceholders(t *testing.T) {
	template := []byte(`<?php

return [
    // Authentication copy.
    'auth' => [
        'failed' => 'These credentials do not match our records.',
    ],
    'items' => [
        'one' => ':count item',
        'other' => ':count items',
    ],
    'welcome' => "Welcome, :name!",
];
`)

	out, err := MarshalPHPArrayLocale(template, map[string]string{
		"auth.failed": "Ces identifiants ne correspondent pas a nos dossiers.",
		"items.one":   ":count element",
		"items.other": ":count elements",
		"welcome":     "Bienvenue, :name!",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	want := `<?php

return [
    // Authentication copy.
    'auth' => [
        'failed' => 'Ces identifiants ne correspondent pas a nos dossiers.',
    ],
    'items' => [
        'one' => ':count element',
        'other' => ':count elements',
    ],
    'welcome' => "Bienvenue, :name!",
];
`
	if got != want {
		t.Fatalf("output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestMarshalPHPArrayLocaleEscapesDoubleQuotedEscapeBytes(t *testing.T) {
	template := []byte(`<?php return ['alert' => "Alert"];`)

	out, err := MarshalPHPArrayLocale(template, map[string]string{
		"alert": "\x1b[31mAlert",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got, want := string(out), `<?php return ['alert' => "\e[31mAlert"];`; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestPHPArrayParserSupportsLegacyArraySyntax(t *testing.T) {
	content := []byte(`<?php
return array(
    'validation' => array(
        'required' => 'The :attribute field is required.',
    ),
);
`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["validation.required"] != "The :attribute field is required." {
		t.Fatalf("unexpected parsed value: %#v", got)
	}
}

func TestPHPArrayParserMatchesKeywordsCaseInsensitively(t *testing.T) {
	content := []byte(`<?php
RETURN Array(
    'validation' => ARRAY(
        'required' => 'The :attribute field is required.',
    ),
);
`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["validation.required"] != "The :attribute field is required." {
		t.Fatalf("unexpected parsed value: %#v", got)
	}
}

func TestPHPArrayParserDecodesDoubleQuotedHexEscapes(t *testing.T) {
	content := []byte(`<?php return [
    'one_digit' => "\xA",
    'two_digits' => "\x41",
];`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["one_digit"] != "\n" {
		t.Fatalf("one_digit = %q, want newline", got["one_digit"])
	}
	if got["two_digits"] != "A" {
		t.Fatalf("two_digits = %q, want A", got["two_digits"])
	}
}

func TestPHPArrayParserDecodesDoubleQuotedOctalEscapes(t *testing.T) {
	content := []byte(`<?php return [
    'letter' => "\101",
    'newline' => "\12",
];`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["letter"] != "A" {
		t.Fatalf("letter = %q, want A", got["letter"])
	}
	if got["newline"] != "\n" {
		t.Fatalf("newline = %q, want newline", got["newline"])
	}
}

func TestPHPArrayParserTruncatesOverRangeOctalEscapes(t *testing.T) {
	content := []byte(`<?php return [
    'nul' => "\400",
    'max_byte' => "\777",
];`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["nul"] != "\x00" {
		t.Fatalf("nul = %q, want NUL", got["nul"])
	}
	if got["max_byte"] != "\xff" {
		t.Fatalf("max_byte = %q, want 0xff", got["max_byte"])
	}
}

func TestPHPArrayParserRejectsOutOfRangeUnicodeEscapes(t *testing.T) {
	_, err := (PHPArrayParser{}).Parse([]byte(`<?php return ['bad' => "\u{110000}"];`))
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "invalid unicode escape") {
		t.Fatalf("expected invalid unicode escape error, got %v", err)
	}

	_, err = (PHPArrayParser{}).Parse([]byte(`<?php return ['bad' => "\u{-1}"];`))
	if err == nil {
		t.Fatalf("expected negative unicode escape error")
	}
	if !strings.Contains(err.Error(), "invalid unicode escape") {
		t.Fatalf("expected invalid unicode escape error, got %v", err)
	}
}

func TestPHPArrayParserKeepsUnbracedUEscapesLiteral(t *testing.T) {
	content := []byte(`<?php return [
    'username' => "\username",
    'unicode_like' => "\u00e9",
];`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["username"] != `\username` {
		t.Fatalf("username = %q, want literal \\username", got["username"])
	}
	if got["unicode_like"] != `\u00e9` {
		t.Fatalf("unicode_like = %q, want literal \\u00e9", got["unicode_like"])
	}
}

func TestPHPArrayParserRejectsDynamicValues(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{
			name:    "function call",
			content: `<?php return ['hello' => __('Hello')];`,
			want:    "unsupported value",
		},
		{
			name:    "variable interpolation",
			content: `<?php return ['hello' => "Hello $name"];`,
			want:    "dynamic interpolation",
		},
		{
			name:    "executable prefix",
			content: `<?php $messages = ['hello' => 'Hello']; return $messages;`,
			want:    "expected return statement",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := (PHPArrayParser{}).Parse([]byte(tt.content))
			if err == nil {
				t.Fatalf("expected error")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected error containing %q, got %v", tt.want, err)
			}
		})
	}
}

func TestStrategyParsesPHPArrayLocale(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("resources/lang/en/messages.php", []byte(`<?php return ['home' => ['title' => 'Home']];`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["home.title"] != "Home" {
		t.Fatalf("unexpected value: %#v", got)
	}
}

func TestPHPArrayParserKeepsInvalidHexEscapeLiteral(t *testing.T) {
	content := []byte(`<?php return [
    'invalid_hex' => "\x",
    'not_hex' => "\xG",
];`)

	got, err := (PHPArrayParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["invalid_hex"] != `\x` {
		t.Fatalf("invalid_hex = %q, want literal \\x", got["invalid_hex"])
	}
	if got["not_hex"] != `\xG` {
		t.Fatalf("not_hex = %q, want literal \\xG", got["not_hex"])
	}
}
