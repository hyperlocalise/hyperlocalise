package translationfileparser

import (
	"strings"
	"testing"
)

func TestEncodeJavaPropertiesKeyEscapesBoundaries(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "fast path plain ascii", in: "welcome.message", want: "welcome.message"},
		{name: "space", in: "key with spaces", want: `key\ with\ spaces`},
		{name: "equals and colon", in: "a=b:c", want: `a\=b\:c`},
		{name: "comment markers", in: "a#b!c", want: `a\#b\!c`},
		{name: "backslash", in: `path\to`, want: `path\\to`},
		{name: "control chars", in: "a\tb\nc\rd\fe", want: `a\tb\nc\rd\fe`},
		{name: "low control rune", in: "bell\x07tone", want: `bell\u0007tone`},
		{name: "non-bmp emoji", in: "face\U0001F600", want: `face\uD83D\uDE00`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := encodeJavaPropertiesKey(tc.in); got != tc.want {
				t.Fatalf("encodeJavaPropertiesKey(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestEncodeJavaPropertiesValueEscapesBoundaries(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "fast path plain ascii", in: "Hello world", want: "Hello world"},
		{name: "preserves interior and trailing spaces", in: "Hello world ", want: "Hello world "},
		{name: "escapes leading spaces only", in: "  padded", want: `\ \ padded`},
		{name: "does not escape mid-string comment markers", in: "see #note!", want: "see #note!"},
		{name: "backslash", in: `C:\Temp`, want: `C:\\Temp`},
		{name: "control chars", in: "a\tb\nc\rd\fe", want: `a\tb\nc\rd\fe`},
		{name: "low control rune", in: "bell\x07tone", want: `bell\u0007tone`},
		{name: "non-bmp emoji", in: "Face \U0001F600", want: `Face \uD83D\uDE00`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := encodeJavaPropertiesValue(tc.in); got != tc.want {
				t.Fatalf("encodeJavaPropertiesValue(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestWriteJavaPropertiesEscapedRune(t *testing.T) {
	t.Parallel()

	var b strings.Builder
	if !writeJavaPropertiesEscapedRune(&b, '\x01') {
		t.Fatal("expected control rune to be escaped")
	}
	if got := b.String(); got != `\u0001` {
		t.Fatalf("control escape = %q, want \\u0001", got)
	}

	b.Reset()
	if !writeJavaPropertiesEscapedRune(&b, '\U0001F600') {
		t.Fatal("expected non-BMP rune to be escaped")
	}
	if got := b.String(); got != `\uD83D\uDE00` {
		t.Fatalf("surrogate escape = %q, want \\uD83D\\uDE00", got)
	}

	b.Reset()
	if writeJavaPropertiesEscapedRune(&b, 'A') {
		t.Fatal("expected printable BMP rune to pass through")
	}
	if got := b.String(); got != "" {
		t.Fatalf("printable BMP should not write, got %q", got)
	}
}
