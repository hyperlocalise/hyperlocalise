package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestMarshalYAMLWithPrune_Scout(t *testing.T) {
	template := []byte(`# Translation file
hello: Hello
home:
  # Title of home page
  title: Welcome
  cta: Start
  # Steps to choose plan
  steps:
    - Choose plan
    - Confirm
`)

	// We want to keep 'hello', 'home.title', and 'home.steps' (and its entries)
	// We want to prune 'home.cta'
	// We also want to rewrite 'hello' to 'Bonjour' and 'home.title' to 'Accueil'
	pruneKeys := map[string]struct{}{
		"hello":         {},
		"home.title":    {},
		"home.steps[0]": {},
		"home.steps[1]": {},
	}

	values := map[string]string{
		"hello":      "Bonjour",
		"home.title": "Accueil",
	}

	got, err := MarshalYAMLWithPrune(template, values, pruneKeys)
	if err != nil {
		t.Fatalf("MarshalYAMLWithPrune failed: %v", err)
	}

	output := string(got)

	// Check if the pruned field is absent
	if strings.Contains(output, "cta:") || strings.Contains(output, "Start") {
		t.Fatalf("expected 'home.cta' to be pruned, but output contains it:\n%s", output)
	}

	// Check if retained fields are present and updated
	if !strings.Contains(output, "hello: Bonjour") {
		t.Fatalf("expected 'hello: Bonjour' in output, got:\n%s", output)
	}
	if !strings.Contains(output, "title: Accueil") {
		t.Fatalf("expected 'title: Accueil' in output, got:\n%s", output)
	}

	// Check if sequence fields and comments are preserved
	if !strings.Contains(output, "# Translation file") || !strings.Contains(output, "# Title of home page") || !strings.Contains(output, "# Steps to choose plan") {
		t.Fatalf("expected comments to be preserved, got:\n%s", output)
	}

	if !strings.Contains(output, "- Choose plan") || !strings.Contains(output, "- Confirm") {
		t.Fatalf("expected sequence entries to be preserved, got:\n%s", output)
	}

	// Verify we can parse it back correctly using YAMLParser
	parsed, err := (YAMLParser{}).Parse(got)
	if err != nil {
		t.Fatalf("failed to parse pruned YAML output: %v", err)
	}

	expected := map[string]string{
		"hello":         "Bonjour",
		"home.title":    "Accueil",
		"home.steps[0]": "Choose plan",
		"home.steps[1]": "Confirm",
	}

	if !reflect.DeepEqual(parsed, expected) {
		t.Errorf("parsed pruned YAML = %v, want %v", parsed, expected)
	}
}
