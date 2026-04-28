package translationfileparser

import (
	"strings"
	"testing"
)

func TestStrategyParsesJSON(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("fr.json", []byte(`{"hello":"bonjour","home":{"title":"Accueil"}}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if got["home.title"] != "Accueil" {
		t.Fatalf("unexpected home.title translation: %q", got["home.title"])
	}
}

func TestStrategyParsesJSONC(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("fr.jsonc", []byte(`{
  // greeting
  "hello": "bonjour",
  "home": {
    "title": "Accueil", // keep
  },
}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if got["home.title"] != "Accueil" {
		t.Fatalf("unexpected home.title translation: %q", got["home.title"])
	}
}

func TestStrategyParsesARB(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("app_en.arb", []byte(`{
  "@@locale": "en",
  "hello": "Hello {name}",
  "@hello": {
    "description": "Greeting",
    "placeholders": {
      "name": {}
    }
  }
}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "Hello {name}" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if _, ok := got["@hello"]; ok {
		t.Fatalf("arb metadata keys must not be parsed as translatable entries")
	}
}

func TestStrategyParsesXLIFF12(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="hello">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
      <trans-unit id="welcome">
        <source>Welcome</source>
      </trans-unit>
    </body>
  </file>
</xliff>`)

	got, err := s.Parse("fr.xlf", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if got["welcome"] != "Welcome" {
		t.Fatalf("unexpected welcome translation fallback: %q", got["welcome"])
	}
}

func TestStrategyParsesXLIFF2(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="en" trgLang="fr" xmlns="urn:oasis:names:tc:xliff:document:2.0">
  <file id="f1">
    <unit id="checkout.submit">
      <segment>
        <source>Submit</source>
        <target>Valider</target>
      </segment>
    </unit>
  </file>
</xliff>`)

	got, err := s.Parse("fr.xliff", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["checkout.submit"] != "Valider" {
		t.Fatalf("unexpected translation: %q", got["checkout.submit"])
	}
}

func TestStrategyResolvesXLIFFAliasesConsistently(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="en" trgLang="fr" xmlns="urn:oasis:names:tc:xliff:document:2.0">
  <file id="f1">
    <unit id="checkout.submit">
      <segment>
        <source>Submit</source>
        <target>Valider</target>
      </segment>
    </unit>
  </file>
</xliff>`)

	extensions := []string{".xlf", ".xlif", ".xliff"}
	var baseline map[string]string

	for _, ext := range extensions {
		got, err := s.Parse("fr"+ext, content)
		if err != nil {
			t.Fatalf("parse %s: %v", ext, err)
		}

		if baseline == nil {
			baseline = got
			continue
		}

		if len(got) != len(baseline) {
			t.Fatalf("entry count mismatch for %s: got %d want %d", ext, len(got), len(baseline))
		}

		for key, value := range baseline {
			if got[key] != value {
				t.Fatalf("unexpected value for %s in %s: got %q want %q", key, ext, got[key], value)
			}
		}
	}
}

func TestStrategyParsesAppleStrings(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`"greeting" = "Bonjour";
"rocket" = "\UD83D\UDE80";
`)
	got, err := s.Parse("fr.strings", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["greeting"] != "Bonjour" {
		t.Fatalf("unexpected greeting translation: %q", got["greeting"])
	}
	if got["rocket"] != "🚀" {
		t.Fatalf("unexpected rocket translation: %q", got["rocket"])
	}
}

func TestStrategyParsesAppleStringsdict(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>items_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@items@</string>
    <key>items</key>
    <dict>
      <key>one</key>
      <string>%d item</string>
      <key>other</key>
      <string>%d items</string>
    </dict>
  </dict>
</dict>
</plist>`)

	got, err := s.Parse("fr.stringsdict", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if _, ok := got["items_count.NSStringLocalizedFormatKey"]; ok {
		t.Fatalf("metadata key NSStringLocalizedFormatKey must not be parsed as translatable entry")
	}
	if got["items_count.items.one"] != "%d item" {
		t.Fatalf("unexpected one translation: %q", got["items_count.items.one"])
	}
}

func TestStrategyParsesCSV(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("fr.csv", []byte(`key,value
hello,bonjour
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["hello"] != "bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestStrategyRegistersLiquidParser(t *testing.T) {
	s := NewDefaultStrategy()

	parser, ok := s.parsersByExt[".liquid"]
	if !ok {
		t.Fatal("expected .liquid parser registration")
	}
	if _, ok := parser.(LiquidParser); !ok {
		t.Fatalf("unexpected parser type %T", parser)
	}
}

func TestStrategyParsesLiquid(t *testing.T) {
	s := NewDefaultStrategy()

	got, err := s.Parse("sections/header.liquid", []byte(`{{ 'header.navigation.home' | t }}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected one extracted entry, got %d", len(got))
	}
	if got["header.navigation.home"] != "header.navigation.home" {
		t.Fatalf("unexpected extracted value: %q", got["header.navigation.home"])
	}
}

func TestStrategyParseWithContextIncludesFormatJSDescriptions(t *testing.T) {
	s := NewDefaultStrategy()

	messages, contextByKey, err := s.ParseWithContext("fr.json", []byte(`{
  "checkout.submit": {"defaultMessage": "Submit", "description": "Checkout CTA"},
  "home.title": {"defaultMessage": "Home"}
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["checkout.submit"] != "Submit" {
		t.Fatalf("unexpected message: %q", messages["checkout.submit"])
	}
	if contextByKey["checkout.submit"] != "Checkout CTA" {
		t.Fatalf("unexpected context: %q", contextByKey["checkout.submit"])
	}
}

func TestStrategyParseWithContextIncludesJSONCKeyComments(t *testing.T) {
	s := NewDefaultStrategy()

	messages, contextByKey, err := s.ParseWithContext("fr.jsonc", []byte(`{
  // Greeting used on landing page.
  "hello": "Bonjour",
  "home": {
    // Main heading in app shell.
    "title": "Accueil"
  }
}`))
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if messages["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello message: %q", messages["hello"])
	}
	if contextByKey["hello"] != "Greeting used on landing page." {
		t.Fatalf("unexpected hello context: %q", contextByKey["hello"])
	}
	if contextByKey["home.title"] != "Main heading in app shell." {
		t.Fatalf("unexpected home.title context: %q", contextByKey["home.title"])
	}
}

func TestStrategyUnsupportedExtension(t *testing.T) {
	s := NewDefaultStrategy()

	_, err := s.Parse("fr.yaml", []byte(""))
	if err == nil {
		t.Fatalf("expected unsupported extension error")
	}
	if !strings.Contains(err.Error(), "unsupported file extension") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStrategyParsesPO(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`msgid ""
msgstr ""
"Project-Id-Version: test\\n"

msgid "hello"
msgstr "bonjour"

msgid "home.title"
msgstr ""
"Accueil "
"Maison"

msgid "items"
msgid_plural "items"
msgstr[0] "article"
msgstr[1] "articles"
`)

	got, err := s.Parse("fr.po", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if got["home.title"] != "Accueil Maison" {
		t.Fatalf("unexpected home.title translation: %q", got["home.title"])
	}
	if got["items"] != "article" {
		t.Fatalf("unexpected plural base translation: %q", got["items"])
	}
	if len(got) != 3 {
		t.Fatalf("unexpected parsed entry count: got %d want 3", len(got))
	}
}

func TestStrategyParsesPOInvalidInputReturnsError(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`msgid hello
msgstr "bonjour"
`)

	_, err := s.Parse("fr.po", content)
	if err == nil {
		t.Fatalf("expected parse error for malformed po input")
	}
	if !strings.Contains(err.Error(), "parse msgid") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStrategyParseWithContextMarkdown(t *testing.T) {
	s := NewDefaultStrategy()
	md := []byte("# Hello\n\nThis is a [link](https://example.com).\n")
	messages, ctx, err := s.ParseWithContext("en/page.md", md)
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if len(messages) == 0 {
		t.Fatal("expected markdown segments")
	}
	if len(ctx) != len(messages) {
		t.Fatalf("context keys = %d, messages = %d", len(ctx), len(messages))
	}
	for k, v := range ctx {
		if v == "" {
			t.Fatalf("empty context for key %q", k)
		}
		if !strings.Contains(v, "Markdown translatable segment") {
			t.Fatalf("expected markdown segment header in context for %q", k)
		}
		if !strings.Contains(v, "HLMDPH") {
			t.Fatalf("expected placeholder preservation hint for %q", k)
		}
	}
}

func TestStrategyParseWithContextMDX(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("---\ntitle: X\n---\n\nHello from MDX.\n")
	_, ctx, err := s.ParseWithContext("en/page.mdx", content)
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	for _, v := range ctx {
		if !strings.Contains(v, "MDX translatable segment") {
			t.Fatalf("expected MDX header, got %q", v)
		}
	}
}

func TestStrategyParseWithContextMarkdownIncludesAdjacentHints(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("---\ntitle: X\n---\n\nIntro line.\n\n## Section\n\nMiddle segment.\n\nFooter line.\n")
	_, ctx, err := s.ParseWithContext("en/guide.md", content)
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	found := false
	for _, v := range ctx {
		if strings.Contains(v, "Adjacent source before") || strings.Contains(v, "Adjacent source after") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected adjacent literal hints in at least one segment context, got %#v", ctx)
	}
}

func TestJSONParserRejectsInvalidShape(t *testing.T) {
	_, err := (JSONParser{}).Parse([]byte(`{"count":1}`))
	if err == nil {
		t.Fatalf("expected invalid json translation error")
	}
}
