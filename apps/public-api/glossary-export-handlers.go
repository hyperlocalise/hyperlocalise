package main

import (
	"errors"
	"net/http"
	"strings"
)

func (s apiServer) glossaryExport(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	glossaryID, ok := pathID(w, r, "glossaryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:read")
	if !ok {
		return
	}
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "tbx"
	}
	if !member(format, "tbx", "csv", "xlsx") {
		writeError(w, http.StatusBadRequest, "invalid_query", "format must be tbx, csv, or xlsx")
		return
	}
	file, err := s.store.exportGlossary(r.Context(), p, glossaryID, format)
	if errors.Is(err, errGlossaryNotNative) {
		writeError(w, http.StatusConflict, "glossary_export_unsupported", "Live provider glossaries cannot be exported. Export mirrored terminology stored in Hyperlocalise instead.")
		return
	}
	if err != nil {
		writeStoreError(w, err, "export glossary")
		return
	}
	writeInterchangeFile(w, r, file)
}
