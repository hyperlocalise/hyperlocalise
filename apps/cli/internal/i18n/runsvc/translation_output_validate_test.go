package runsvc

import (
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestTranslationOutputKindForSourcePath(t *testing.T) {
	tests := []struct {
		path string
		want segmentvalidate.FormatKind
	}{
		{"/content/en/guide.md", segmentvalidate.FormatMarkdown},
		{"file.markdown", segmentvalidate.FormatMarkdown},
		{"/docs/guide.adoc", segmentvalidate.FormatAsciiDoc},
		{"/srv/page.html", segmentvalidate.FormatHTML},
		{"file.htm", segmentvalidate.FormatHTML},
		{"captions.srt", segmentvalidate.FormatHTML},
		{"captions.vtt", segmentvalidate.FormatWebVTT},
		{"captions.sbv", segmentvalidate.FormatHTML},
		{"icon.svg", segmentvalidate.FormatHTML},
		{"messages.toml", segmentvalidate.FormatICUInvariant},
		{"messages.tsv", segmentvalidate.FormatICUInvariant},
		{"/srv/sections/header.liquid", segmentvalidate.FormatLiquid},
		{"/pkg/messages.json", segmentvalidate.FormatICUInvariant},
	}
	for _, tt := range tests {
		if got := segmentvalidate.KindForSourcePath(tt.path); got != tt.want {
			t.Fatalf("KindForSourcePath(%q) = %v, want %v", tt.path, got, tt.want)
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
			name:        "json_icu_placeholder_mismatch",
			path:        "/pkg/en.json",
			source:      "Hello {name}",
			translated:  "Hi {user}",
			wantErr:     true,
			errContains: "placeholder parity",
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

func TestAcceptTranslatedOutputRecoversIntercomLinks(t *testing.T) {
	raw := []byte("part of a live [Help Center](https://example.com/a) and in a [collection.](https://example.com/b)\n")
	entries, err := (translationfileparser.MarkdownParser{}).Parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	var protected string
	for _, value := range entries {
		protected = value
	}
	if !strings.Contains(protected, "\x1eHLMDPH_") {
		t.Fatalf("expected parse to wire links, got %q", protected)
	}

	accepted, err := acceptTranslatedOutput(
		Task{SourcePath: "intercom/help-center/article.md", SourceText: protected},
		strings.TrimSuffix(string(raw), "\n"),
	)
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	if !strings.Contains(accepted, "\x1eHLMDPH_") {
		t.Fatalf("expected recovered tokens, got %q", accepted)
	}
}

func TestValidationErrorFromSegment(t *testing.T) {
	invariantErr := validationErrorFromSegment(segmentvalidate.FirstValidationError("", "Hello {name}", "Hi {user}"))
	if _, ok := invariantErr.(*invariantViolationError); !ok {
		t.Fatalf("expected invariantViolationError, got %T", invariantErr)
	}

	postErr := validationErrorFromSegment(segmentvalidate.FirstValidationError("/a.md", "Hello.", "Bonjour.\n\n# Bad"))
	if _, ok := postErr.(*postTranslateValidationError); !ok {
		t.Fatalf("expected postTranslateValidationError, got %T", postErr)
	}
}
