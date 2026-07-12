package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkYAMLParser_Parse(b *testing.B) {
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
	parser := YAMLParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkYAMLParser_ParseLarge(b *testing.B) {
	numEntries := 1000
	var sb strings.Builder
	for i := 0; i < numEntries; i++ {
		fmt.Fprintf(&sb, "key_%d: \"value_%d\"\n", i, i)
		fmt.Fprintf(&sb, "nested_%d:\n  inner: \"val\"\n", i)
		fmt.Fprintf(&sb, "list_%d:\n  - item1\n  - item2\n", i)
	}
	content := []byte(sb.String())
	parser := YAMLParser{}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarshalYAML(b *testing.B) {
	template := []byte(`
hello: Hello
home:
  title: Welcome
  steps:
    - Choose plan
    - Confirm
`)
	values := map[string]string{
		"hello":         "Bonjour",
		"home.title":    "Accueil",
		"home.steps[1]": "Confirmer",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalYAML(template, values)
	}
}

func BenchmarkMarshalYAML_Large(b *testing.B) {
	numEntries := 1000
	var sb strings.Builder
	values := make(map[string]string, numEntries*2)
	for i := 0; i < numEntries; i++ {
		key := fmt.Sprintf("key_%d", i)
		fmt.Fprintf(&sb, "%s: \"value_%d\"\n", key, i)
		values[key] = fmt.Sprintf("translated_%d", i)

		nestedKey := fmt.Sprintf("nested_%d.inner", i)
		fmt.Fprintf(&sb, "nested_%d:\n  inner: \"val\"\n", i)
		values[nestedKey] = "translated_val"
	}
	template := []byte(sb.String())

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalYAML(template, values)
	}
}
