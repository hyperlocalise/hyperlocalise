package main

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/xuri/excelize/v2"
)

// A cost estimate as a quote to send a client: an Excel workbook with the workspace's name, the
// client and reference the page asked for, a line per language and step with units per band,
// rate and amount, the fixed fees, the total and a validity date. Nothing is stored, as with the
// estimate itself.

const (
	reportingQuoteSheet           = "Quote"
	reportingQuoteDefaultValidity = 30
	reportingXLSXContentType      = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

// reportingFile is a download that is not CSV: its bytes are built in full before they are written.
type reportingFile struct {
	filename, contentType string
	body                  []byte
}

func writeReportingFile(ctx context.Context, w http.ResponseWriter, status int, file reportingFile) {
	w.Header().Set("Content-Type", file.contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", `attachment; filename="`+file.filename+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(file.body)))
	w.WriteHeader(status)
	if _, err := w.Write(file.body); err != nil {
		slog.WarnContext(ctx, "reporting_file_write_failed", "error", err)
	}
}

type reportingQuoteDetails struct {
	workspace, client, reference string
	issued                       string
	validDays                    int
	unit                         string
}

// reportingQuoteXLSX lays the estimate out as a quote. Amounts are numbers in USD so the client
// can add to them; the total is the estimate's own, to the cent.
func reportingQuoteXLSX(estimate reportingCostEstimate, details reportingQuoteDetails) (reportingFile, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	if err := f.SetSheetName("Sheet1", reportingQuoteSheet); err != nil {
		return reportingFile{}, err
	}
	bold, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return reportingFile{}, err
	}
	title, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 16}})
	if err != nil {
		return reportingFile{}, err
	}
	money, err := f.NewStyle(&excelize.Style{NumFmt: 4}) // #,##0.00
	if err != nil {
		return reportingFile{}, err
	}
	totalMoney, err := f.NewStyle(&excelize.Style{NumFmt: 4, Font: &excelize.Font{Bold: true}})
	if err != nil {
		return reportingFile{}, err
	}
	count, err := f.NewStyle(&excelize.Style{NumFmt: 3}) // #,##0
	if err != nil {
		return reportingFile{}, err
	}
	// Per-word rates are often three or more decimals (0.008); two-decimal money would show 0.01.
	rateFmt := "#,##0.00########"
	rateStyle, err := f.NewStyle(&excelize.Style{CustomNumFmt: &rateFmt})
	if err != nil {
		return reportingFile{}, err
	}
	sheet := reportingQuoteSheet
	row := 1
	set := func(column int, value any, style int) error {
		cell, err := excelize.CoordinatesToCellName(column, row)
		if err != nil {
			return err
		}
		if text, ok := value.(string); ok {
			// Shared-string cells keep "=Globex" as text; a CSV-style apostrophe would show.
			if err := f.SetCellStr(sheet, cell, text); err != nil {
				return err
			}
		} else if err := f.SetCellValue(sheet, cell, value); err != nil {
			return err
		}
		if style != 0 {
			return f.SetCellStyle(sheet, cell, cell, style)
		}
		return nil
	}
	issued, err := time.Parse(time.DateOnly, details.issued)
	if err != nil {
		return reportingFile{}, err
	}
	validUntil := issued.AddDate(0, 0, details.validDays).Format(time.DateOnly)
	if err := set(1, "Quote", title); err != nil {
		return reportingFile{}, err
	}
	row++
	header := [][2]string{
		{"From", details.workspace},
		{"For", details.client},
		{"Reference", details.reference},
		{"Date", details.issued},
		{"Valid until", validUntil},
		{"Rate card", reportingOptional(estimate.RateCardName)},
		{"Units", details.unit},
		{"Currency", "USD"},
	}
	for _, line := range header {
		if line[1] == "" {
			continue
		}
		if err := set(1, line[0], bold); err != nil {
			return reportingFile{}, err
		}
		if err := set(2, line[1], 0); err != nil {
			return reportingFile{}, err
		}
		row++
	}
	row++
	var bands []string
	for _, bucket := range reportingMatchBucket {
		if estimate.Totals.Bands[bucket] > 0 {
			bands = append(bands, bucket)
		}
	}
	columns := []string{"Language", "Step", "Rate card", "Basis", "Rate"}
	for _, band := range bands {
		columns = append(columns, "Match "+band)
	}
	columns = append(columns, "Units", "Weighted units", "Amount")
	for i, name := range columns {
		if err := set(i+1, name, bold); err != nil {
			return reportingFile{}, err
		}
	}
	row++
	amountColumn := len(columns)
	for _, line := range estimate.Rows {
		cells := []any{line.TargetLocale, line.Step, reportingOptional(line.RateCardName), reportingQuoteBasis(line), reportingQuoteNumber(line.Rate)}
		for _, band := range bands {
			cells = append(cells, line.Bands[band])
		}
		var weighted any = ""
		if line.Weighted != nil {
			weighted = reportingRound(*line.Weighted*100) / 100
		}
		cells = append(cells, line.Units, weighted, reportingQuoteNumber(line.CostUSD))
		for i, value := range cells {
			style := 0
			switch {
			case i == 4:
				style = rateStyle
			case i == amountColumn-1:
				style = money
			case i == amountColumn-2:
				if _, ok := value.(float64); ok {
					style = money
				}
			case i >= 5:
				style = count
			}
			if err := set(i+1, value, style); err != nil {
				return reportingFile{}, err
			}
		}
		row++
	}
	for _, fee := range estimate.FixedFees {
		if err := set(1, "Fixed fee: "+fee.JobTitle, 0); err != nil {
			return reportingFile{}, err
		}
		if err := set(2, fee.Step, 0); err != nil {
			return reportingFile{}, err
		}
		if err := set(amountColumn, reportingQuoteNumber(&fee.AmountUSD), money); err != nil {
			return reportingFile{}, err
		}
		row++
	}
	row++
	if err := set(amountColumn-1, "Total", bold); err != nil {
		return reportingFile{}, err
	}
	if err := set(amountColumn, reportingQuoteNumber(&estimate.Totals.CostUSD), totalMoney); err != nil {
		return reportingFile{}, err
	}
	row += 2
	for _, note := range reportingQuoteNotes(estimate) {
		if err := set(1, note, 0); err != nil {
			return reportingFile{}, err
		}
		row++
	}
	widths := map[string]float64{"A": 28, "B": 14, "C": 18, "D": 22, "E": 10}
	for column, width := range widths {
		if err := f.SetColWidth(sheet, column, column, width); err != nil {
			return reportingFile{}, err
		}
	}
	var out bytes.Buffer
	if err := f.Write(&out); err != nil {
		return reportingFile{}, err
	}
	return reportingFile{filename: "quote-" + details.issued + ".xlsx", contentType: reportingXLSXContentType, body: out.Bytes()}, nil
}

// reportingQuoteNumber is an amount as a number, or empty when there is none.
func reportingQuoteNumber(value *string) any {
	if value == nil || *value == "" {
		return ""
	}
	number, err := strconv.ParseFloat(*value, 64)
	if err != nil {
		return *value
	}
	return number
}

func reportingQuoteBasis(row reportingCostEstimateRow) string {
	switch row.Pricing {
	case "fixed":
		return "fixed fee"
	case "none":
		return "no rate"
	}
	switch reportingOptional(row.Basis) {
	case "word":
		return "per word"
	case "character":
		return "per character"
	case "character_with_spaces":
		return "per character with spaces"
	case "hour":
		return "per hour"
	}
	return ""
}

// reportingQuoteNotes says what the total leaves out, as the estimate tab does.
func reportingQuoteNotes(estimate reportingCostEstimate) []string {
	var notes []string
	if estimate.Totals.UnpricedUnits > 0 {
		notes = append(notes, fmt.Sprintf("%s units have no rate and are not in the total.", reportingNumber(estimate.Totals.UnpricedUnits)))
	}
	if estimate.Totals.UnavailableUnits > 0 {
		notes = append(notes, fmt.Sprintf("%s units could not be matched against translation memory and are priced as new work.", reportingNumber(estimate.Totals.UnavailableUnits)))
	}
	if estimate.FixedFeesLeftOut > 0 {
		notes = append(notes, "Fixed fees are left out while a language is chosen.")
	}
	if slices.ContainsFunc(estimate.Rows, func(row reportingCostEstimateRow) bool { return row.Unestimated }) {
		notes = append(notes, "Some hourly work has no time estimate and is not in the total.")
	}
	if slices.ContainsFunc(estimate.Rows, func(row reportingCostEstimateRow) bool {
		return reportingOptional(row.RatePricing) == "post_edit"
	}) {
		notes = append(notes, "Lines set to post-edit pricing are estimated from memory match; pay is by how much the text changes.")
	}
	if estimate.Totals.Incomplete && len(notes) == 0 {
		notes = append(notes, "This quote is not exact: some work has no rate, time estimate or match band.")
	}
	return notes
}

// reportingWorkspaceName is the workspace's display name, for the quote's sender.
func reportingWorkspaceName(ctx context.Context, db dictionaryDB, organizationID string) (string, error) {
	var name string
	err := db.QueryRow(ctx, `select name from organizations where id = $1`, organizationID).Scan(&name)
	if err != nil {
		return "", fmt.Errorf("read workspace name: %w", err)
	}
	return name, nil
}
