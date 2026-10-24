package main

import (
	"fmt"
	"testing"
)

func BenchmarkPublicTranslationMarshal(b *testing.B) {
	for _, size := range []int{100, 1000, 5000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			object := newPublicTranslationObject()
			for i := 0; i < size; i++ {
				object.set(fmt.Sprintf("key.%05d", i), fmt.Sprintf("Hello %d <script>&</script>", i))
				if i%10 == 0 {
					object.set(fmt.Sprint(i), fmt.Sprintf("indexed %d", i))
				}
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				out := object.marshal()
				if len(out) == 0 {
					b.Fatal("empty marshal")
				}
			}
		})
	}
}

func BenchmarkPublicTranslationFilename(b *testing.B) {
	paths := []string{
		"locales/en.json",
		"a/b/en-fr.json",
		"x.tar.gz",
		"café/übersicht.json",
		"with space/file name.po",
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, path := range paths {
			_ = publicTranslationFilename(path, "fr")
		}
	}
}

func BenchmarkEncodeURIComponent(b *testing.B) {
	values := []string{"en-fr.json", "a b.json", "café-fr.json", "😀.json", `x;y=z,"q".json`}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			_ = encodeURIComponent(value)
		}
	}
}

func BenchmarkIsLottieTranslationSource(b *testing.B) {
	keys := []string{
		"layers[0].t.d.k[0].s.t",
		"layers[1].t.d.k[0].s.t",
		"assets[0].layers[2].t.d.k[0].s.t",
	}
	b.ReportAllocs()
	for b.Loop() {
		if !isLottieTranslationSource("anim.json", keys) {
			b.Fatal("expected lottie source")
		}
	}
}
