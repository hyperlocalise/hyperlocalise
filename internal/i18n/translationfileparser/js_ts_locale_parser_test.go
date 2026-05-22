package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestJSTSLocaleModuleParserParsesDefaultExportNestedStrings(t *testing.T) {
	content := []byte(`// English locale
export default {
  home: {
    title: "Welcome {name}",
    cta: 'Start now',
  },
  cart: {
    items: "{count, plural, one {# item} other {# items}}",
  },
  checklist: ["One", "Two"],
} as const;
`)

	got, err := (JSTSLocaleModuleParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := map[string]string{
		"home.title":   "Welcome {name}",
		"home.cta":     "Start now",
		"cart.items":   "{count, plural, one {# item} other {# items}}",
		"checklist[0]": "One",
		"checklist[1]": "Two",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch:\ngot  %#v\nwant %#v", got, want)
	}
}

func TestJSTSLocaleModuleParserParsesNamedAndCommonJSExports(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{
			name: "named export",
			content: `export const messages: LocaleMessages = {
  hello: "Hello",
};`,
		},
		{
			name: "named export with default identifier export",
			content: `export const messages = {
  hello: "Hello",
};

export default messages;`,
		},
		{
			name: "non-locale export before named export",
			content: `export const LOCALE_CODE = "en-US";
export const messages = {
  hello: "Hello",
};`,
		},
		{
			name: "commonjs module exports",
			content: `module.exports = {
  hello: "Hello",
};`,
		},
		{
			name: "default identifier export",
			content: `const messages = {
  hello: "Hello",
};

export default messages;`,
		},
		{
			name: "bare non-locale const before identifier export",
			content: `const LOCALE_CODE = "en-US";
const messages = {
  hello: "Hello",
};

export default messages;`,
		},
		{
			name: "regex before export",
			content: `const token = /[{identifier]/g;

export default {
  hello: "Hello",
};`,
		},
		{
			name: "regex with quotes before export",
			content: `const token = /['"]/g;

export default {
  hello: "Hello",
};`,
		},
		{
			name: "division before url string",
			content: `const ratio = total / "http://example.com".length;

export default {
  hello: "Hello",
};`,
		},
		{
			name: "multiline type annotation",
			content: `const messages: {
  hello: string
} = {
  hello: "Hello",
};

export default messages;`,
		},
		{
			name: "inline object type annotation with separators",
			content: `const messages: { hello: string; cta: string } = {
  hello: "Hello",
};

export default messages;`,
		},
		{
			name: "unicode identifier export",
			content: `const données = {
  hello: "Hello",
};

export default données;`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := (JSTSLocaleModuleParser{}).Parse([]byte(tt.content))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if got["hello"] != "Hello" {
				t.Fatalf("unexpected hello: %#v", got)
			}
		})
	}
}

func TestJSTSLocaleModuleParserParsesFormatJSContext(t *testing.T) {
	content := []byte(`export default {
  "checkout.submit": {
    defaultMessage: "Submit",
    description: "Checkout CTA",
  },
  "items.count": {
    defaultMessage: "{count, plural, one {# item} other {# items}}",
    description: "Cart item count",
  },
};`)

	values, context, err := (JSTSLocaleModuleParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}

	if values["checkout.submit"] != "Submit" {
		t.Fatalf("unexpected submit message: %q", values["checkout.submit"])
	}
	if values["items.count"] != "{count, plural, one {# item} other {# items}}" {
		t.Fatalf("unexpected plural message: %q", values["items.count"])
	}
	if context["checkout.submit"] != "Checkout CTA" {
		t.Fatalf("unexpected context: %#v", context)
	}
}

func TestJSTSLocaleModuleParserSkipsNonStringFormatJSDescription(t *testing.T) {
	content := []byte(`export default {
  "checkout.submit": {
    defaultMessage: "Submit",
    description: {
      id: "checkout.submit",
      note: "Primary action",
    },
  },
};`)

	values, context, err := (JSTSLocaleModuleParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse with context: %v", err)
	}
	if values["checkout.submit"] != "Submit" {
		t.Fatalf("unexpected submit message: %q", values["checkout.submit"])
	}
	if len(context) != 0 {
		t.Fatalf("expected object description to be skipped, got %#v", context)
	}
}

func TestJSTSLocaleModuleParserFallsBackWhenDefaultMessageIsNestedValue(t *testing.T) {
	content := []byte(`export default {
  panel: {
    defaultMessage: {
      title: "Title",
    },
    cta: "Continue",
  },
};`)

	got, err := (JSTSLocaleModuleParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := map[string]string{
		"panel.defaultMessage.title": "Title",
		"panel.cta":                  "Continue",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch:\ngot  %#v\nwant %#v", got, want)
	}
}

func TestJSTSLocaleModuleParserParsesUnicodePropertyKeys(t *testing.T) {
	got, err := (JSTSLocaleModuleParser{}).Parse([]byte(`export default {
  étiquette: "Label",
};`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["étiquette"] != "Label" {
		t.Fatalf("unexpected unicode key entries: %#v", got)
	}
}

func TestJSTSLocaleModuleParserDecodesSurrogatePairEscapes(t *testing.T) {
	got, err := (JSTSLocaleModuleParser{}).Parse([]byte(`export default {
  emoji: "\uD83D\uDE00",
};`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["emoji"] != "\U0001F600" {
		t.Fatalf("unexpected emoji value: %q", got["emoji"])
	}
}

func TestMarshalJSTSLocaleModulePreservesModuleStructureAndComments(t *testing.T) {
	template := []byte(`import type { Messages } from "./types";

// Keep translator notes near the string.
export const messages: Messages = {
  home: {
    title: "Welcome {name}",
    cta: 'Start now',
  },
  legal: ` + "`Terms & conditions`" + `,
} as const;
`)

	got, err := MarshalJSTSLocaleModule(template, map[string]string{
		"home.title": "Bienvenue {name}",
		"home.cta":   "Commencer maintenant",
		"legal":      "Conditions d'utilisation",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out := string(got)

	for _, want := range []string{
		`import type { Messages } from "./types";`,
		`// Keep translator notes near the string.`,
		`export const messages: Messages = {`,
		`title: "Bienvenue {name}"`,
		`cta: 'Commencer maintenant'`,
		"`Conditions d'utilisation`",
		"} as const;",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected output to contain %q, got:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Conditions d'utilisation") && !strings.Contains(out, "`Conditions d'utilisation`") {
		t.Fatalf("expected backtick literal quote style preserved, got:\n%s", out)
	}
}

func TestMarshalJSTSLocaleModuleEscapesTranslatedLiterals(t *testing.T) {
	template := []byte("export default { title: 'It\\'s ok', template: `Hi`, control: \"Safe\" };\n")
	got, err := MarshalJSTSLocaleModule(template, map[string]string{
		"title":    "L'offre\narrive",
		"template": "Use ${name}",
		"control":  string([]byte{'A', 0x01, 0x7F, 'Z'}),
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out := string(got)
	if !strings.Contains(out, `title: 'L\'offre\narrive'`) {
		t.Fatalf("expected single quote and newline escapes, got %q", out)
	}
	if !strings.Contains(out, "template: `Use \\${name}`") {
		t.Fatalf("expected template interpolation escape, got %q", out)
	}
	if !strings.Contains(out, `control: "A\u0001\u007FZ"`) {
		t.Fatalf("expected control character escapes, got %q", out)
	}
}

func TestHasJSTSKeywordAtUsesUTF8IdentifierBoundaries(t *testing.T) {
	src := "const émodule = 1;\nexport default { hello: \"Hello\" };\n"
	if hasJSTSKeywordAt(src, strings.Index(src, "module"), "module") {
		t.Fatal("did not expect keyword match inside non-ASCII identifier")
	}
	if !hasJSTSKeywordAt(src, strings.Index(src, "export"), "export") {
		t.Fatal("expected export keyword match")
	}
}

func TestJSTSLocaleModuleParserRejectsUnsupportedPatterns(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{
			name:    "computed key",
			content: `export default { [key]: "Hello" };`,
			want:    "computed property keys",
		},
		{
			name:    "dynamic value",
			content: `export default { hello: t("Hello") };`,
			want:    "unsupported value",
		},
		{
			name:    "interpolated template literal",
			content: "export default { hello: `Hello ${name}` };",
			want:    "interpolated template literals",
		},
		{
			name:    "multiple exported objects",
			content: `export const first = { hello: "Hello" }; export const second = { bye: "Bye" };`,
			want:    "multiple exported locale objects",
		},
		{
			name:    "sparse array",
			content: `export default { items: ["One", , "Three"] };`,
			want:    "sparse arrays",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := (JSTSLocaleModuleParser{}).Parse([]byte(tt.content))
			if err == nil {
				t.Fatal("expected parse error")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected error containing %q, got %v", tt.want, err)
			}
		})
	}
}
