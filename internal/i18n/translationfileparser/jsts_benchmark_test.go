package translationfileparser

import (
	"fmt"
	"testing"
)

func BenchmarkJSTSLocaleModuleParser(b *testing.B) {
	content := []byte(`export default {
  "header": {
    "title": "Hyperlocalise",
    "nav": {
      "home": "Home",
      "about": "About"
    }
  },
  "footer": "Copyright 2024"`)

	for i := 0; i < 100; i++ {
		entry := fmt.Sprintf(`,
  "section_%d": {
    "title": "Section %d title",
    "nested": {
      "key": "value %d"
    },
    "list": [
      "item 1",
      "item 2",
      "item 3"
    ]
  }`, i, i, i)
		content = append(content, []byte(entry)...)
	}
	content = append(content, '}')

	parser := JSTSLocaleModuleParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = parser.ParseWithContext(content)
	}
}

func BenchmarkJSTSLocaleModuleMarshaler(b *testing.B) {
	content := []byte(`export default {
  "header": {
    "title": "Hyperlocalise",
    "nav": {
      "home": "Home",
      "about": "About"
    }
  },
  "footer": "Copyright 2024"`)

	for i := 0; i < 100; i++ {
		entry := fmt.Sprintf(`,
  "section_%d": {
    "title": "Section %d title",
    "nested": {
      "key": "value %d"
    }
  }`, i, i, i)
		content = append(content, []byte(entry)...)
	}
	content = append(content, '}')

	parser := JSTSLocaleModuleParser{}
	values, _, _ := parser.ParseWithContext(content)
	for k, v := range values {
		values[k] = v + " (translated)"
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalJSTSLocaleModule(content, values)
	}
}
