package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkMarshalXLIFF(b *testing.B) {
	n := 1000
	template := generateLargeXLIFF(n)
	values := map[string]string{}
	for i := 0; i < n; i++ {
		values[fmt.Sprintf("u%d", i)] = fmt.Sprintf("translation %d", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalXLIFF(template, values, "en", "fr")
	}
}

func generateLargeXLIFF(n int) []byte {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="file.ext">
    <body>
`)
	for i := 0; i < n; i++ {
		sb.WriteString(fmt.Sprintf(`      <trans-unit id="u%d">
        <source>source %d</source>
        <target>target %d</target>
      </trans-unit>
`, i, i, i))
	}
	sb.WriteString(`    </body>
  </file>
</xliff>`)
	return []byte(sb.String())
}
