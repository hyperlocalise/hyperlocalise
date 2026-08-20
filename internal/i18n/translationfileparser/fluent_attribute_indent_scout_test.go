package translationfileparser

import (
	"testing"
)

func TestFluentAttributeContinuationIndentScout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		line string
		want string
	}{
		{
			name: "common four-space attribute header",
			line: "    .title = Hyperlocalise",
			want: "        ",
		},
		{
			name: "empty indent falls back to eight spaces",
			line: ".title = Hyperlocalise",
			want: "        ",
		},
		{
			name: "two-space indent grows by four",
			line: "  .title = Hyperlocalise",
			want: "      ",
		},
		{
			name: "tab indent preserves tab prefix",
			line: "\t.title = Hyperlocalise",
			want: "\t    ",
		},
		{
			name: "eight-space indent grows by four",
			line: "        .title = Nested",
			want: "            ",
		},
		{
			name: "mixed spaces then tab uses full leading whitespace width",
			line: "  \t.title = Mixed",
			want: "  \t    ",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := fluentAttributeContinuationIndent(tc.line); got != tc.want {
				t.Fatalf("fluentAttributeContinuationIndent(%q) = %q, want %q", tc.line, got, tc.want)
			}
		})
	}
}

func TestFormatFluentCommentsScout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		comments []string
		want     string
	}{
		{name: "empty slice", comments: nil, want: ""},
		{name: "empty strings only", comments: []string{"", ""}, want: ""},
		{name: "single comment", comments: []string{"Greeting"}, want: "Greeting"},
		{
			name:     "joins non-empty comments and skips blanks",
			comments: []string{"First", "", "Second", "Third"},
			want:     "First\nSecond\nThird",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := formatFluentComments(tc.comments); got != tc.want {
				t.Fatalf("formatFluentComments(%#v) = %q, want %q", tc.comments, got, tc.want)
			}
		})
	}
}

func TestFluentParserPreservesMultilineAttributeContinuationIndentScout(t *testing.T) {
	t.Parallel()

	values, err := FluentParser{}.Parse([]byte(`brand =
    .title = First line
        continuation
`))
	if err != nil {
		t.Fatalf("parse fluent: %v", err)
	}
	if got, want := values["brand.title"], "First line\ncontinuation"; got != want {
		t.Fatalf("parsed multiline attribute mismatch\n got: %q\nwant: %q", got, want)
	}

	marshaled, err := MarshalFluent([]byte(`brand =
    .title = First line
        continuation
`), map[string]string{
		"brand.title": "Premier ligne\ncontinuation",
	})
	if err != nil {
		t.Fatalf("marshal fluent: %v", err)
	}

	want := `brand =
    .title = Premier ligne
        continuation
`
	if string(marshaled) != want {
		t.Fatalf("marshaled multiline attribute indent mismatch\n got: %q\nwant: %q", string(marshaled), want)
	}
}
