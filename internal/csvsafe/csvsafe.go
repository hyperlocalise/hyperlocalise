package csvsafe

// EscapeFormula neutralizes spreadsheet formula injection in CSV cell values.
// Remote TMS content may include values beginning with =, +, -, or @.
func EscapeFormula(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r', '\n':
		return "'" + value
	default:
		return value
	}
}

// EscapeRow applies EscapeFormula to every cell in a CSV row.
func EscapeRow(row []string) []string {
	if len(row) == 0 {
		return row
	}
	out := make([]string, len(row))
	for i, cell := range row {
		out[i] = EscapeFormula(cell)
	}
	return out
}
