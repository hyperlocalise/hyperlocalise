package translationfileparser

import (
	"fmt"
	"testing"
)

func BenchmarkJSONCParser(b *testing.B) {
	content := []byte(`{
  // App header
  "header": {
    /* Title of the app */
    "title": "Hyperlocalise",
    "nav": {
      "home": "Home", // link to home
      "about": "About" // link to about
    }
  },
  "footer": "Copyright 2024"`)

	for i := 0; i < 100; i++ {
		entry := fmt.Sprintf(`,
  // Section %d
  "section_%d": {
    // Subsection title
    "title": "Section %d title",
    /* Nested object with comments */
    "nested": {
      "key": "value %d" // inline comment %d
    }
  }`, i, i, i, i, i)
		content = append(content, []byte(entry)...)
	}
	content = append(content, '}')

	parser := JSONCParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = parser.ParseWithContext(content)
	}
}
