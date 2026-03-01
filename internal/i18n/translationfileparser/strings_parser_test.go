package translationfileparser

import (
	"strings"
	"testing"
)

func TestAppleStringsParserParsesCommentsAndEscapes(t *testing.T) {
	content := []byte(`/* General */
"hello" = "Bonjour";
"path" = "C:\\Temp\\new";
"line_break" = "One\nTwo";
"quoted" = "He said \"hi\"";
"emoji" = "\UD83D\UDE80";
`)

	got, err := (AppleStringsParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse strings: %v", err)
	}

	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello value: %q", got["hello"])
	}
	if got["path"] != "C:\\Temp\\new" {
		t.Fatalf("unexpected path value: %q", got["path"])
	}
	if got["line_break"] != "One\nTwo" {
		t.Fatalf("unexpected line break value: %q", got["line_break"])
	}
	if got["quoted"] != "He said \"hi\"" {
		t.Fatalf("unexpected quoted value: %q", got["quoted"])
	}
	if got["emoji"] != "🚀" {
		t.Fatalf("unexpected emoji value: %q", got["emoji"])
	}
}

func TestAppleStringsParserParsesMultilineAndUnicode(t *testing.T) {
	content := []byte("\"multiline\" = \"First line\nSecond line\";\n\"unicode\" = \"\\U4F60\\U597D\";\n")

	got, err := (AppleStringsParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse strings: %v", err)
	}

	if got["multiline"] != "First line\nSecond line" {
		t.Fatalf("unexpected multiline value: %q", got["multiline"])
	}
	if got["unicode"] != "你好" {
		t.Fatalf("unexpected unicode value: %q", got["unicode"])
	}
}

func TestMarshalAppleStringsPreservesTemplateFormatting(t *testing.T) {
	template := []byte(`/* App title */
"title"   =   "Welcome";

// CTA comment
"cta"="Tap to continue";
`)

	out, err := MarshalAppleStrings(template, map[string]string{
		"title": "Bienvenue",
		"cta":   "Appuyez\ncontinuer",
	})
	if err != nil {
		t.Fatalf("marshal strings: %v", err)
	}

	rendered := string(out)
	if !strings.Contains(rendered, "/* App title */") || !strings.Contains(rendered, "// CTA comment") {
		t.Fatalf("expected comments preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, "\"title\"   =   \"Bienvenue\";") {
		t.Fatalf("expected spacing preserved, got %q", rendered)
	}
	if !strings.Contains(rendered, `"cta"="Appuyez\ncontinuer";`) {
		t.Fatalf("expected escaped output preserved, got %q", rendered)
	}
}
