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
	template := []byte("export default { title: 'It\\'s ok', template: `Hi` };\n")
	got, err := MarshalJSTSLocaleModule(template, map[string]string{
		"title":    "L'offre\narrive",
		"template": "Use ${name}",
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
