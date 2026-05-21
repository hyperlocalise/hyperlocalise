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
		"items":            "{ $count ->\n[one] One item\n*[other] { $count } items\n}",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
	}
	if !strings.Contains(ctx["hello"], "Greeting shown after sign-in.") {
		t.Fatalf("expected comment context for hello, got %#v", ctx)
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
	_, err := FluentParser{}.Parse([]byte("hello = Welcome { -brand }\n"))
	if err == nil || !strings.Contains(err.Error(), "references a term") {
		t.Fatalf("expected term reference error, got %v", err)
	}
}
