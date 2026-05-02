package translationfileparser

const (
	LiquidDynamicKeyDiagnosticCode = "W001-liquid-dynamic-key"
	unknownDiagnosticFilePath      = "<unknown>"
)

// Diagnostic is emitted by parsers for findings that do not belong in the
// extracted key/value map.
type Diagnostic struct {
	Code       string `json:"code"`
	FilePath   string `json:"file_path"`
	LineNumber int    `json:"line_number"`
	Hint       string `json:"hint"`
}

func DefaultDiagnosticHint(code string) string {
	switch code {
	case LiquidDynamicKeyDiagnosticCode:
		return "Use a string literal before the t filter so Hyperlocalise can extract the key, or add the translation key manually."
	default:
		return ""
	}
}
