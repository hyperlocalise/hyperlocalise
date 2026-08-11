package segmentvalidate

import "testing"

func TestKindForSourcePathExtended(t *testing.T) {
	tests := []struct {
		path string
		want FormatKind
	}{
		// Existing supported extensions
		{"file.md", FormatMarkdown},
		{"file.mdx", FormatMarkdown},
		{"file.html", FormatHTML},
		{"file.liquid", FormatLiquid},

		// Extended Markdown extensions
		{"file.markdown", FormatMarkdown},
		{"file.mdown", FormatMarkdown},
		{"file.mkdn", FormatMarkdown},
		{"file.mdwn", FormatMarkdown},
		{"file.mkd", FormatMarkdown},

		// Extended HTML extensions
		{"file.htm", FormatHTML},

		// Case sensitivity check for extended
		{"file.MARKDOWN", FormatMarkdown},
		{"file.HTM", FormatHTML},

		// Fallback
		{"file.json", FormatICUInvariant},
		{"file.txt", FormatICUInvariant},

		// Trailing space
		{"file.md ", FormatMarkdown},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := KindForSourcePath(tt.path); got != tt.want {
				t.Errorf("KindForSourcePath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
