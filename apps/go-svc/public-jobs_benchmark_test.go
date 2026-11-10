package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func BenchmarkParseLatestPublicJobQuery(b *testing.B) {
	req := httptest.NewRequest(http.MethodGet, "/jobs/latest?projectId=proj_native_1&sourcePath=locales/en.json", nil)
	b.ReportAllocs()
	for b.Loop() {
		_, _, ok := parseLatestPublicJobQuery(req)
		if !ok {
			b.Fatal("expected query")
		}
	}
}

func BenchmarkParsePublicJobAnalysisUnit(b *testing.B) {
	req := httptest.NewRequest(http.MethodGet, "/jobs/x/analysis?unit=characters_with_spaces", nil)
	b.ReportAllocs()
	for b.Loop() {
		unit, ok := parsePublicJobAnalysisUnit(req)
		if !ok || unit == "" {
			b.Fatal("expected unit")
		}
	}
}
