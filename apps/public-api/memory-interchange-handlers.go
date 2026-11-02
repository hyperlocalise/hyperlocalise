package main

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"unicode/utf8"
)

// maxMemoryImportBytes caps inline TMX and CSV imports.
const maxMemoryImportBytes = 25 << 20

var memoryInterchangeErrorResponses = []storeErrorResponse{
	{errMemoryNotNative, http.StatusConflict, "external_tms_memory_immutable", "This translation memory is managed by an external TMS"},
	{errMemoryArchived, http.StatusConflict, "memory_action_archived", "This translation memory is archived"},
}

func writeMemoryInterchangeError(w http.ResponseWriter, err error, operation string) {
	for _, response := range memoryInterchangeErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

func writeInterchangeFile(w http.ResponseWriter, r *http.Request, file interchangeFile) {
	w.Header().Set("Content-Type", file.ContentType)
	w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(file.Filename))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(file.Body)
	}
}

func (s apiServer) memoryExport(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	memoryID, ok := pathID(w, r, "memoryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "translation-memories:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	query := memoryExportQuery{
		Format:       strings.ToLower(strings.TrimSpace(values.Get("format"))),
		SourceLocale: strings.ReplaceAll(strings.TrimSpace(values.Get("sourceLocale")), "_", "-"),
		TargetLocale: strings.ReplaceAll(strings.TrimSpace(values.Get("targetLocale")), "_", "-"),
	}
	if query.Format == "" {
		query.Format = "tmx"
	}
	if !member(query.Format, "tmx", "csv") || len(query.SourceLocale) > maxLocaleLength || len(query.TargetLocale) > maxLocaleLength {
		writeError(w, http.StatusBadRequest, "invalid_query", "format must be tmx or csv")
		return
	}
	file, err := s.store.exportMemoryEntries(r.Context(), p, memoryID, query)
	if err != nil {
		writeMemoryInterchangeError(w, err, "export translation memory")
		return
	}
	writeInterchangeFile(w, r, file)
}

// memoryImport applies a TMX or CSV file, sent as JSON {format, content} or as a multipart
// `file` part with an optional `format` field.
func (s apiServer) memoryImport(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	memoryID, ok := pathID(w, r, "memoryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "translation-memories:write")
	if !ok {
		return
	}
	input, ok := readMemoryImport(w, r)
	if !ok {
		return
	}
	result, err := s.store.importMemoryEntries(r.Context(), p, memoryID, input)
	if err != nil {
		writeMemoryInterchangeError(w, err, "import translation memory")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Import memoryImportResult `json:"import"`
	}{result})
}

func readMemoryImport(w http.ResponseWriter, r *http.Request) (memoryImportInput, bool) {
	invalid := func(message string) (memoryImportInput, bool) {
		writeError(w, http.StatusBadRequest, "invalid_body", message)
		return memoryImportInput{}, false
	}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	var input memoryImportInput
	switch mediaType {
	case "application/json":
		var body struct {
			Format         string  `json:"format"`
			Content        string  `json:"content"`
			SourceFilename *string `json:"sourceFilename"`
		}
		if !decodeJSONBodyLimit(w, r, &body, maxMemoryImportBytes+64*1024) {
			return memoryImportInput{}, false
		}
		input = memoryImportInput{Format: body.Format, Content: body.Content, SourceFilename: trimmedOrNil(body.SourceFilename)}
	case "multipart/form-data":
		r.Body = http.MaxBytesReader(w, r.Body, maxMemoryImportBytes+64*1024)
		reader, err := r.MultipartReader()
		if err != nil {
			return invalid("Request body must be multipart form data")
		}
		seenFile := false
		for {
			part, err := reader.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Imports are limited to 25 MiB")
					return memoryImportInput{}, false
				}
				return invalid("Request body must be multipart form data")
			}
			switch part.FormName() {
			case "file":
				if seenFile {
					_ = part.Close()
					return invalid("Send one file")
				}
				seenFile = true
				content, err := io.ReadAll(io.LimitReader(part, maxMemoryImportBytes+1))
				_ = part.Close()
				if err != nil {
					return invalid("The file could not be read")
				}
				if len(content) > maxMemoryImportBytes {
					writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Imports are limited to 25 MiB")
					return memoryImportInput{}, false
				}
				input.Content = string(content)
				if name := strings.TrimSpace(part.FileName()); name != "" {
					input.SourceFilename = &name
					if input.Format == "" {
						input.Format = strings.TrimPrefix(path.Ext(name), ".")
					}
				}
			case "format":
				value, err := io.ReadAll(io.LimitReader(part, 64))
				_ = part.Close()
				if err != nil {
					return invalid("format could not be read")
				}
				input.Format = string(value)
			default:
				_ = part.Close()
				return invalid("Unknown form field: " + part.FormName())
			}
		}
	default:
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Use application/json or multipart/form-data")
		return memoryImportInput{}, false
	}
	input.Format = strings.ToLower(strings.TrimSpace(input.Format))
	if !member(input.Format, "tmx", "csv") {
		return invalid("format must be tmx or csv")
	}
	if strings.TrimSpace(input.Content) == "" || !utf8.ValidString(input.Content) {
		return invalid("content must be non-empty UTF-8 text")
	}
	if input.SourceFilename != nil && len(*input.SourceFilename) > 512 {
		return invalid("sourceFilename is too long")
	}
	return input, true
}
