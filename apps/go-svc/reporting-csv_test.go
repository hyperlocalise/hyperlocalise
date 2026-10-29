package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// reportingCSVLines writes a download and returns its lines.
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
	for _, formula := range []string{"=1+1", "+1", "@cmd", "-cmd", "\tx", "\rx", "-1-1"} {
		require.Equal(t, `"'`+formula+`"`, reportingCSVCell(formula), formula)
	}
	// A negative number cannot be a formula, so it stays a number in a spreadsheet.
	require.Equal(t, `"-3"`, reportingCSVCell("-3"))
	require.Equal(t, `"-3.25"`, reportingCSVCell("-3.25"))
}

func TestReportingNumberWritesAsJavaScriptDoes(t *testing.T) {
	require.Equal(t, "110", reportingNumber(110))
	require.Equal(t, "0", reportingNumber(0))
	require.Equal(t, "0.5", reportingNumber(0.5))
	require.Equal(t, "12345678.25", reportingNumber(12345678.25))
}
