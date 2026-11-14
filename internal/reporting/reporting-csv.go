package reporting

import (
	"bufio"
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// CSV downloads, written row by row: every cell quoted, CRLF between
// rows, no trailing newline, formulas disarmed.

// CSV is a download written row by row.
type CSV = reportingCSV

type reportingCSV struct {
	filename string
	// write emits the rows, header first, through the writer.
	write func(w *reportingCSVWriter) error
}

// WriteCSV writes a CSV download with nosniff and an attachment filename.
func WriteCSV(ctx context.Context, w http.ResponseWriter, status int, download CSV) {
	writeReportingCSV(ctx, w, status, download)
}

// CSVCell quotes a cell the way the page's downloads do.
func CSVCell(text string) string { return reportingCSVCell(text) }

// Number writes a number as JavaScript's String does for the values Reports holds.
func Number(value float64) string { return reportingNumber(value) }

type reportingCSVWriter struct {
	out  *bufio.Writer
	rows int
}

var reportingNegativeNumber = regexp.MustCompile(`^-\d+(\.\d+)?$`)

// reportingCSVCell quotes a cell. Text that a spreadsheet would run as a formula gets a leading
// apostrophe; a negative number cannot be a formula, so it stays a number.
func reportingCSVCell(text string) string {
	if text != "" && strings.IndexByte("=+@-\t\r", text[0]) >= 0 && !reportingNegativeNumber.MatchString(text) {
		text = "'" + text
	}
	return `"` + strings.ReplaceAll(text, `"`, `""`) + `"`
}

// reportingNumber writes a number as JavaScript's String does for the values Reports holds.
func reportingNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func (w *reportingCSVWriter) row(cells ...string) error {
	if w.rows > 0 {
		if _, err := w.out.WriteString("\r\n"); err != nil {
			return err
		}
	}
	w.rows++
	for i, cell := range cells {
		if i > 0 {
			if err := w.out.WriteByte(','); err != nil {
				return err
			}
		}
		if _, err := w.out.WriteString(reportingCSVCell(cell)); err != nil {
			return err
		}
	}
	return nil
}

func writeReportingCSV(ctx context.Context, w http.ResponseWriter, status int, download reportingCSV) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", `attachment; filename="`+download.filename+`"`)
	w.WriteHeader(status)
	writer := &reportingCSVWriter{out: bufio.NewWriter(w)}
	if err := download.write(writer); err != nil {
		slog.WarnContext(ctx, "reporting_csv_write_failed", "error", err)
		return
	}
	if err := writer.out.Flush(); err != nil {
		slog.WarnContext(ctx, "reporting_csv_write_failed", "error", err)
	}
}
