package runsvc

import (
	"strings"
	"testing"
)

func TestTranslationOutputKindForSourcePath(t *testing.T) {
	tests := []struct {
		path string
		want translationOutputKind
	}{
		{"/content/en/guide.md", translationOutputMarkdown},
		{`/docs\Page.mdx`, translationOutputMarkdown},
		{"C:\\docs\\en\\x.MDX", translationOutputMarkdown},
		{"/srv/page.html", translationOutputHTML},
		{"/pkg/messages.json", translationOutputICUInvariant},
		{"/pkg/strings.arb", translationOutputICUInvariant},
		{"noext", translationOutputICUInvariant},
	}
	for _, tt := range tests {
		if got := translationOutputKindForSourcePath(tt.path); got != tt.want {
			t.Fatalf("translationOutputKindForSourcePath(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestValidateTranslatedOutputMatrix(t *testing.T) {
	tok := testHLMDPHToken
	tests := []struct {
		name        string
		path        string
		source      string
		translated  string
		wantErr     bool
		errContains string
	}{
		{
			name:       "markdown_hlmdph_ok",
			path:       "/en/a.md",
			source:     "A " + tok + " B",
			translated: "AA " + tok + " BB",
			wantErr:    false,
		},
		{
			name:        "markdown_hlmdph_mismatch",
			path:        "/en/a.md",
			source:      "A " + tok + " B",
			translated:  "A B",
			wantErr:     true,
			errContains: "placeholder",
		},
		{
			name:       "markdown_skips_icu_even_if_invalid_message_shape",
			path:       "/en/a.md",
			source:     "{not, valid icu",
			translated: "{still bad",
			wantErr:    false,
		},
		{
			name:       "html_tags_ok_then_icu_ok",
			path:       "/en/a.html",
			source:     "<p>Hello {name}</p>",
			translated: "<p>Bonjour {name}</p>",
			wantErr:    false,
		},
		{
			name:        "html_tag_mismatch",
			path:        "/en/a.html",
			source:      "<p>x</p>",
			translated:  "x",
			wantErr:     true,
			errContains: "html tag",
		},
		{
			name:        "html_tags_ok_icu_fails",
			path:        "/en/a.html",
			source:      "<p>Hello {name}</p>",
			translated:  "<p>Bonjour {wrong}</p>",
			wantErr:     true,
			errContains: "placeholder parity",
		},
		{
			name:       "json_icu_ok",
			path:       "/pkg/en.json",
			source:     "Hello {name}",
			translated: "Hi {name}",
			wantErr:    false,
		},
		{
			name:        "json_icu_placeholder_mismatch",
			path:        "/pkg/en.json",
			source:      "Hello {name}",
			translated:  "Hi {user}",
			wantErr:     true,
			errContains: "placeholder parity",
		},
		{
			name:       "json_plain_no_icu_structure",
			path:       "/pkg/en.json",
			source:     "plain",
			translated: "texte",
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTranslatedOutput(Task{SourcePath: tt.path, SourceText: tt.source}, tt.translated)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				if tt.errContains != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.errContains)) {
					t.Fatalf("error = %v, want substring %q", err, tt.errContains)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateTranslatedOutputForKindDispatches(t *testing.T) {
	tok := testHLMDPHToken
	if err := validateTranslatedOutputForKind(translationOutputMarkdown, "a"+tok, "a"); err == nil {
		t.Fatal("expected markdown mismatch error")
	}
	if err := validateTranslatedOutputForKind(translationOutputMarkdown, "a", "a"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
	if err := validateTranslatedOutputForKind(translationOutputHTML, "<p>a</p>", "<p>b</p>"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
	if err := validateTranslatedOutputForKind(translationOutputICUInvariant, "x {n}", "y {n}"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
}
