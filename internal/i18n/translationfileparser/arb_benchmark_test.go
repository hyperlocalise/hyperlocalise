package translationfileparser

import (
	"fmt"
	"testing"
)

func BenchmarkARBParser_Parse(b *testing.B) {
	content := []byte(`{
  "@@locale": "en",
  "title": "Hello World",
  "@title": {
    "description": "The title of the application"
  },
  "message": "Welcome to our app",
  "@message": {
    "description": "Greeting message"
  }
}`)
	parser := ARBParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarshalARB(b *testing.B) {
	template := []byte(`{
  "@@locale": "en",
  "title": "Hello World",
  "@title": {
    "description": "The title of the application"
  }
}`)
	values := map[string]string{
		"title":   "Bonjour le monde",
		"new_key": "Nouvelle clé",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalARB(template, template, values, "fr")
	}
}

func BenchmarkMarshalARB_Large(b *testing.B) {
	numEntries := 1000
	template := "{\n  \"@@locale\": \"en\""
	values := map[string]string{}
	for i := 0; i < numEntries; i++ {
		key := fmt.Sprintf("key_%d", i)
		template += fmt.Sprintf(",\n  %q: %q", key, fmt.Sprintf("value_%d", i))
		template += fmt.Sprintf(",\n  %q: { %q: %q }", "@"+key, "description", fmt.Sprintf("desc_%d", i))
		values[key] = fmt.Sprintf("translated_%d", i)
	}
	template += "\n}"
	templateBytes := []byte(template)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalARB(templateBytes, templateBytes, values, "fr")
	}
}
