package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
)

const (
	maxEditorFilteredExportBodyBytes  = 32 << 20 // 32 MiB
	maxEditorFilteredParseBodyBytes   = 26 << 20
	editorFilteredParseFileFormName   = "file"
	editorFilteredParseFormatFormName = "format"
)

type editorFilteredExportRequest struct {
	Format string              `json:"format"`
	Rows   []editor_export.Row `json:"rows"`
}

func (h *handler) serializeEditorFilteredExport(w http.ResponseWriter, r *http.Request) {
	if denyBrowserMutation(r) {
		writeForbidden(w, r, "Cross-origin request denied")
		return
	}
	var req editorFilteredExportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorFilteredExportBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w, r)
			return
		}
		writeBadRequest(w, r, "invalid export request")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeBadRequest(w, r, "expected one JSON object")
		return
	}

	format, err := editor_export.ParseFormat(req.Format)
	if err != nil {
		writeBadRequest(w, r, err.Error())
		return
	}
	if len(req.Rows) == 0 {
		writeBadRequest(w, r, "export rows required")
		return
	}
	if len(req.Rows) > editor_export.MaxRows {
		writeBadRequest(w, r, "too many export rows")
		return
	}

	result, err := editor_export.Serialize(format, req.Rows)
	if err != nil {
		writeBadRequest(w, r, err.Error())
		return
	}

	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("X-Export-Extension", result.Extension)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Body)
}

type editorFilteredParseResponse struct {
	Rows []editor_export.Row `json:"rows"`
}

func (h *handler) parseEditorFilteredExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	r.Body = http.MaxBytesReader(w, r.Body, maxEditorFilteredParseBodyBytes)
	format, body, err := readEditorFilteredParseRequest(r)
	if err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w, r)
			return
		}
		writeBadRequest(w, r, err.Error())
		return
	}

	rows, err := editor_export.Parse(format, body)
	if err != nil {
		writeBadRequest(w, r, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, editorFilteredParseResponse{Rows: rows})
}

func readEditorFilteredParseRequest(r *http.Request) (editor_export.Format, []byte, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		return "", nil, fmt.Errorf("expected multipart form data")
	}

	reader, err := r.MultipartReader()
	if err != nil {
		return "", nil, fmt.Errorf("expected multipart form data")
	}

	var (
		rawFormat string
		filename  string
		fileBody  []byte
		seenFile  bool
	)
	for {
		part, nextErr := reader.NextPart()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			return "", nil, fmt.Errorf("expected multipart form data")
		}
		name := part.FormName()
		switch name {
		case editorFilteredParseFormatFormName:
			value, readErr := io.ReadAll(io.LimitReader(part, 64))
			_ = part.Close()
			if readErr != nil {
				return "", nil, fmt.Errorf("invalid export format")
			}
			rawFormat = string(value)
		case editorFilteredParseFileFormName:
			if seenFile {
				_ = part.Close()
				return "", nil, fmt.Errorf("expected one bilingual file")
			}
			seenFile = true
			filename = path.Base(part.FileName())
			value, readErr := io.ReadAll(io.LimitReader(part, maxEditorFilteredParseBodyBytes+1))
			_ = part.Close()
			if readErr != nil {
				return "", nil, fmt.Errorf("unable to read bilingual file")
			}
			if len(value) > maxEditorFilteredParseBodyBytes {
				return "", nil, &http.MaxBytesError{Limit: maxEditorFilteredParseBodyBytes}
			}
			fileBody = value
		default:
			_, _ = io.Copy(io.Discard, io.LimitReader(part, 1<<20))
			_ = part.Close()
		}
	}

	if !seenFile || len(fileBody) == 0 {
		return "", nil, fmt.Errorf("bilingual file required")
	}

	format, err := editor_export.ParseFormat(strings.TrimSpace(rawFormat))
	if err != nil {
		if filename != "" {
			format, err = editor_export.FormatFromFilename(filename)
		}
		if err != nil {
			return "", nil, fmt.Errorf("unsupported export format")
		}
	}
	return format, fileBody, nil
}
