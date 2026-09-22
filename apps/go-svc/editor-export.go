package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
)

const maxEditorFilteredExportBodyBytes = 32 << 20 // 32 MiB

type editorFilteredExportRequest struct {
	Format string              `json:"format"`
	Rows   []editor_export.Row `json:"rows"`
}

func (h *handler) serializeEditorFilteredExport(w http.ResponseWriter, r *http.Request) {
	if denyBrowserMutation(r) {
		writeForbidden(w, "Cross-origin request denied")
		return
	}
	var req editorFilteredExportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorFilteredExportBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w)
			return
		}
		writeBadRequest(w, "invalid export request")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeBadRequest(w, "expected one JSON object")
		return
	}

	format, err := editor_export.ParseFormat(req.Format)
	if err != nil {
		writeBadRequest(w, err.Error())
		return
	}
	if len(req.Rows) == 0 {
		writeBadRequest(w, "export rows required")
		return
	}
	if len(req.Rows) > editor_export.MaxRows {
		writeBadRequest(w, "too many export rows")
		return
	}

	result, err := editor_export.Serialize(format, req.Rows)
	if err != nil {
		writeBadRequest(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("X-Export-Extension", result.Extension)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Body)
}
