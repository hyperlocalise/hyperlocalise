package main

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// maxGlossaryImportBytes matches the glossary interchange lambda's 25 MB limit.
const maxGlossaryImportBytes = 25 << 20

var glossaryImportModes = []string{"preview", "create", "update", "merge", "replace"}

var glossaryImportErrorResponses = []storeErrorResponse{
	{errGlossaryNotNative, http.StatusConflict, "glossary_import_unsupported", "Live provider glossaries cannot be imported into"},
	{errGlossaryWriteForbidden, http.StatusForbidden, "forbidden", "The token owner cannot edit this glossary"},
	{errGlossaryImportNotFound, http.StatusNotFound, "glossary_import_not_found", "Glossary import not found"},
	{errGlossaryImportUnavailable, http.StatusServiceUnavailable, "glossary_import_unavailable", "Glossary import processing is unavailable"},
}

func writeGlossaryImportError(w http.ResponseWriter, err error, operation string) {
	for _, response := range glossaryImportErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

// glossaryImport queues a TBX, CSV, or XLSX file for the glossary interchange lambda and
// returns the run to poll at .../import-reports/{reportId}.
func (s apiServer) glossaryImport(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	glossaryID, ok := pathID(w, r, "glossaryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:write")
	if !ok {
		return
	}
	input, ok := readGlossaryImport(w, r)
	if !ok {
		return
	}
	report, err := s.store.queueGlossaryImport(r.Context(), p, glossaryID, input)
	if err != nil {
		writeGlossaryImportError(w, err, "queue glossary import")
		return
	}
	writeJSON(w, http.StatusAccepted, struct {
		Import glossaryImportReport `json:"import"`
	}{report})
}

func (s apiServer) glossaryImportReport(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	glossaryID, ok := pathID(w, r, "glossaryId")
	if !ok {
		return
	}
	reportID, ok := pathID(w, r, "reportId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:read")
	if !ok {
		return
	}
	report, err := s.store.getGlossaryImportReport(r.Context(), p, glossaryID, reportID)
	if err != nil {
		writeGlossaryImportError(w, err, "get glossary import")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Import glossaryImportReport `json:"import"`
	}{report})
}

// readGlossaryImport reads a multipart form with a `file` part and optional `format`, `mode`
// (default merge), and `strictLocale` fields. The format defaults to the file extension.
func readGlossaryImport(w http.ResponseWriter, r *http.Request) (glossaryImportInput, bool) {
	invalid := func(message string) (glossaryImportInput, bool) {
		writeError(w, http.StatusBadRequest, "invalid_body", message)
		return glossaryImportInput{}, false
	}
	if mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mediaType != "multipart/form-data" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Use Content-Type: multipart/form-data")
		return glossaryImportInput{}, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxGlossaryImportBytes+64*1024)
	reader, err := r.MultipartReader()
	if err != nil {
		return invalid("Request body must be multipart form data")
	}
	input := glossaryImportInput{Mode: "merge"}
	seenFile := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Glossary imports are limited to 25 MB")
				return glossaryImportInput{}, false
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
			input.Body, err = io.ReadAll(io.LimitReader(part, maxGlossaryImportBytes+1))
			_ = part.Close()
			if err != nil {
				return invalid("The file could not be read")
			}
			if len(input.Body) > maxGlossaryImportBytes {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Glossary imports are limited to 25 MB")
				return glossaryImportInput{}, false
			}
			if filename := strings.TrimSpace(part.FileName()); filename != "" && len(filename) <= 512 {
				input.SourceFilename = &filename
				if input.Format == "" {
					input.Format = strings.TrimPrefix(path.Ext(filename), ".")
				}
			}
			continue
		}
		value, err := io.ReadAll(io.LimitReader(part, 65))
		_ = part.Close()
		if err != nil || len(value) > 64 {
			return invalid("A form field is too long")
		}
		text := strings.ToLower(strings.TrimSpace(string(value)))
		switch name {
		case "format":
			input.Format = text
		case "mode":
			input.Mode = text
		case "strictLocale":
			strict, err := strconv.ParseBool(text)
			if err != nil {
				return invalid("strictLocale must be true or false")
			}
			input.StrictLocale = &strict
		default:
			return invalid("Unknown form field: " + name)
		}
	}
	input.Format = strings.ToLower(input.Format)
	if !seenFile || len(input.Body) == 0 {
		return invalid("file is required")
	}
	if !member(input.Format, "tbx", "csv", "xlsx") {
		writeError(w, http.StatusBadRequest, "unsupported_glossary_format", "Upload a TBX, CSV, or XLSX file, or set format")
		return glossaryImportInput{}, false
	}
	if !member(input.Mode, glossaryImportModes...) {
		return invalid("mode must be preview, create, update, merge, or replace")
	}
	return input, true
}
