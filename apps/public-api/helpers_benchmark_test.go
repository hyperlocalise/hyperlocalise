package main

import (
	"fmt"
	"net/http/httptest"
	"net/url"
	"testing"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
)

func bilingualImportCorpus(n int) []editor_export.Row {
	rows := make([]editor_export.Row, n)
	locales := []string{"fr", "de", ""}
	paths := []string{"a.json", "b.json", ""}
	for i := range rows {
		rows[i] = editor_export.Row{
			Key:          fmt.Sprintf("key-%d", i%4000),
			TargetText:   fmt.Sprintf("translated-%d", i),
			TargetLocale: locales[i%len(locales)],
			SourcePath:   paths[i%len(paths)],
		}
	}
	return rows
}

func BenchmarkGroupBilingualImportRows(b *testing.B) {
	rows := bilingualImportCorpus(5000)
	filePath := "a.json"
	b.ReportAllocs()
	b.SetBytes(int64(len(rows) * 48))
	for b.Loop() {
		entries, skipped := groupBilingualImportRows(rows, "fr", &filePath)
		if len(entries) == 0 || skipped == 0 {
			b.Fatal("expected grouped rows")
		}
	}
}

func BenchmarkNormalizeSourceText(b *testing.B) {
	source := "  Hello\tＷide \n World  checkout.title  "
	b.ReportAllocs()
	b.SetBytes(int64(len(source)))
	for b.Loop() {
		if normalizeSourceText(source) == "" {
			b.Fatal("empty normalized text")
		}
	}
}

func BenchmarkEffectivePermissions(b *testing.B) {
	stored := []string{"jobs:read", "jobs:write", "files:read", "files:write", "memories:read", "memories:write"}
	b.ReportAllocs()
	for b.Loop() {
		if len(effectivePermissions(stored, "admin")) < 8 {
			b.Fatal("expected expanded permissions")
		}
	}
}

func BenchmarkParseQueryFilters(b *testing.B) {
	values := url.Values{
		"projectId": {"project_1"},
		"status":    {"open"},
		"issueType": {"translation_mistake"},
		"priority":  {"P1"},
		"locale":    {"fr-FR"},
		"assignee":  {"me"},
		"search":    {"checkout"},
		"sort":      {"updated_at"},
		"sortDir":   {"desc"},
		"limit":     {"50"},
		"offset":    {"25"},
	}
	rec := httptest.NewRecorder()
	b.ReportAllocs()
	for b.Loop() {
		filters, ok := parseQueryFilters(rec, values)
		if !ok || filters.Assignee != "me" {
			b.Fatal("unexpected query filters")
		}
	}
}

func BenchmarkParsePagination(b *testing.B) {
	values := url.Values{"limit": {"25"}, "offset": {"100"}}
	rec := httptest.NewRecorder()
	b.ReportAllocs()
	for b.Loop() {
		page, ok := parsePagination(rec, values, 25)
		if !ok || page.Limit != 25 || page.Offset != 100 {
			b.Fatal("unexpected pagination")
		}
	}
}

func BenchmarkFileActivityEvent(b *testing.B) {
	path := `././locales\\checkout//en.json`
	extra := map[string]any{"imported": 12, "skipped": 3}
	b.ReportAllocs()
	b.SetBytes(int64(len(path)))
	for b.Loop() {
		event, err := fileActivityEvent("file_translations_imported", "project-1", path, extra)
		if err != nil || event.TargetKind != "file" {
			b.Fatal(err)
		}
	}
}

func BenchmarkSQLFilter(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", "org", "proj")
		where.add("f.source_path = ?", "en.json")
		where.add("(k.key ILIKE ? OR k.source_text ILIKE ?)", "%checkout%")
		sql := where.sql() + where.page(25, 50)
		if sql == "" || len(where.args) != 6 {
			b.Fatal("unexpected filter SQL")
		}
	}
}
