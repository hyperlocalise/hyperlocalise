package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	maxProviderJSONBytes = 32 << 10
)

func decodeProviderRequest(w http.ResponseWriter, r *http.Request, dest any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxProviderJSONBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		writeBadRequest(w, r, "invalid provider request")
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeBadRequest(w, r, "expected one JSON object")
		return false
	}
	return true
}

func writeProviderError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, objectstore.ErrNotFound):
		noteRequest(r, "code", "object_not_found")
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "object_not_found"})
	case errors.Is(err, objectstore.ErrAlreadyExists):
		noteRequest(r, "code", "object_already_exists")
		writeJSON(w, http.StatusConflict, map[string]string{"error": "object_already_exists"})
	case errors.Is(err, objectstore.ErrInvalidInput), errors.Is(err, objectstore.ErrUnknownLocation), errors.Is(err, guidelines.ErrInvalidInput):
		writeBadRequest(w, r, "invalid provider request")
	default:
		noteRequest(r, "code", "provider_operation_failed")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "provider_operation_failed"})
	}
}
