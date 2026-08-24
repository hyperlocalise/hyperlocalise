package cmd

import (
	"bytes"
	"slices"
	"strings"
	"testing"
)

func TestResolveHyperlocaliseTargetLocales_Scout(t *testing.T) {
	configured := []string{"fr-FR", "de-DE", "ja-JP"}

	t.Run("empty requested list returns configured targets copy", func(t *testing.T) {
		got, err := resolveHyperlocaliseTargetLocales(configured, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !slices.Equal(got, configured) {
			t.Errorf("got %#v, want %#v", got, configured)
		}
	})

	t.Run("trims whitespace and deduplicates valid requested locales", func(t *testing.T) {
		requested := []string{" fr-FR ", "de-DE", "fr-FR  ", "  de-DE"}
		got, err := resolveHyperlocaliseTargetLocales(configured, requested)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := []string{"fr-FR", "de-DE"}
		if !slices.Equal(got, want) {
			t.Errorf("got %#v, want %#v", got, want)
		}
	})

	t.Run("returns error when requested locale is not configured", func(t *testing.T) {
		requested := []string{"fr-FR", "es-ES"}
		_, err := resolveHyperlocaliseTargetLocales(configured, requested)
		if err == nil {
			t.Fatalf("expected error for unconfigured locale, got nil")
		}
		if !strings.Contains(err.Error(), `locale "es-ES" is not configured`) {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("returns error when requested list contains only whitespace or empty entries", func(t *testing.T) {
		requested := []string{"  ", "", "   "}
		_, err := resolveHyperlocaliseTargetLocales(configured, requested)
		if err == nil {
			t.Fatalf("expected error for empty target locales, got nil")
		}
		if !strings.Contains(err.Error(), "at least one target locale is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestInferHyperlocaliseFileFormat_Scout(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"locales/en.JSON", "json"},
		{"locales/en.Jsonc", "jsonc"},
		{"config/app.YML", "yaml"},
		{"config/app.YAML", "yaml"},
		{"lib/app.ARB", "arb"},
		{"i18n/messages.XLIFF", "xliff"},
		{"i18n/messages.XLF", "xliff"},
		{"po/fr.PO", "po"},
		{"public/index.HTML", "html"},
		{"docs/readme.MD", "markdown"},
		{"docs/guide.MDX", "mdx"},
		{"ios/en.lproj/Localizable.STRINGS", "strings"},
		{"ios/en.lproj/Localizable.STRINGSDICT", "stringsdict"},
		{"ios/Localizable.XCSTRINGS", "xcstrings"},
		{"data/items.CSV", "csv"},
		{"locales/en.FTL", "fluent"},
		{"config/labels.PROPERTIES", "properties"},
		{"subtitles/fr.SRT", "srt"},
		{"subtitles/fr.VTT", "vtt"},
		{"assets/logo.PNG", "png"},
		{"assets/banner.JPEG", "jpeg"},
		{"assets/photo.JPG", "jpeg"},
		{"assets/hero.WEBP", "webp"},
		{"docs/spec.DOCX", "docx"},
		{"sheets/data.XLSX", "xlsx"},
		{"sheets/legacy.XLS", "xls"},
		{"decks/presentation.PPTX", "pptx"},
		{"unknown/file.XYZ", ""},
		{"noextension", ""},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := inferHyperlocaliseFileFormat(tt.path)
			if got != tt.want {
				t.Errorf("inferHyperlocaliseFileFormat(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestContentTypeForPath_Scout(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		check func(t *testing.T, got string)
	}{
		{
			name: "custom fallback for strings",
			path: "ios/en.lproj/Localizable.strings",
			check: func(t *testing.T, got string) {
				if got != "text/plain" {
					t.Errorf("got %q, want text/plain", got)
				}
			},
		},
		{
			name: "custom fallback for stringsdict",
			path: "ios/en.lproj/Localizable.stringsdict",
			check: func(t *testing.T, got string) {
				if got != "text/plain" {
					t.Errorf("got %q, want text/plain", got)
				}
			},
		},
		{
			name: "custom fallback for fluent",
			path: "locales/en.ftl",
			check: func(t *testing.T, got string) {
				if got != "text/plain" {
					t.Errorf("got %q, want text/plain", got)
				}
			},
		},
		{
			name: "custom fallback for properties",
			path: "locales/messages.properties",
			check: func(t *testing.T, got string) {
				if got != "text/plain" {
					t.Errorf("got %q, want text/plain", got)
				}
			},
		},
		{
			name: "custom fallback for srt",
			path: "captions/fr.srt",
			check: func(t *testing.T, got string) {
				if got != "application/x-subrip" {
					t.Errorf("got %q, want application/x-subrip", got)
				}
			},
		},
		{
			name: "custom fallback for xcstrings",
			path: "ios/Localizable.xcstrings",
			check: func(t *testing.T, got string) {
				if got != "application/json" {
					t.Errorf("got %q, want application/json", got)
				}
			},
		},
		{
			name: "unknown file extension defaults to octet-stream",
			path: "unknown/file.unknownformat",
			check: func(t *testing.T, got string) {
				if got != "application/octet-stream" {
					t.Errorf("got %q, want application/octet-stream", got)
				}
			},
		},
		{
			name: "markdown file resolves non-empty content-type",
			path: "docs/guide.md",
			check: func(t *testing.T, got string) {
				if got == "" {
					t.Errorf("expected non-empty content-type for markdown")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := contentTypeForPath(tt.path)
			tt.check(t, got)
		})
	}
}

func TestWriteHyperlocalisePushReport_Scout(t *testing.T) {
	report := hyperlocalisePushReport{
		Action:        "push",
		Complete:      true,
		PlannedFiles:  3,
		UploadedFiles: 3,
		FailedItems:   0,
		DryRun:        false,
	}

	t.Run("text output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePushReport(&buf, report, "text")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, "action=push complete=true planned_files=3 uploaded_files=3 failed_items=0 dry_run=false") {
			t.Errorf("text output mismatch: %q", got)
		}
	})

	t.Run("json output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePushReport(&buf, report, "json")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, `"action": "push"`) || !strings.Contains(got, `"plannedFiles": 3`) {
			t.Errorf("json output mismatch: %q", got)
		}
	})

	t.Run("markdown output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePushReport(&buf, report, "markdown")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, "## Hyperlocalise Push") || !strings.Contains(got, "- Complete: `true`") {
			t.Errorf("markdown output mismatch: %q", got)
		}
	})

	t.Run("unsupported format error", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePushReport(&buf, report, "xml")
		if err == nil {
			t.Fatalf("expected error for unsupported format, got nil")
		}
		if !strings.Contains(err.Error(), `unsupported output format "xml"`) {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestWriteHyperlocalisePullReport_Scout(t *testing.T) {
	report := hyperlocalisePullReport{
		Action:       "pull",
		Complete:     true,
		PlannedFiles: 4,
		Downloaded:   3,
		Skipped:      1,
		DryRun:       false,
	}

	t.Run("text output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePullReport(&buf, report, "text")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, "action=pull complete=true planned_files=4 downloaded=3 skipped=1 dry_run=false") {
			t.Errorf("text output mismatch: %q", got)
		}
	})

	t.Run("json output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePullReport(&buf, report, "json")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, `"action": "pull"`) || !strings.Contains(got, `"downloaded": 3`) {
			t.Errorf("json output mismatch: %q", got)
		}
	})

	t.Run("markdown output format", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePullReport(&buf, report, "md")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := buf.String()
		if !strings.Contains(got, "## Hyperlocalise Pull") || !strings.Contains(got, "- Downloaded: `3`") {
			t.Errorf("markdown output mismatch: %q", got)
		}
	})

	t.Run("unsupported format error", func(t *testing.T) {
		var buf bytes.Buffer
		err := writeHyperlocalisePullReport(&buf, report, "yaml")
		if err == nil {
			t.Fatalf("expected error for unsupported format, got nil")
		}
		if !strings.Contains(err.Error(), `unsupported output format "yaml"`) {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}
