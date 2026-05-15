package translationfileparser

import "testing"

func TestIsTranslatableChunk(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{
			name: "basic ASCII letters",
			in:   "Hello",
			want: true,
		},
		{
			name: "ASCII numbers",
			in:   "123",
			want: true,
		},
		{
			name: "mixed letters and numbers",
			in:   "User123",
			want: true,
		},
		{
			name: "UTF-8 letters (French)",
			in:   "café",
			want: true,
		},
		{
			name: "UTF-8 letters (Greek)",
			in:   "Ωμέγα",
			want: true,
		},
		{
			name: "punctuation only",
			in:   "!@#$%^&*()",
			want: false,
		},
		{
			name: "whitespace only",
			in:   "  \t\n  ",
			want: false,
		},
		{
			name: "empty string",
			in:   "",
			want: false,
		},
		{
			name: "letters with punctuation",
			in:   "Hello!",
			want: true,
		},
		{
			name: "emojis only",
			in:   "👋🚀",
			want: false,
		},
		{
			name: "mixed letters and emojis",
			in:   "Hello 👋",
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTranslatableChunk(tt.in); got != tt.want {
				t.Errorf("isTranslatableChunk(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestPreserveChunkBoundaryWhitespace(t *testing.T) {
	tests := []struct {
		name       string
		source     string
		translated string
		want       string
	}{
		{
			name:       "no boundary whitespace",
			source:     "Hello",
			translated: "Bonjour",
			want:       "Bonjour",
		},
		{
			name:       "leading space in source",
			source:     " Hello",
			translated: "Bonjour",
			want:       " Bonjour",
		},
		{
			name:       "trailing space in source",
			source:     "Hello ",
			translated: "Bonjour",
			want:       "Bonjour ",
		},
		{
			name:       "leading and trailing space in source",
			source:     " Hello ",
			translated: "Bonjour",
			want:       " Bonjour ",
		},
		{
			name:       "multiple spaces and newlines in source",
			source:     "  \nHello \t ",
			translated: "Bonjour",
			want:       "  \nBonjour \t ",
		},
		{
			name:       "translated has its own whitespace (should be trimmed)",
			source:     " Hello ",
			translated: "  Bonjour  ",
			want:       " Bonjour ",
		},
		{
			name:       "translated is empty (should still keep source boundaries)",
			source:     " Hello ",
			translated: "",
			want:       "  ",
		},
		{
			name:       "source with only whitespace (doubles whitespace due to overlap)",
			source:     "   ",
			translated: "Something",
			want:       "   Something   ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := preserveChunkBoundaryWhitespace(tt.source, tt.translated); got != tt.want {
				t.Errorf("preserveChunkBoundaryWhitespace(%q, %q) = %q, want %q", tt.source, tt.translated, got, tt.want)
			}
		})
	}
}
