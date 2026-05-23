package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestFluentParserParsesMessagesAttributesSelectorsAndContext(t *testing.T) {
	content := []byte(`### Checkout
# Greeting shown after sign-in.
hello = Hello { $name }
escaped = Use \\{literal\\} and C:\\Temp

brand =
    .title = Hyperlocalise
    .aria-label = Open { $item }

items =
    { $count ->
        [one] One item
       *[other] { $count } items
    }
`)

	values, ctx, err := FluentParser{}.ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}

	want := map[string]string{
		"hello":            "Hello { $name }",
		"escaped":          "Use \\\\{literal\\\\} and C:\\\\Temp",
		"brand.title":      "Hyperlocalise",
		"brand.aria-label": "Open { $item }",
		"items":            "{ $count ->\n    [one] One item\n   *[other] { $count } items\n}",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
	}
	if got := ctx["hello"]; got != "Greeting shown after sign-in." {
		t.Fatalf("expected comment context for hello, got %#v", ctx)
	}
}

func TestFluentParserPreservesRelativeIndentation(t *testing.T) {
	values, err := FluentParser{}.Parse([]byte(`nested =
    { $gender ->
        [male] { $count ->
            [one] His item
           *[other] His items
        }
       *[other] Their item
    }
`))
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}

	want := "{ $gender ->\n    [male] { $count ->\n        [one] His item\n       *[other] His items\n    }\n   *[other] Their item\n}"
	if values["nested"] != want {
		t.Fatalf("expected relative indentation preserved\n got: %q\nwant: %q", values["nested"], want)
	}
}

func TestFluentParserKeepsIndentedHashContinuationLines(t *testing.T) {
	values, err := FluentParser{}.Parse([]byte(`topic =
    # trending
    Now
`))
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}

	want := "# trending\nNow"
	if values["topic"] != want {
		t.Fatalf("expected indented hash line as value content\n got: %q\nwant: %q", values["topic"], want)
	}
}

func TestMarshalFluentInlineMultilineValuesAreIdempotent(t *testing.T) {
	template := []byte(`hello = First line
    continuation
`)

	values, err := FluentParser{}.Parse(template)
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}
	if got, want := values["hello"], "First line\ncontinuation"; got != want {
		t.Fatalf("parsed inline multiline value mismatch\n got: %q\nwant: %q", got, want)
	}

	first, err := MarshalFluent(template, values)
	if err != nil {
		t.Fatalf("marshal fluent: %v", err)
	}
	second, err := MarshalFluent(first, values)
	if err != nil {
		t.Fatalf("marshal fluent again: %v", err)
	}

	want := string(template)
	if string(first) != want {
		t.Fatalf("first marshal changed inline multiline indentation\n got: %q\nwant: %q", string(first), want)
	}
	if string(second) != want {
		t.Fatalf("second marshal changed inline multiline indentation\n got: %q\nwant: %q", string(second), want)
	}
}

func TestMarshalFluentPreservesCommentsAndReplacesValues(t *testing.T) {
	template := []byte(`# Greeting
hello = Hello { $name }

brand =
    .title = Hyperlocalise
    .aria-label = Open { $item }

items =
    { $count ->
        [one] One item
       *[other] { $count } items
    }
`)

	got, err := MarshalFluent(template, map[string]string{
		"hello":            "Bonjour { $name }",
		"brand.title":      "Hyperlocalise FR",
		"brand.aria-label": "Ouvrir { $item }",
		"items":            "{ $count ->\n[one] Un article\n*[other] { $count } articles\n}",
	})
	if err != nil {
		t.Fatalf("marshal fluent: %v", err)
	}

	want := `# Greeting
hello = Bonjour { $name }

brand =
    .title = Hyperlocalise FR
    .aria-label = Ouvrir { $item }

items =
    { $count ->
    [one] Un article
    *[other] { $count } articles
    }
`
	if string(got) != want {
		t.Fatalf("marshaled fluent mismatch\n got: %q\nwant: %q", string(got), want)
	}
}

func TestMarshalFluentRejectsNewAttributeForExistingAttributeOnlyParent(t *testing.T) {
	_, err := MarshalFluent([]byte(`brand =
    .title = Hyperlocalise
`), map[string]string{
		"brand.title":  "Hyperlocalise FR",
		"brand.footer": "Footer",
	})
	if err == nil || !strings.Contains(err.Error(), `cannot append missing attribute "brand.footer"`) {
		t.Fatalf("expected missing attribute parent guard error, got %v", err)
	}
}

func TestMarshalFluentAppendsMissingEntriesDeterministically(t *testing.T) {
	got, err := MarshalFluent([]byte("hello = Bonjour\n"), map[string]string{
		"hello":       "Salut",
		"zebra":       "Zebre",
		"brand.title": "Titre",
		"apple":       "Pomme",
	})
	if err != nil {
		t.Fatalf("marshal fluent: %v", err)
	}

	want := `hello = Salut

apple = Pomme

brand =
    .title = Titre

zebra = Zebre
`
	if string(got) != want {
		t.Fatalf("marshaled fluent mismatch\n got: %q\nwant: %q", string(got), want)
	}
}

func TestFluentParserExcludesFileAndGroupCommentsFromMessageContext(t *testing.T) {
	_, ctx, err := FluentParser{}.ParseWithContext([]byte(`### Checkout
## Signed-in view
# Greeting shown after sign-in.
hello = Hello
`))
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}

	if got := ctx["hello"]; got != "Greeting shown after sign-in." {
		t.Fatalf("expected only message comment context, got %q", got)
	}
}

func TestFluentParserRejectsUnsupportedTerms(t *testing.T) {
	_, err := FluentParser{}.Parse([]byte("-brand = Hyperlocalise\n"))
	if err == nil || !strings.Contains(err.Error(), "terms are not supported") {
		t.Fatalf("expected unsupported term error, got %v", err)
	}
}

func TestFluentParserRejectsAttributeWithoutParent(t *testing.T) {
	_, err := FluentParser{}.Parse([]byte("    .title = Missing parent\n"))
	if err == nil || !strings.Contains(err.Error(), "has no parent message") {
		t.Fatalf("expected attribute parent error, got %v", err)
	}
}

func TestFluentParserRejectsTermReferences(t *testing.T) {
	tests := []string{
		"hello = Welcome {-brand }\n",
		"hello = Welcome { -brand }\n",
		"hello = Welcome {  -brand }\n",
		"hello = Welcome {\t-brand }\n",
	}

	for _, input := range tests {
		_, err := FluentParser{}.Parse([]byte(input))
		if err == nil || !strings.Contains(err.Error(), "references a term") {
			t.Fatalf("expected term reference error for %q, got %v", input, err)
		}
	}
}
