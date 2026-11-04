package main

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkBuildMemoryEntryTsQuery(b *testing.B) {
	for _, words := range []int{1, 10, 50} {
		b.Run(fmt.Sprint(words), func(b *testing.B) {
			parts := make([]string, words)
			for i := range parts {
				parts[i] = fmt.Sprintf("w%d's-(x)", i)
			}
			input := strings.Join(parts, " ")
			b.ReportAllocs()
			b.SetBytes(int64(len(input)))
			b.ResetTimer()
			for b.Loop() {
				if buildMemoryEntryTsQuery(input) == "" {
					b.Fatal("empty query")
				}
			}
		})
	}
}

func BenchmarkMemoryEntryListWhere(b *testing.B) {
	filters := memoryEntryListFilters{
		Search: "checkout button", SourceLocale: "en-US", TargetLocale: "fr-FR", ReviewStatus: "approved",
		SameAsSource: "true", Origin: "import", Provider: "deepl", CreatedByUserID: memoryUnitUserID,
		ModifiedFrom: "2026-01-01T00:00:00Z", ModifiedTo: "2026-02-01T00:00:00Z", ImportBatchID: memoryUnitBatchID,
		Sort: "updated_at", SortDir: "asc",
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, args, err := memoryEntryListWhere(memoryUnitMemoryID, filters); err != nil || len(args) != 12 {
			b.Fatalf("args=%d err=%v", len(args), err)
		}
	}
}

func BenchmarkMemoryEntryListCursor(b *testing.B) {
	filters := memoryEntryListFilters{Search: "hello", Sort: "created_at", SortDir: "desc"}
	cursor := encodeMemoryEntryListCursor(filters, "2026-01-02T03:04:05.000000Z", memoryUnitEntryID)
	b.Run("encode", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			if encodeMemoryEntryListCursor(filters, "2026-01-02T03:04:05.000000Z", memoryUnitEntryID) != cursor {
				b.Fatal("cursor changed")
			}
		}
	})
	b.Run("decode", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			if _, err := decodeMemoryEntryListCursor(cursor, filters); err != nil {
				b.Fatal(err)
			}
		}
	})
}
