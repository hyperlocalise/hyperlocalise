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

// HasFormulaTrigger reports whether a spreadsheet may evaluate value as a formula once
// leading spaces are ignored. It backs the reversible __HYPERLOCALISE_CSV_FORMULA__ prefix
// used by glossary and memory interchange, and must match spreadsheetFormulaPattern in
// apps/hyperlocalise-web/src/lib/glossary/interchange/csv.ts.
func HasFormulaTrigger(value string) bool {
	for i := 0; i < len(value); i++ {
		switch value[i] {
		case ' ':
			continue
		case '=', '+', '-', '@', '\t', '\r', '\n':
			return true
		default:
			return false
		}
	}
	return false
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
