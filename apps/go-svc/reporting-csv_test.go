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

func TestReportingCentsRoundAsJavaScriptsToFixedDoes(t *testing.T) {
	cents := func(text string) string { value, _ := usdFloat(text); return jsToFixed2(value) }
	require.Equal(t, "5.00", cents("5"))
	// A half-cent a double holds exactly rounds up; one it holds slightly under rounds down.
	require.Equal(t, "12.63", cents("12.625"))
	require.Equal(t, "0.13", cents("0.125"))
	require.Equal(t, "1.00", cents("1.005"))
	require.Equal(t, "0.01", cents("0.015"))
	require.Equal(t, "2.67", cents("2.675"))
	require.Equal(t, "0.12", cents("0.1249"))
	require.Equal(t, "0.62", cents("0.6199"))
	require.Equal(t, "0.00", cents("0"))
}

func TestWriteReportingCSVSetsNosniff(t *testing.T) {
	rec := httptest.NewRecorder()
	writeReportingCSV(t.Context(), rec, 200, reportingCSV{filename: "x.csv", write: func(w *reportingCSVWriter) error { return w.row("a") }})
	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
}

func TestReportingNumberWritesAsJavaScriptDoes(t *testing.T) {
	require.Equal(t, "110", reportingNumber(110))
	require.Equal(t, "0", reportingNumber(0))
	require.Equal(t, "0.5", reportingNumber(0.5))
	require.Equal(t, "12345678.25", reportingNumber(12345678.25))
}
