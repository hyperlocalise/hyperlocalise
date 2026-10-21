package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func createBenchmarkINIData(numSections, keysPerSection int) ([]byte, map[string]string) {
	var sb strings.Builder
	values := make(map[string]string, numSections*keysPerSection)

	for s := 0; s < numSections; s++ {
		secName := fmt.Sprintf("section_%d", s)
		fmt.Fprintf(&sb, "[%s]\n", secName)
		fmt.Fprintf(&sb, "; Comment for section %d\n", s)
		for k := 0; k < keysPerSection; k++ {
			key := fmt.Sprintf("key_%d", k)
			val := fmt.Sprintf("value_%d_%d", s, k)
			flatKey := secName + "." + key
			values[flatKey] = val + "_updated"

			switch k % 3 {
			case 0:
				fmt.Fprintf(&sb, "%s = %q ; inline comment\n", key, val)
			case 1:
				fmt.Fprintf(&sb, "%s = '%s'\n", key, val)
			default:
				fmt.Fprintf(&sb, "%s = %s\n", key, val)
			}
		}
		sb.WriteString("\n")
	}

	return []byte(sb.String()), values
}

func BenchmarkINIParser(b *testing.B) {
	content, _ := createBenchmarkINIData(20, 25) // 500 keys total
	p := INIParser{}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _, err := p.ParseWithContext(content)
		if err != nil {
			b.Fatalf("ParseWithContext failed: %v", err)
		}
	}
}

func BenchmarkINIMarshal(b *testing.B) {
	content, values := createBenchmarkINIData(20, 25) // 500 keys total

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, err := MarshalINI(content, values)
		if err != nil {
			b.Fatalf("MarshalINI failed: %v", err)
		}
	}
}
