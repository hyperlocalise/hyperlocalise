package htmltagparity

import "testing"

func TestMismatchEqualTags(t *testing.T) {
	src := `Hello <strong>world</strong>`
	tgt := `Bonjour <strong>monde</strong>`
	if Mismatch(src, tgt) {
		t.Fatalf("expected no mismatch for same tag skeleton")
	}
}

func TestMismatchExtraTag(t *testing.T) {
	src := `Hello <b>world</b>`
	tgt := `Bonjour <b>monde</b> <br/>`
	if !Mismatch(src, tgt) {
		t.Fatalf("expected mismatch when target has extra tag")
	}
}

func TestMismatchClosingVsOpening(t *testing.T) {
	src := `<b>bold</b>`
	tgt := `<b>bold<b>`
	if !Mismatch(src, tgt) {
		t.Fatalf("expected mismatch when closing tag is replaced by opening tag")
	}
}

func TestMismatchReorderedTags(t *testing.T) {
	src := `<p><span>a</span><em>b</em></p>`
	tgt := `<p><em>b</em><span>a</span></p>`
	if !Mismatch(src, tgt) {
		t.Fatalf("expected mismatch when tag order differs")
	}
}

func TestMismatchPlainText(t *testing.T) {
	if Mismatch("hello", "bonjour") {
		t.Fatalf("plain text should not mismatch")
	}
}

func TestMismatchIgnoresAngleBracketPathTokens(t *testing.T) {
	src := "Use `bedrock` in `llm.profiles.<name>.provider`."
	tgt := "Sử dụng 'bedrock' trong 'llm.profiles.<name>.provider'."
	if Mismatch(src, tgt) {
		t.Fatalf("expected <name> in paths not to count as HTML tags")
	}
}

func TestMismatchFormattingAndKnownTags(t *testing.T) {
	tests := []struct {
		name string
		src  string
		tgt  string
		want bool
	}{
		{
			name: "multiline tag and attributes",
			src:  "Hello <strong\n  class=\"foo\">world</strong>",
			tgt:  "Bonjour <strong class=\"foo\">monde</strong>",
			want: false,
		},
		{
			name: "case-insensitive matching",
			src:  "Hello <STRONG>world</STRONG>",
			tgt:  "Bonjour <strong>monde</strong>",
			want: false,
		},
		{
			name: "self-closing variations",
			src:  "Hello <br/> world <br>",
			tgt:  "Bonjour <br> monde <br />",
			want: false,
		},
		{
			name: "heading tags",
			src:  "<h1>Title</h1>",
			tgt:  "<h1>Titre</h1>",
			want: false,
		},
		{
			name: "whitespace in closing tags",
			src:  "Hello <strong>world</strong >",
			tgt:  "Bonjour <strong>monde</strong>",
			want: false,
		},
		{
			name: "unknown tags are ignored in both",
			src:  "Hello <not-a-tag>world</not-a-tag>",
			tgt:  "Bonjour world",
			want: false,
		},
		{
			name: "img tags with different attributes",
			src:  "<img src=\"/a.png\">",
			tgt:  "<img src=\"/b.png\" alt=\"image\">",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Mismatch(tt.src, tt.tgt); got != tt.want {
				t.Errorf("Mismatch() = %v, want %v", got, tt.want)
			}
		})
	}
}
