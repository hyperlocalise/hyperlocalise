package translationfileparser

import (
	"bytes"
	"testing"
)

func TestMarshalLiquidWithTargetFallback_SourceParseError(t *testing.T) {
	source := []byte("Hello {{ unmatched")
	target := []byte("Bonjour {{ customer.name }}")
	values := map[string]string{"liquid.1234": "foo"}

	out, diags := MarshalLiquidWithTargetFallback(source, target, values)
	if !bytes.Equal(out, source) {
		t.Errorf("expected output to be exactly the source on source parse failure, got %q", string(out))
	}
	if len(diags.SourceFallbackKeys) != 0 {
		t.Errorf("expected no fallback keys on parse error, got %+v", diags.SourceFallbackKeys)
	}
}

func TestMarshalLiquidWithTargetFallback_TargetParseError(t *testing.T) {
	source := []byte("<h1>Welcome</h1><p>Hello {{ customer.name }}</p>")
	target := []byte("<h1>Bienvenue</h1><p>Bonjour {{ unclosed") // target parse fails

	entries, err := (LiquidParser{}).Parse(source)
	if err != nil {
		t.Fatalf("failed to parse source: %v", err)
	}
	var welcomeKey string
	for key, value := range entries {
		if value == "Welcome" {
			welcomeKey = key
			break
		}
	}
	if welcomeKey == "" {
		t.Fatalf("could not find welcome key in entries: %+v", entries)
	}

	values := map[string]string{
		welcomeKey: "Bienvenue",
	}

	out, diags := MarshalLiquidWithTargetFallback(source, target, values)
	rendered := string(out)

	// Since target parsing failed, it should fall back to source rendering.
	// Welcome -> Bienvenue
	// Hello -> stays Hello because it's missing from values and target fallback was skipped.
	if !bytes.Contains(out, []byte("<h1>Bienvenue</h1>")) {
		t.Errorf("expected 'Bienvenue' from values map, got %q", rendered)
	}
	if !bytes.Contains(out, []byte("<p>Hello {{ customer.name }}</p>")) {
		t.Errorf("expected 'Hello' to remain source text since target parse failed, got %q", rendered)
	}
	// The missing key should be flagged as fallback since it wasn't recovered.
	if len(diags.SourceFallbackKeys) == 0 {
		t.Error("expected missing key to be flagged as source fallback")
	}
}

func TestMarshalLiquidWithTargetFallback_TargetFewerSegments(t *testing.T) {
	// Source has 2 translatable segments: "Welcome" and "Hello"
	source := []byte("<h1>Welcome</h1><p>Hello</p>")
	// Target only has 1 translatable segment: "Bienvenue"
	target := []byte("<h1>Bienvenue</h1>")
	// values is empty
	values := map[string]string{}

	out, diags := MarshalLiquidWithTargetFallback(source, target, values)
	rendered := string(out)

	// "Welcome" (first segment) gets matched positionally to target's first segment "Bienvenue"
	if !bytes.Contains(out, []byte("<h1>Bienvenue</h1>")) {
		t.Errorf("expected positional recovery of first segment 'Bienvenue', got %q", rendered)
	}
	// "Hello" (second segment) has no positional match in target (index out of range for target parts)
	if !bytes.Contains(out, []byte("<p>Hello</p>")) {
		t.Errorf("expected second segment to fall back to source 'Hello', got %q", rendered)
	}
	if len(diags.SourceFallbackKeys) != 1 {
		t.Errorf("expected exactly 1 fallback key for the missing second segment, got %+v", diags.SourceFallbackKeys)
	}
}

func TestMarshalLiquidWithTargetFallback_TargetMoreSegments(t *testing.T) {
	// Source has 1 translatable segment: "Welcome"
	source := []byte("<h1>Welcome</h1>")
	// Target has 2 translatable segments: "Bienvenue" and "Bonjour"
	target := []byte("<h1>Bienvenue</h1><p>Bonjour</p>")
	// values is empty
	values := map[string]string{}

	out, diags := MarshalLiquidWithTargetFallback(source, target, values)
	rendered := string(out)

	// "Welcome" gets matched to first target segment "Bienvenue"
	if !bytes.Contains(out, []byte("<h1>Bienvenue</h1>")) {
		t.Errorf("expected 'Welcome' to fall back to target's first segment 'Bienvenue', got %q", rendered)
	}
	if len(diags.SourceFallbackKeys) != 0 {
		t.Errorf("expected 0 fallback keys, got %+v", diags.SourceFallbackKeys)
	}
}

func TestMarshalLiquidWithTargetFallback_MixedValues(t *testing.T) {
	// Source has 3 translatable segments: "Welcome", "Middle", "End"
	source := []byte("<h1>Welcome</h1><p>Middle</p><span>End</span>")
	// Target has 3 translatable segments: "Bienvenue", "Milieu", "Fin"
	target := []byte("<h1>Bienvenue</h1><p>Milieu</p><span>Fin</span>")

	// We provide an explicit translation for "Middle" in the values map.
	// First let's parse to find the key of "Middle"
	entries, err := (LiquidParser{}).Parse(source)
	if err != nil {
		t.Fatalf("unexpected parsing error: %v", err)
	}

	var middleKey string
	for key, value := range entries {
		if value == "Middle" {
			middleKey = key
			break
		}
	}
	if middleKey == "" {
		t.Fatalf("could not find key for 'Middle' in %+v", entries)
	}

	values := map[string]string{
		middleKey: "Custom-Translation", // Override target "Milieu" with custom translation
	}

	out, diags := MarshalLiquidWithTargetFallback(source, target, values)
	rendered := string(out)

	// "Welcome" is missing from values, should recover target's first segment "Bienvenue"
	if !bytes.Contains(out, []byte("<h1>Bienvenue</h1>")) {
		t.Errorf("expected positional recovery of first segment 'Bienvenue', got %q", rendered)
	}
	// "Middle" is present in values, should use "Custom-Translation" instead of target "Milieu"
	if !bytes.Contains(out, []byte("<p>Custom-Translation</p>")) {
		t.Errorf("expected values map override 'Custom-Translation' to take precedence, got %q", rendered)
	}
	if bytes.Contains(out, []byte("Milieu")) {
		t.Errorf("expected target 'Milieu' to be overridden by values map, got %q", rendered)
	}
	// "End" is missing from values, should recover target's third segment "Fin"
	if !bytes.Contains(out, []byte("<span>Fin</span>")) {
		t.Errorf("expected positional recovery of third segment 'Fin', got %q", rendered)
	}

	if len(diags.SourceFallbackKeys) != 0 {
		t.Errorf("expected 0 fallback keys, got %+v", diags.SourceFallbackKeys)
	}
}
