package main

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func TestReportingCostEstimateDownloadsAsAQuoteWorkbook(t *testing.T) {
	f := seedReportingMoney(t)
	f.exec(`update organizations set name = 'Acme Localisation' where id = $1`, f.scope.OrganizationID)
	f.card("Standard", "2026-03-01T00:00:00Z", line("fr-FR", "0.1", "word", `{"100": 30}`))
	f.budget(f.scope.ProjectID, "1000", some("Standard"))
	job := f.job("job_quote", f.scope.ProjectID, "running", true, "")
	mustReportingSummary(t, f.scope, []reportingSummaryRow{
		{jobID: job, targetLocale: "fr-FR", day: "2026-06-01", arrived: 1000},
		{jobID: job, targetLocale: "fr-FR", day: "2026-06-01", bucket: "100", arrived: 500},
	})
	api := reportingTestAPI(f.scope, "admin")
	rec := reportingRequest(t, api, f.scope.WorkOSUserID, http.MethodGet,
		f.scope.OrgPath("/reports/cost-estimate?jobIds="+job+"&format=xlsx&client=%3DGlobex&reference=PO-77&validDays=14"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, reportingXLSXContentType, rec.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename="quote-2026-06-15.xlsx"`, rec.Header().Get("Content-Disposition"))

	book, err := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	require.NoError(t, err)
	defer func() { _ = book.Close() }()
	rows, err := book.GetRows(reportingQuoteSheet)
	require.NoError(t, err)
	require.Equal(t, []string{"Quote"}, rows[0])
	require.Equal(t, []string{"From", "Acme Localisation"}, rows[1])
	require.Equal(t, []string{"For", "=Globex"}, rows[2], "a client name that looks like a formula stays text")
	formula, err := book.GetCellFormula(reportingQuoteSheet, "B3")
	require.NoError(t, err)
	require.Empty(t, formula, "SetCellStr must not store =Globex as a formula")
	require.Equal(t, []string{"Reference", "PO-77"}, rows[3])
	require.Equal(t, []string{"Date", "2026-06-15"}, rows[4])
	require.Equal(t, []string{"Valid until", "2026-06-29"}, rows[5])
	// Priced by the project budget's card, not one chosen for the whole quote: each line names it.
	require.Equal(t, []string{"Units", "words"}, rows[6])
	require.Equal(t, []string{"Currency", "USD"}, rows[7])
	header := rows[9]
	require.Equal(t, []string{"Language", "Step", "Rate card", "Basis", "Rate", "Match 100", "Match new", "Units", "Weighted units", "Amount"}, header)
	require.Equal(t, []string{"fr-FR", "translation", "Standard", "per word", "0.10", "500", "1,000", "1,500", "1,150.00", "115.00"}, rows[10])
	var total []string
	for _, row := range rows {
		if len(row) > 0 && row[len(row)-1] == "115.00" && len(row) >= 2 && row[len(row)-2] == "Total" {
			total = row
		}
	}
	require.NotNil(t, total, "the quote ends with its total")

	// The quote's own fields are checked like the rest of the query.
	status, body := reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/cost-estimate?jobIds="+job+"&format=xlsx&validDays=0", "")
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_report_query", body["error"])
	status, _ = reportingSend(t, f.scope, "admin", http.MethodGet, "/reports/cost-estimate?jobIds="+job+"&format=pdf", "")
	require.Equal(t, http.StatusBadRequest, status)
}
