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
		writeBadRequest(w, "invalid provider request")
		return false
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeBadRequest(w, "expected one JSON object")
		return false
	}
	return true
}

func writeProviderError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, objectstore.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "object_not_found"})
	case errors.Is(err, objectstore.ErrAlreadyExists):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "object_already_exists"})
	case errors.Is(err, objectstore.ErrInvalidInput), errors.Is(err, objectstore.ErrUnknownLocation), errors.Is(err, guidelines.ErrInvalidInput):
		writeBadRequest(w, "invalid provider request")
	default:
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "provider_operation_failed"})
	}
}
