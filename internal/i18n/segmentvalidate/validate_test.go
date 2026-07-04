package segmentvalidate

import (
	"strings"
	"testing"
)

var testHLMDPHToken = "\x1eHLMDPH_ABCDEF0123456789_1\x1f"

func TestKindForSourcePath(t *testing.T) {
	tests := []struct {
		path string
		want FormatKind
	}{
		{"/content/en/guide.md", FormatMarkdown},
		{`/docs\Page.mdx`, FormatMarkdown},
		{"C:\\docs\\en\\x.MDX", FormatMarkdown},
		{"/srv/page.html", FormatHTML},
		{"/srv/sections/header.liquid", FormatLiquid},
		{"/pkg/messages.json", FormatICUInvariant},
		{"/pkg/strings.arb", FormatICUInvariant},
		{"noext", FormatICUInvariant},
	}
	for _, tt := range tests {
		if got := KindForSourcePath(tt.path); got != tt.want {
			t.Fatalf("KindForSourcePath(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestFirstValidationErrorMatrix(t *testing.T) {
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
			name:        "markdown_single_line_injected_heading",
			path:        "/en/a.md",
			source:      "Hello.",
			translated:  "Bonjour.\n\n# Bad",
			wantErr:     true,
			errContains: "structure",
		},
		{
			name:       "markdown_multiline_source_skips_block_heuristic",
			path:       "/en/a.md",
			source:     "Line1\nLine2",
			translated: "L1\n\n# X",
			wantErr:    false,
		},
		{
			name:        "markdown_raw_html_fragment",
			path:        "/en/a.md",
			source:      "Hello.",
			translated:  "Bonjour <img src=x onerror=alert(1)//",
			wantErr:     true,
			errContains: "raw HTML",
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
			name:        "html_raw_html_fragment",
			path:        "/en/a.html",
			source:      "Hello",
			translated:  "Bonjour <img src=x onerror=alert(1)//",
			wantErr:     true,
			errContains: "raw HTML",
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
			name:       "liquid_placeholders_ok_then_icu_ok",
			path:       "/en/a.liquid",
			source:     "Hello \x1eHLLQPH_ABCDEF123456_0\x1f {name}",
			translated: "Bonjour \x1eHLLQPH_ABCDEF123456_0\x1f {name}",
			wantErr:    false,
		},
		{
			name:        "liquid_placeholder_mismatch",
			path:        "/en/a.liquid",
			source:      "Hello \x1eHLLQPH_ABCDEF123456_0\x1f",
			translated:  "Bonjour",
			wantErr:     true,
			errContains: "liquid internal placeholder",
		},
		{
			name:        "liquid_raw_html_fragment",
			path:        "/en/a.liquid",
			source:      "Hello \x1eHLLQPH_ABCDEF123456_0\x1f",
			translated:  "Bonjour \x1eHLLQPH_ABCDEF123456_0\x1f <img src=x onerror=alert(1)//",
			wantErr:     true,
			errContains: "raw HTML",
		},
		{
			name:        "liquid_placeholders_ok_icu_fails",
			path:        "/en/a.liquid",
			source:      "Hello \x1eHLLQPH_ABCDEF123456_0\x1f {name}",
			translated:  "Bonjour \x1eHLLQPH_ABCDEF123456_0\x1f {wrong}",
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
			err := FirstValidationError(tt.path, tt.source, tt.translated)
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

func TestValidateSegmentPassAndFail(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Hello {name}",
		TargetText: "Hi {name}",
		SourcePath: "/pkg/en.json",
	})
	if len(checks) != 1 || checks[0].Status != StatusPass {
		t.Fatalf("expected pass check, got %+v", checks)
	}

	checks = ValidateSegment(Request{
		SourceText: "Hello {name}",
		TargetText: "Hi {user}",
		SourcePath: "/pkg/en.json",
	})
	if len(checks) != 1 || checks[0].Status != StatusFail {
		t.Fatalf("expected fail check, got %+v", checks)
	}

	checks = ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "Hello world!",
		SourcePath: "/pkg/en.json",
		MaxLength:  5,
	})
	if len(checks) != 2 {
		t.Fatalf("expected length + format checks, got %+v", checks)
	}
	if checks[0].ID != "length" || checks[0].Status != StatusFail {
		t.Fatalf("expected length failure first, got %+v", checks[0])
	}
}

func TestValidateForKindDispatches(t *testing.T) {
	tok := testHLMDPHToken
	if err := validateForKind(FormatMarkdown, "a"+tok, "a"); err == nil {
		t.Fatal("expected markdown mismatch error")
	}
	if err := validateForKind(FormatMarkdown, "a", "a"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
	if err := validateForKind(FormatHTML, "<p>a</p>", "<p>b</p>"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
	if err := validateForKind(FormatLiquid, "a \x1eHLLQPH_ABCDEF123456_0\x1f", "b \x1eHLLQPH_ABCDEF123456_0\x1f"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
	if err := validateForKind(FormatICUInvariant, "x {n}", "y {n}"); err != nil {
		t.Fatalf("unexpected %v", err)
	}
}
