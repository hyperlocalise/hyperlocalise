package main

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkDictionaryNormalizeWord(b *testing.B) {
	for _, word := range []string{"Hyperlocalise", "Cafe\u0301", "İstanbul", "品牌名称"} {
		b.Run(word, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(word)))
			for b.Loop() {
				if _, ok := normalizeDictionaryWord(word); !ok {
					b.Fatal("valid benchmark word rejected")
				}
			}
		})
	}
}

func BenchmarkDictionaryImportWords(b *testing.B) {
	for _, size := range []int{100, 5000, 20000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			var content strings.Builder
			for i := 0; i < size; i++ {
				fmt.Fprintf(&content, "Brand%d\nbrand%d\n# comment\n", i, i)
			}
			input := content.String()
			b.ReportAllocs()
			b.SetBytes(int64(len(input)))
			b.ResetTimer()
			for b.Loop() {
				words := parseDictionaryWords(input)
				if len(words) != size {
					b.Fatal("unexpected import word count")
				}
			}
		})
	}
}

func BenchmarkDictionaryResolveWords(b *testing.B) {
	for _, size := range []int{100, 5000, 20000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			rows := make([]dictionaryResolvedWord, size*2)
			for i := 0; i < size; i++ {
				word := fmt.Sprintf("Brand%05d", i)
				rows[i] = dictionaryResolvedWord{word: word, folded: strings.ToLower(word), dictionaryID: "a", priority: 0, createdAt: testDictionaryTime}
				rows[size+i] = dictionaryResolvedWord{word: strings.ToLower(word), folded: strings.ToLower(word), dictionaryID: "b", priority: 1, createdAt: testDictionaryTime}
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				words := mergeDictionaryWords(rows)
				if len(words) != min(size, dictionaryMaxResolvedWords) {
					b.Fatal("unexpected resolved word count")
				}
			}
		})
	}
}
