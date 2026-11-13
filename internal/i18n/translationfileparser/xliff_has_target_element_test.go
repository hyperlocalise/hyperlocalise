package translationfileparser

import "testing"

func TestHasXLIFFTargetElement(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    bool
	}{
		{
			name:    "bolt fast-path: no target substring",
			content: "<source>Hello</source></trans-unit>",
			want:    false,
		},
		{
			name:    "unprefixed target element",
			content: "<source>Hello</source><target>Bonjour</target></trans-unit>",
			want:    true,
		},
		{
			name:    "prefixed target element",
			content: `<source>Hello</source><x:target xmlns:x="urn:oasis:names:tc:xliff:document:1.2">Bonjour</x:target></trans-unit>`,
			want:    true,
		},
		{
			name:    "literal target only in comment",
			content: "<source>Hello</source><!-- <target>fake</target> --></trans-unit>",
			want:    false,
		},
		{
			name:    "literal target only in CDATA",
			content: "<source><![CDATA[<target>not-real</target>]]></source></trans-unit>",
			want:    false,
		},
		{
			name:    "target substring in source text without element",
			content: "<source>retarget the campaign</source></trans-unit>",
			want:    false,
		},
		{
			name:    "empty content",
			content: "",
			want:    false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := hasXLIFFTargetElement([]byte(tc.content))
			if got != tc.want {
				t.Fatalf("hasXLIFFTargetElement(%q) = %v, want %v", tc.content, got, tc.want)
			}
		})
	}
}
