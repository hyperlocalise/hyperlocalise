package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func BenchmarkParseEditorCatAdvancedFilter(b *testing.B) {
	raw := `{"addedFrom":"2026-01-01","addedTo":"2026-01-31","stringType":"icu","translationStatus":"untranslated","approvalStatus":"not_approved","qaIssues":"with","qaIssueType":"spelling","comments":"without","visibility":"visible"}`
	b.ReportAllocs()
	b.SetBytes(int64(len(raw)))
	for b.Loop() {
		filter, err := parseEditorCatAdvancedFilter(raw)
		if err != nil || filter == nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkAppendEditorCatQueueFilterSQL(b *testing.B) {
	query := editorCatQueueQuery{
		targetLocale:         "fr-FR",
		queueFilter:          "qa_issues",
		queueFilterQualifier: "spelling",
		advancedFilter: &editorCatAdvancedFilter{
			AddedFrom:         "2026-01-01",
			UpdatedTo:         "2026-01-31",
			StringType:        "icu",
			TranslationStatus: "untranslated",
			ApprovalStatus:    "not_approved",
			QaIssues:          "with",
			QaIssueType:       "spelling",
			Comments:          "without",
			Visibility:        "visible",
		},
	}
	b.ReportAllocs()
	for b.Loop() {
		where, args := appendEditorCatQueueFilterSQL("where k.organization_id=$1 and k.project_id=$2", []any{"org", "proj"}, query, 1, 2)
		if where == "" || len(args) < 3 {
			b.Fatal("unexpected filter SQL")
		}
	}
}

func BenchmarkEscapeEditorCatIlike(b *testing.B) {
	value := `50%_off\\sale`
	b.ReportAllocs()
	b.SetBytes(int64(len(value)))
	for b.Loop() {
		if escapeEditorCatIlike(value) == "" {
			b.Fatal("empty escape")
		}
	}
}

func BenchmarkEditorCatWholeFileMatchesAdvanced(b *testing.B) {
	subject := editorCatWholeFileSubject{
		contentKind: "image_file",
		hasTarget:   true,
		status:      "needs_review",
	}
	filter := &editorCatAdvancedFilter{StringType: "asset", TranslationStatus: "translated", Visibility: "visible"}
	b.ReportAllocs()
	for b.Loop() {
		if !editorCatWholeFileMatchesAdvanced(subject, filter) {
			b.Fatal("expected match")
		}
	}
}

func BenchmarkValidEditorCatISODate(b *testing.B) {
	date := "2026-02-28"
	b.ReportAllocs()
	for b.Loop() {
		if !validEditorCatISODate(date) {
			b.Fatal("expected valid date")
		}
	}
}

func BenchmarkParseEditorCatQueueQuery(b *testing.B) {
	values := map[string][]string{
		"sourcePath":           {"locales/en.json"},
		"targetLocale":         {"fr-FR"},
		"limit":                {"50"},
		"queueFilter":          {"qa_issues"},
		"queueFilterQualifier": {"spelling"},
		"queueAdvanced":        {`{"stringType":"icu","visibility":"visible"}`},
		"sourcePaths":          {"a.json,b.json,c.json"},
	}
	b.ReportAllocs()
	for b.Loop() {
		query, err := parseEditorCatQueueQuery(values)
		if err != nil || query.advancedFilter == nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkRewriteHashedHTMLSegmentKeys(b *testing.B) {
	var html strings.Builder
	html.WriteString("<html><body>")
	for i := 0; i < 40; i++ {
		fmt.Fprintf(&html, "<p>Paragraph %d with enough text to hash.</p>", i)
	}
	html.WriteString("</body></html>")
	content := []byte(html.String())
	mapping := translationfileparser.LegacyHTMLKeyToPathKey(content)
	if len(mapping) == 0 {
		b.Fatal("expected hashed keys")
	}
	template := make([]editorCatSegment, 0, len(mapping))
	for legacy := range mapping {
		template = append(template, editorCatSegment{Key: legacy})
	}
	b.ReportAllocs()
	b.SetBytes(int64(len(content)))
	for b.Loop() {
		segments := append([]editorCatSegment(nil), template...)
		rewriteHashedHTMLSegmentKeys(content, segments)
	}
}

func BenchmarkUniqueEditorCatIDs(b *testing.B) {
	ids := make([]string, 400)
	for i := range ids {
		switch i % 4 {
		case 0:
			ids[i] = fmt.Sprintf("AAAAAAAA-AAAA-4AAA-8AAA-%012X", i/4)
		case 1:
			ids[i] = fmt.Sprintf("aaaaaaaa-aaaa-4aaa-8aaa-%012x", i/4)
		case 2:
			ids[i] = "  " + ids[i-1]
		default:
			ids[i] = fmt.Sprintf("plain-%d", i)
		}
	}
	b.ReportAllocs()
	for b.Loop() {
		if len(uniqueEditorCatIDs(ids, editorCatMaxHiddenBatch)) == 0 {
			b.Fatal("expected ids")
		}
	}
}
