package htmltagparity

import (
	"testing"
)

func BenchmarkFindAllTags(b *testing.B) {
	s := "<div><p>Hello <b>world</b>!</p><br/><img src=\"foo.png\" alt=\"bar\"><span>Test</span></div>"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = findAllTags(s)
	}
}

func BenchmarkMismatch(b *testing.B) {
	s1 := "<div><p>Hello <b>world</b>!</p><br/><img src=\"foo.png\" alt=\"bar\"><span>Test</span></div>"
	s2 := "<div><p>Hello <b>world</b>!</p><br/><img src=\"foo.png\" alt=\"bar\"><span>Tost</span></div>"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Mismatch(s1, s2)
	}
}

func BenchmarkMismatchIdentical(b *testing.B) {
	s := "<div><p>Hello <b>world</b>!</p><br/><img src=\"foo.png\" alt=\"bar\"><span>Test</span></div>"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Mismatch(s, s)
	}
}
