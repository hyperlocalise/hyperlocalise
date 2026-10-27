package translationfileparser

import "errors"

var (
	// ErrPDFNoTextLayer is returned when a PDF has no extractable native text.
	ErrPDFNoTextLayer = errors.New("pdf has no readable text layer")
	// ErrPDFEncrypted is returned for password-protected PDFs.
	ErrPDFEncrypted = errors.New("pdf is encrypted")
	// ErrPDFMalformed is returned when PDFium cannot parse the file.
	ErrPDFMalformed = errors.New("pdf is malformed")
	// ErrPDFScriptUnsupported is returned when the target text needs shaping PDFium cannot perform.
	ErrPDFScriptUnsupported = errors.New("pdf target script is not supported")
)
