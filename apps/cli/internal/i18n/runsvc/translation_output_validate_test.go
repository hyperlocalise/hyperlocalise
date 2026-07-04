package runsvc

import (
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)

func TestTranslationOutputKindForSourcePath(t *testing.T) {
	tests := []struct {
		path string
		want segmentvalidate.FormatKind
	}{
		{"/content/en/guide.md", segmentvalidate.FormatMarkdown},
		{"/srv/page.html", segmentvalidate.FormatHTML},
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
