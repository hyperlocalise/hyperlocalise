package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

// Scout coverage for Bolt #1799: IndexAny-based string/template scanners,
// ASCII identifier/whitespace fast-paths, and the early quote/`/` gate before
// skipJSTSIgnoredToken. These edges guard decode/skip regressions that would
// corrupt locale module round-trips.
func TestJSTSLocaleModuleParserBoltScannerEdgesScout(t *testing.T) {
	t.Parallel()

	t.Run("nested template interpolation before export still finds locale object", func(t *testing.T) {
		t.Parallel()
		// Exercises skipJSTSStringLiteral's end+1 advance after ${...} so the
		// closing quote is not consumed as part of the interpolation span.
		content := []byte("const note = `before ${fn({ nested: `{inner}` })} after`;\n" +
			"export default {\n  hello: \"Hello\",\n};\n")
		got, err := (JSTSLocaleModuleParser{}).Parse(content)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		if got["hello"] != "Hello" {
			t.Fatalf("entries mismatch: %#v", got)
		}
	})

	t.Run("static template and escaped interpolation decode", func(t *testing.T) {
		t.Parallel()
		content := []byte("export default {\n" +
			"  plain: `Terms & conditions`,\n" +
			"  escaped: `Use \\${name}`,\n" +
			"  dollar: `price $5`,\n" +
			"};\n")
		got, err := (JSTSLocaleModuleParser{}).Parse(content)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		want := map[string]string{
			"plain":   "Terms & conditions",
			"escaped": "Use ${name}",
			"dollar":  "price $5",
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("entries mismatch:\ngot  %#v\nwant %#v", got, want)
		}
	})

	t.Run("escaped quotes newlines and hex decode on non-fast-path", func(t *testing.T) {
		t.Parallel()
		content := []byte("export default {\n" +
			"  single: 'L\\'offre\\narrive',\n" +
			"  double: \"line\\tbreak\\x21\",\n" +
			"  empty: \"\",\n" +
			"};\n")
		got, err := (JSTSLocaleModuleParser{}).Parse(content)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		want := map[string]string{
			"single": "L'offre\narrive",
			"double": "line\tbreak!",
			"empty":  "",
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("entries mismatch:\ngot  %#v\nwant %#v", got, want)
		}
	})

	t.Run("vertical tab and form feed count as whitespace before export", func(t *testing.T) {
		t.Parallel()
		content := []byte("\v\fexport\vdefault\f{\n  hello: \"Hello\",\n};\n")
		got, err := (JSTSLocaleModuleParser{}).Parse(content)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		if got["hello"] != "Hello" {
			t.Fatalf("entries mismatch: %#v", got)
		}
	})

	t.Run("ascii keyword boundaries reject glued identifiers", func(t *testing.T) {
		t.Parallel()
		src := "const exportfoo = 1;\nmodule.exports = { hello: \"Hello\" };\n"
		if hasJSTSKeywordAt(src, strings.Index(src, "export"), "export") {
			t.Fatal("did not expect export keyword match inside exportfoo")
		}
		if !hasJSTSKeywordAt(src, strings.Index(src, "module"), "module") {
			t.Fatal("expected module keyword match")
		}
	})

	t.Run("division after string is not treated as regex before export", func(t *testing.T) {
		t.Parallel()
		content := []byte(`const ratio = "http://example.com".length / 2;

export default {
  hello: "Hello",
};
`)
		got, err := (JSTSLocaleModuleParser{}).Parse(content)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		if got["hello"] != "Hello" {
			t.Fatalf("entries mismatch: %#v", got)
		}
	})

	t.Run("rejects unterminated and interpolated template values", func(t *testing.T) {
		t.Parallel()
		cases := []struct {
			name    string
			content string
			want    string
		}{
			{
				name:    "unterminated double quote collapses object span",
				content: "export default { hello: \"Hello };\n",
				want:    "unterminated object literal",
			},
			{
				name:    "interpolated template value",
				content: "export default { hello: `Hi ${name}` };\n",
				want:    "interpolated template literals",
			},
			{
				name:    "dangling escape collapses object span",
				content: "export default { hello: \"Hello\\\" };\n",
				want:    "unterminated object literal",
			},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				t.Parallel()
				_, err := (JSTSLocaleModuleParser{}).Parse([]byte(tc.content))
				if err == nil {
					t.Fatal("expected parse error")
				}
				if !strings.Contains(err.Error(), tc.want) {
					t.Fatalf("expected error containing %q, got %v", tc.want, err)
				}
			})
		}
	})
}

func TestSkipJSTSStringLiteralNestedInterpolationScout(t *testing.T) {
	t.Parallel()

	src := "`outer ${a({ b: `inner ${c}` })} tail`"
	end := skipJSTSStringLiteral(src, 0)
	if end != len(src) {
		t.Fatalf("skipJSTSStringLiteral end = %d, want %d (src=%q)", end, len(src), src)
	}

	// A following quote must not be absorbed when the nested ${} closes.
	padded := src + `,"next"`
	end = skipJSTSStringLiteral(padded, 0)
	if end != len(src) {
		t.Fatalf("skip after nested template = %d, want %d", end, len(src))
	}
}

func TestParseJSTSStringLiteralFastPathAndEscapesScout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		src  string
		want string
	}{
		{name: "simple double fast-path", src: `"hello"`, want: "hello"},
		{name: "simple single fast-path", src: `'hello'`, want: "hello"},
		{name: "simple template fast-path", src: "`hello`", want: "hello"},
		{name: "escaped single", src: `'a\'b'`, want: "a'b"},
		{name: "escaped double", src: `"a\"b"`, want: `a"b`},
		{name: "escaped template dollar", src: "`a\\${b}`", want: "a${b}"},
		{name: "hex escape", src: `"\x41\x42"`, want: "AB"},
		{name: "unicode codepoint", src: `"\u{1F600}"`, want: "\U0001F600"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseJSTSStringLiteral(tc.src, 0)
			if err != nil {
				t.Fatalf("parseJSTSStringLiteral: %v", err)
			}
			if got.decoded != tc.want {
				t.Fatalf("decoded = %q, want %q (raw=%q)", got.decoded, tc.want, got.raw)
			}
			if got.end != len(tc.src) {
				t.Fatalf("end = %d, want %d", got.end, len(tc.src))
			}
		})
	}

	reject := []struct {
		name string
		src  string
		want string
	}{
		{name: "unterminated double", src: `"hello`, want: "unterminated string literal"},
		{name: "newline in single", src: "'hello\n'", want: "unterminated string literal"},
		{name: "dangling escape", src: `"hello\`, want: "dangling escape"},
		{name: "interpolated template", src: "`hi ${name}`", want: "interpolated template literals"},
	}
	for _, tc := range reject {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := parseJSTSStringLiteral(tc.src, 0)
			if err == nil {
				t.Fatal("expected parse error")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected error containing %q, got %v", tc.want, err)
			}
		})
	}
}
