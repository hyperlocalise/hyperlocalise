package main

import (
	"strings"
	"testing"
)

func BenchmarkCountNativeSourceWords(b *testing.B) {
	cases := []struct {
		name   string
		source string
	}{
		{name: "Plain", source: "Buy now and save on the launch offer."},
		{name: "HTML", source: "<b>Buy</b> now and <em>save</em> on the launch offer."},
		{name: "ICU", source: "{count, plural, one {One file is ready} other {# files are ready}} for {name}."},
		{name: "CJK", source: "你好世界。欢迎使用本地化平台。"},
		{name: "Mixed", source: strings.Repeat("Hello 世界 {{name}} {count, plural, other {many files}} ", 50)},
	}
	for _, bm := range cases {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(bm.source)))
			for b.Loop() {
				_ = countNativeSourceWords(bm.source)
			}
		})
	}
}
