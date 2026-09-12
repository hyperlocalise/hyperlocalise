package srx

import "testing"

func TestFormatSupports(t *testing.T) {
	t.Parallel()
	cases := []struct {
		path string
		mode string
		want bool
	}{
		{path: "lang/en.json", want: true},
		{path: "docs/guide.md", want: true},
		{path: "emails/welcome.html", want: true},
		{path: "strings.xml", want: true},
		{path: "catalog.xliff", want: false},
		{path: "messages.po", want: false},
		{path: "captions.srt", want: false},
		{path: "captions.vtt", want: false},
		{path: "Localizable.xcstrings", want: false},
		{path: "Localizable.stringsdict", want: false},
		{path: "messages.json", mode: "formatjs", want: false},
		{path: "app.arb", mode: "arb", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.path+"/"+tc.mode, func(t *testing.T) {
			t.Parallel()
			if got := FormatSupports(tc.path, tc.mode); got != tc.want {
				t.Fatalf("FormatSupports(%q, %q) = %v, want %v", tc.path, tc.mode, got, tc.want)
			}
		})
	}
}

func TestShouldSkipValue(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		text string
		mode string
		want bool
	}{
		{name: "plain prose", text: "Hello. Welcome back.", want: false},
		{name: "empty", text: "   ", want: true},
		{name: "icu placeholder", text: "Hello {name}.", want: true},
		{name: "icu plural", text: "{count, plural, one {# item} other {# items}}", want: true},
		{name: "printf", text: "Saved %s to disk.", want: true},
		{name: "positional printf", text: "Hello %1$s.", want: true},
		{name: "fluent var", text: "Hello { $name }.", want: true},
		{name: "formatjs mode", text: "Hello there.", mode: "formatjs", want: true},
		{name: "braces without placeholder", text: "Use { only as decoration. Next.", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := ShouldSkipValue(tc.text, tc.mode); got != tc.want {
				t.Fatalf("ShouldSkipValue(%q, %q) = %v, want %v", tc.text, tc.mode, got, tc.want)
			}
		})
	}
}
