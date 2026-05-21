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
