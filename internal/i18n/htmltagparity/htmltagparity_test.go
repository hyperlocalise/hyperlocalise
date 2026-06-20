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
	tests := []struct {
		name string
		src  string
		tgt  string
		want bool
	}{
		{
			name: "identical path token with known atom",
			src:  "Use `bedrock` in `llm.profiles.<name>.provider`.",
			tgt:  "Sử dụng 'bedrock' trong 'llm.profiles.<name>.provider'.",
			want: false,
		},
		{
			name: "removed path token with known atom",
			src:  "Use `bedrock` in `llm.profiles.<name>.provider`.",
			tgt:  "Sử dụng 'bedrock' trong 'llm.profiles.provider'.",
			want: false,
		},
		{
			name: "removed path token with underscore",
			src:  "See `api/<version_1>`.",
			tgt:  "Xem `api/`.",
			want: false,
		},
		{
			name: "removed path token with dot",
			src:  "Replace `<my.var>`.",
			tgt:  "Thay thế.",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Mismatch(tt.src, tt.tgt); got != tt.want {
				t.Errorf("%s: Mismatch() = %v, want %v", tt.name, got, tt.want)
			}
		})
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
			name: "custom tags are treated as markup",
			src:  "Hello <not-a-tag>world</not-a-tag>",
			tgt:  "Bonjour world",
			want: true,
		},
		{
			name: "mdx component tags are treated as markup",
			src:  "Hello <Badge>world</Badge>",
			tgt:  "Bonjour world",
			want: true,
		},
		{
			name: "img tags with different attributes",
			src:  "<img src=\"/a.png\">",
			tgt:  "<img src=\"/b.png\" alt=\"image\">",
			want: false,
		},
		{
			name: "namespaced tags are treated as markup",
			src:  "Hello <ui:button>world</ui:button>",
			tgt:  "Bonjour world",
			want: true,
		},
		{
			name: "ignores path-like tokens that are known atoms",
			src:  "Path <id> and <name>",
			tgt:  "Path <id> and <name>",
			want: false,
		},
		{
			name: "greater-than sign in quoted attribute does not terminate tag",
			src:  `<div title="a > b">content</div>`,
			tgt:  `<div title="something">content</div>`,
			want: false,
		},
		{
			name: "tag-like content in quoted attribute is ignored",
			src:  `<div title=" > <br/> ">content</div>`,
			tgt:  `<div title="something">content</div>`,
			want: false,
		},
		{
			name: "tag with digit without attributes is treated as placeholder and ignored",
			src:  "Hello <tag1>world</tag1>",
			tgt:  "Bonjour world",
			want: false,
		},
		{
			name: "tag with dot without attributes is treated as placeholder and ignored",
			src:  "Hello <my.component>world</my.component>",
			tgt:  "Bonjour world",
			want: false,
		},
		{
			name: "tag with underscore without attributes is treated as placeholder and ignored",
			src:  "Hello <my_tag>world</my_tag>",
			tgt:  "Bonjour world",
			want: false,
		},
		{
			name: "MDX component with dot is protected",
			src:  "Hello <My.Component>world</My.Component>",
			tgt:  "Bonjour world",
			want: true,
		},
		{
			name: "custom tags with digits/dots/underscores should match if preserved",
			src:  "<tag1><a.b><c_d>Content</c_d></a.b></tag1>",
			tgt:  "<tag1><a.b><c_d>Contenu</c_d></a.b></tag1>",
			want: false,
		},
		{
			name: "custom tag with dot and attributes is protected",
			src:  "<tag.name attr=\"val\">Content</tag.name>",
			tgt:  "Content",
			want: true,
		},
		{
			name: "placeholder with normal self-closing is ignored",
			src:  "Hello <v1/>",
			tgt:  "Bonjour",
			want: false,
		},
		{
			name: "placeholder with space before self-closing is ignored",
			src:  "Hello <v1 />",
			tgt:  "Bonjour",
			want: false,
		},
		{
			name: "placeholder with space after slash (flexible self-closing) is ignored",
			src:  "Hello <v1 / >",
			tgt:  "Bonjour",
			want: false,
		},
		{
			name: "known tag with flexible self-closing is protected",
			src:  "Hello <br / >",
			tgt:  "Bonjour",
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Mismatch(tt.src, tt.tgt); got != tt.want {
				t.Errorf("%s: Mismatch() = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}
