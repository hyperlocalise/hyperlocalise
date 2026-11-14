package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func reportingCSVLines(t *testing.T, download reportingCSV) []string {
	t.Helper()
	rec := httptest.NewRecorder()
	writeReportingCSV(t.Context(), rec, 200, download)
	return strings.Split(rec.Body.String(), "\r\n")
}

func TestReportingCSVCellQuotesAndDisarmsFormulas(t *testing.T) {
	require.Equal(t, `""`, reportingCSVCell(""))
	require.Equal(t, `"plain"`, reportingCSVCell("plain"))
	require.Equal(t, `"say ""hi"""`, reportingCSVCell(`say "hi"`))
}
