package reporting

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func TestReportingQuoteXLSXKeepsRatePrecisionAndPostEditNotes(t *testing.T) {
	rate := "0.008"
	weighted := 50.4
	cost := "0.40"
	card := "Standard"
	basis := "word"
	pricing := "post_edit"
	file, err := reportingQuoteXLSX(reportingCostEstimate{
		Rows: []reportingCostEstimateRow{{
			TargetLocale: "fr-FR", Step: "translation", Pricing: "rate",
			RateCardName: &card, Basis: &basis, Rate: &rate,
			RatePricing: &pricing, Bands: map[string]float64{"new": 50},
			Units: 50, Weighted: &weighted, CostUSD: &cost,
		}},
		Totals: reportingCostEstimateTotals{Bands: map[string]float64{"new": 50}, CostUSD: "0.40"},
	}, reportingQuoteDetails{workspace: "Acme", client: "=Globex", issued: "2026-06-15", validDays: 14, unit: "words"})
	require.NoError(t, err)
	book, err := excelize.OpenReader(bytes.NewReader(file.body))
	require.NoError(t, err)
	defer func() { _ = book.Close() }()
	rows, err := book.GetRows(reportingQuoteSheet)
	require.NoError(t, err)
	require.Equal(t, []string{"For", "=Globex"}, rows[2])
	formula, err := book.GetCellFormula(reportingQuoteSheet, "B3")
	require.NoError(t, err)
	require.Empty(t, formula)
	var line []string
	for _, row := range rows {
		if len(row) > 0 && row[0] == "fr-FR" {
			line = row
		}
	}
	require.Equal(t, []string{"fr-FR", "translation", "Standard", "per word", "0.008", "50", "50", "50.40", "0.40"}, line)
	require.Contains(t, rows[len(rows)-1][0], "post-edit pricing")
}
