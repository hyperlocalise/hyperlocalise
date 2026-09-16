package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func BenchmarkBuildQaFindingExternalRef(b *testing.B) {
	for _, tc := range []struct {
		name string
		key  string
	}{
		{name: "short", key: "hello"},
		{name: "long", key: strings.Repeat("segment", 80)},
	} {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = buildQaFindingExternalRef(
					"project_native",
					"11111111-1111-4111-8111-111111111111",
					tc.key,
					"not_localized",
					"de-DE",
				)
			}
		})
	}
}

func BenchmarkBuildTranslationQaFindingHref(b *testing.B) {
	sourcePath := "locales/app/en.json"
	b.ReportAllocs()
	for b.Loop() {
		_ = buildTranslationQaFindingHref("acme", "project/native", &sourcePath, "fr-FR", "welcome.title")
	}
}

func BenchmarkBuildQaFindingIssueDescription(b *testing.B) {
	href := buildTranslationQaFindingHref("acme", "project_1", nil, "de-DE", "hello")
	b.ReportAllocs()
	b.SetBytes(int64(len(href)))
	for b.Loop() {
		_ = buildQaFindingIssueDescription(
			"not_localized",
			"Target text is empty",
			"Hello",
			"",
			href,
		)
	}
}

func BenchmarkParseFindingIDs(b *testing.B) {
	ids := make([]string, 100)
	for i := range ids {
		ids[i] = uuid.NewString()
	}
	b.ReportAllocs()
	for b.Loop() {
		parsed, err := parseFindingIDs(ids)
		if err != nil || len(parsed) != 100 {
			b.Fatal("unexpected parse result")
		}
	}
}

func BenchmarkParseWorkspaceFindingsQuery(b *testing.B) {
	req := httptest.NewRequest(
		"GET",
		"/v1/orgs/acme/qa-reports/findings?projectId=project_1&locale=de-DE&checkType=not_localized&severity=error&limit=50&offset=100",
		nil,
	)
	b.ReportAllocs()
	for b.Loop() {
		_, _, _, _, limit, offset, err := parseWorkspaceFindingsQuery(req)
		if err != nil || limit != 50 || offset != 100 {
			b.Fatal("unexpected query parse")
		}
	}
}
