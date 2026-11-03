package main

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
)

const (
	// maxBilingualFileBytes matches go-svc's editor-export parse limit.
	maxBilingualFileBytes = 25 << 20
	maxFilePathLength     = 2048
)

var bilingualErrorResponses = []storeErrorResponse{
	{errTooManyBilingualRows, http.StatusBadRequest, "too_many_bilingual_rows", "A bilingual file holds at most 5,000 strings; narrow it with filePath"},
}

func writeBilingualStoreError(w http.ResponseWriter, err error, operation string) {
	for _, response := range bilingualErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

// projectBilingualFile exports a project's strings and one locale's translations as a
// bilingual file (GET), or re-imports one after it was fixed in an external tool (POST).
func (s apiServer) projectBilingualFile(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.importBilingualFile(w, r, projectID)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	locale := strings.TrimSpace(values.Get("locale"))
	rawFormat := values.Get("format")
	if rawFormat == "" {
		rawFormat = string(editor_export.FormatXLIFF)
	}
	format, formatErr := editor_export.ParseFormat(rawFormat)
	includeHidden := values.Get("includeHidden")
	filePath := trimmedOrNil(optionalQuery(values, "filePath"))
	if locale == "" || len(locale) > maxLocaleLength || formatErr != nil || !member(includeHidden, "", "true", "false") ||
		!validOptionalText(filePath, maxFilePathLength) {
		writeError(w, http.StatusBadRequest, "invalid_query", "locale is required; format must be csv, tmx, xlf, xliff, or xlsx")
		return
	}
	rows, err := s.store.exportBilingualRows(r.Context(), p, projectID, bilingualExportQuery{
		Locale:        locale,
		FilePath:      filePath,
		IncludeHidden: includeHidden == "true",
	})
	if err != nil {
		writeBilingualStoreError(w, err, "export bilingual file")
		return
	}
	if len(rows) == 0 {
		writeError(w, http.StatusNotFound, "no_strings", "No strings match this export")
		return
	}
	result, err := editor_export.Serialize(format, rows)
	if err != nil {
		writeBilingualStoreError(w, err, "serialize bilingual file")
		return
	}
	sourcePath := "*"
	if filePath != nil {
		sourcePath = *filePath
	}
	filename := editor_export.BuildFilename(sourcePath, locale, result.Extension)
	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(filename))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(result.Body)
	}
}

func (s apiServer) importBilingualFile(w http.ResponseWriter, r *http.Request, projectID string) {
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBilingualFileBytes+64*1024)
	form, ok := readBilingualForm(w, r)
	if !ok {
		return
	}
	rows, err := editor_export.Parse(form.format, form.body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_bilingual_file", "The bilingual file could not be parsed: "+err.Error())
		return
	}
	if len(rows) == 0 {
		writeError(w, http.StatusBadRequest, "empty_bilingual_file", "The bilingual file does not contain any strings")
		return
	}
	counts, err := s.store.importBilingualRows(r.Context(), p, projectID, bilingualImportInput{
		Locale:   form.locale,
		FilePath: form.filePath,
		Rows:     rows,
	})
	if err != nil {
		writeBilingualStoreError(w, err, "import bilingual file")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Import bilingualImportCounts `json:"import"`
	}{counts})
}

type bilingualForm struct {
	locale   string
	filePath *string
	format   editor_export.Format
	body     []byte
}

// readBilingualForm reads a multipart form with a `file` part and `locale`, and optional
// `filePath` and `format` fields. The format defaults to the file name's extension.
func readBilingualForm(w http.ResponseWriter, r *http.Request) (bilingualForm, bool) {
	invalid := func(message string) (bilingualForm, bool) {
		writeError(w, http.StatusBadRequest, "invalid_body", message)
		return bilingualForm{}, false
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Use Content-Type: multipart/form-data")
		return bilingualForm{}, false
	}
	reader, err := r.MultipartReader()
	if err != nil {
		return invalid("Request body must be multipart form data")
	}
	var form bilingualForm
	var rawFormat, filename string
	seenFile := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Bilingual files are limited to 25 MiB")
				return bilingualForm{}, false
			}
			return invalid("Request body must be multipart form data")
		}
		name := part.FormName()
		if name == "file" {
			if seenFile {
				_ = part.Close()
				return invalid("Send one file")
			}
			seenFile = true
			filename = part.FileName()
			form.body, err = io.ReadAll(io.LimitReader(part, maxBilingualFileBytes+1))
			_ = part.Close()
			if err != nil {
				return invalid("The file could not be read")
			}
			if len(form.body) > maxBilingualFileBytes {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Bilingual files are limited to 25 MiB")
				return bilingualForm{}, false
			}
			continue
		}
		value, err := io.ReadAll(io.LimitReader(part, maxFilePathLength+1))
		_ = part.Close()
		if err != nil || len(value) > maxFilePathLength {
			return invalid("A form field is too long")
		}
		switch name {
		case "locale":
			form.locale = strings.TrimSpace(string(value))
		case "filePath":
			text := string(value)
			form.filePath = trimmedOrNil(&text)
		case "format":
			rawFormat = string(value)
		default:
			return invalid("Unknown form field: " + name)
		}
	}
	if !seenFile || len(form.body) == 0 {
		return invalid("file is required")
	}
	if form.locale == "" || len(form.locale) > maxLocaleLength {
		return invalid("locale is required")
	}
	if rawFormat != "" {
		form.format, err = editor_export.ParseFormat(rawFormat)
	} else {
		form.format, err = editor_export.FormatFromFilename(filename)
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "unsupported_bilingual_format", "Upload a CSV, TMX, XLF, XLIFF, or XLSX file, or set format")
		return bilingualForm{}, false
	}
	return form, true
}

// optionalQuery returns nil when the query parameter is absent.
func optionalQuery(values url.Values, name string) *string {
	if !values.Has(name) {
		return nil
	}
	value := values.Get(name)
	return &value
}
