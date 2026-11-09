package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const appleStringsBenchmarkEntries = 1000

func BenchmarkAppleStringsParser(b *testing.B) {
	content := generateLargeAppleStrings(appleStringsBenchmarkEntries)
	benchmarkFixtureValues(b, AppleStringsParser{}.Parse, content, appleStringsBenchmarkEntries)
	benchmarkParse(b, AppleStringsParser{}.Parse, content)
}

func BenchmarkAppleStringsMarshal(b *testing.B) {
	content := generateLargeAppleStrings(appleStringsBenchmarkEntries)
	values := benchmarkFixtureValues(b, AppleStringsParser{}.Parse, content, appleStringsBenchmarkEntries)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		if _, err := MarshalAppleStrings(content, values); err != nil {
			b.Fatal(err)
		}
	}
}

func generateLargeAppleStrings(n int) []byte {
	var sb strings.Builder
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "/* Label shown on screen %d */\n", i)
		fmt.Fprintf(&sb, "\"key%d\" = \"Value %d for %%@ with \\\"quotes\\\"\";\n\n", i, i)
	}
	return []byte(sb.String())
}
