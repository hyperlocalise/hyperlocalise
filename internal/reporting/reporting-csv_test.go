package reporting

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReportingCSVCellQuotesAndDisarmsFormulas(t *testing.T) {
	require.Equal(t, `""`, reportingCSVCell(""))
	require.Equal(t, `"plain"`, reportingCSVCell("plain"))
	require.Equal(t, `"say ""hi"""`, reportingCSVCell(`say "hi"`))
	for _, formula := range []string{"=1+1", "+1", "@cmd", "-cmd", "\tx", "\rx", "-1-1"} {
		require.Equal(t, `"'`+formula+`"`, reportingCSVCell(formula), formula)
	}
	require.Equal(t, `"-3"`, reportingCSVCell("-3"))
	require.Equal(t, `"-3.25"`, reportingCSVCell("-3.25"))
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
