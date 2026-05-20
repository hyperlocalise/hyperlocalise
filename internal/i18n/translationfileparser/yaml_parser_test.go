package translationfileparser

import (
	"strings"
	"testing"
)

func TestYAMLParserParsesNestedStringsAndSequences(t *testing.T) {
	content := []byte(`
hello: Bonjour
home:
  title: Accueil
  steps:
    - Choisir un forfait
    - Confirmer
cards:
  - title: Premier
    body: Texte
`)

	got, err := (YAMLParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := map[string]string{
		"hello":          "Bonjour",
		"home.title":     "Accueil",
		"home.steps[0]":  "Choisir un forfait",
		"home.steps[1]":  "Confirmer",
		"cards[0].title": "Premier",
		"cards[0].body":  "Texte",
	}
	for key, value := range want {
		if got[key] != value {
			t.Fatalf("unexpected %s: got %q want %q", key, got[key], value)
		}
	}
}

func TestYAMLParserParsesICUAndPlaceholdersAsStrings(t *testing.T) {
	content := []byte(`
items: "{count, plural, one {# item} other {# items}}"
profile:
  intro: "Hello {name}"
  pronoun: "{gender, select, male {He} female {She} other {They}}"
`)

	got, err := (YAMLParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["items"] != "{count, plural, one {# item} other {# items}}" {
		t.Fatalf("unexpected plural message: %q", got["items"])
	}
	if got["profile.intro"] != "Hello {name}" {
		t.Fatalf("unexpected placeholder message: %q", got["profile.intro"])
	}
	if got["profile.pronoun"] != "{gender, select, male {He} female {She} other {They}}" {
		t.Fatalf("unexpected select message: %q", got["profile.pronoun"])
	}
}

func TestYAMLParserRejectsUnsupportedScalar(t *testing.T) {
	_, err := (YAMLParser{}).Parse([]byte("count: 3\n"))
	if err == nil {
		t.Fatalf("expected unsupported scalar error")
	}
	if !strings.Contains(err.Error(), `yaml key "count"`) || !strings.Contains(err.Error(), "!!int") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestYAMLParserRejectsQuotedNullRoot(t *testing.T) {
	_, err := (YAMLParser{}).Parse([]byte("\"null\"\n"))
	if err == nil {
		t.Fatalf("expected quoted null root error")
	}
	if !strings.Contains(err.Error(), "yaml root must be mapping") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestYAMLParserRejectsAmbiguousMappingKeys(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{name: "dot", content: `"home.title": Welcome`},
		{name: "open bracket", content: `"steps[0": Welcome`},
		{name: "close bracket", content: `"steps]": Welcome`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := (YAMLParser{}).Parse([]byte(tt.content + "\n"))
			if err == nil {
				t.Fatalf("expected ambiguous key error")
			}
			if !strings.Contains(err.Error(), "keys cannot contain") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestYAMLParserRejectsAliases(t *testing.T) {
	_, err := (YAMLParser{}).Parse([]byte("hello: &hello Hello\ncopy: *hello\n"))
	if err == nil {
		t.Fatalf("expected alias error")
	}
	if !strings.Contains(err.Error(), "alias/anchor") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarshalYAMLRewritesNestedValuesAndPreservesComments(t *testing.T) {
	template := []byte(`# Shared locale strings.
hello: Hello
home:
  # Main heading.
  title: Welcome
  steps:
    - Choose plan
    - Confirm
`)

	got, err := MarshalYAML(template, map[string]string{
		"hello":         "Bonjour",
		"home.title":    "Accueil",
		"home.steps[1]": "Confirmer",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	output := string(got)
	if !strings.Contains(output, "# Shared locale strings.") || !strings.Contains(output, "# Main heading.") {
		t.Fatalf("expected comments to be preserved, got:\n%s", output)
	}

	parsed, err := (YAMLParser{}).Parse(got)
	if err != nil {
		t.Fatalf("parse marshaled output: %v", err)
	}
	if parsed["hello"] != "Bonjour" {
		t.Fatalf("unexpected rewritten hello: %q", parsed["hello"])
	}
	if parsed["home.title"] != "Accueil" {
		t.Fatalf("unexpected rewritten home.title: %q", parsed["home.title"])
	}
	if parsed["home.steps[0]"] != "Choose plan" {
		t.Fatalf("unexpected unchanged home.steps[0]: %q", parsed["home.steps[0]"])
	}
	if parsed["home.steps[1]"] != "Confirmer" {
		t.Fatalf("unexpected rewritten home.steps[1]: %q", parsed["home.steps[1]"])
	}
}

func TestMarshalYAMLDeterministic(t *testing.T) {
	template := []byte("home:\n  title: Welcome\n  cta: Start\n")
	values := map[string]string{
		"home.title": "Accueil",
		"home.cta":   "Commencer",
	}

	first, err := MarshalYAML(template, values)
	if err != nil {
		t.Fatalf("marshal first: %v", err)
	}
	second, err := MarshalYAML(template, values)
	if err != nil {
		t.Fatalf("marshal second: %v", err)
	}
	if string(first) != string(second) {
		t.Fatalf("marshal output is not deterministic:\nfirst=%s\nsecond=%s", first, second)
	}
}
