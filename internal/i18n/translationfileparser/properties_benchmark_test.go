package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkJavaPropertiesParser(b *testing.B) {
	var sb strings.Builder
	for i := 0; i < 1000; i++ {
		sb.WriteString(fmt.Sprintf("key.%d = value %d\n", i, i))
	}
	content := []byte(sb.String())
	parser := JavaPropertiesParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := parser.Parse(content)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalJavaProperties(b *testing.B) {
	var sb strings.Builder
	values := make(map[string]string, 1000)
	for i := 0; i < 1000; i++ {
		key := fmt.Sprintf("key.%d", i)
		sb.WriteString(fmt.Sprintf("%s = value %d\n", key, i))
		values[key] = fmt.Sprintf("updated value %d", i)
	}
	template := []byte(sb.String())
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := MarshalJavaProperties(template, values)
		if err != nil {
			b.Fatal(err)
		}
	}
}
