package main

import (
	"io"
	"net/http"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const maxStoredObjectBytes = 32 << 20

func (h *handler) store(w http.ResponseWriter, locationID string) objectstore.Store {
	if h.objects == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "object_storage_not_configured"})
		return nil
	}
	store, err := h.objects.Resolve(locationID)
	if err != nil {
		writeProviderError(w, err)
		return nil
	}
	return store
}

func (h *handler) putObject(w http.ResponseWriter, r *http.Request) {
	if h.objects == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "object_storage_not_configured"})
		return
	}
	if r.ContentLength < 0 || r.ContentLength > maxStoredObjectBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "invalid_object_size"})
		return
	}
	input := objectstore.PutInput{Key: r.Header.Get("X-Object-Key"), Body: http.MaxBytesReader(w, r.Body, maxStoredObjectBytes), Size: r.ContentLength, ContentType: r.Header.Get("Content-Type"), IfAbsent: true}
	ref, info, err := h.objects.Put(r.Context(), input)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Ref  objectstore.Ref  `json:"ref"`
		Info objectstore.Info `json:"info"`
	}{ref, info})
}

func (h *handler) getObject(w http.ResponseWriter, r *http.Request) {
	var ref objectstore.Ref
	if !decodeProviderRequest(w, r, &ref) {
		return
	}
	store := h.store(w, ref.LocationID)
	if store == nil {
		return
	}
	body, info, err := store.Get(r.Context(), ref.Key)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	defer func() { _ = body.Close() }()
	w.Header().Set("Content-Type", info.ContentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Stream failures cannot be converted into JSON after headers are sent.
	if _, err := io.Copy(w, body); err != nil {
		panic(http.ErrAbortHandler)
	}
}

func (h *handler) statObject(w http.ResponseWriter, r *http.Request) {
	var ref objectstore.Ref
	if !decodeProviderRequest(w, r, &ref) {
		return
	}
	store := h.store(w, ref.LocationID)
	if store == nil {
		return
	}
	info, err := store.Stat(r.Context(), ref.Key)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *handler) deleteObject(w http.ResponseWriter, r *http.Request) {
	var ref objectstore.Ref
	if !decodeProviderRequest(w, r, &ref) {
		return
	}
	store := h.store(w, ref.LocationID)
	if store == nil {
		return
	}
	if err := store.Delete(r.Context(), ref.Key); err != nil {
		writeProviderError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type signObjectRequest struct {
	Ref              objectstore.Ref `json:"ref"`
	ContentType      string          `json:"contentType,omitempty"`
	ExpiresInSeconds int64           `json:"expiresInSeconds"`
}

func (h *handler) sign(w http.ResponseWriter, r *http.Request, upload bool) {
	var req signObjectRequest
	if !decodeProviderRequest(w, r, &req) {
		return
	}
	if req.ExpiresInSeconds < 1 || req.ExpiresInSeconds > 3600 {
		writeBadRequest(w, "expiry must be between 1 and 3600 seconds")
		return
	}
	store := h.store(w, req.Ref.LocationID)
	if store == nil {
		return
	}
	signer, ok := store.(objectstore.Presigner)
	if !ok {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "signing_not_supported"})
		return
	}
	ttl := time.Duration(req.ExpiresInSeconds) * time.Second
	var signed objectstore.SignedRequest
	var err error
	if upload {
		signed, err = signer.PresignUpload(r.Context(), objectstore.Upload{Key: req.Ref.Key, ContentType: req.ContentType, IfAbsent: true}, ttl)
	} else {
		signed, err = signer.PresignDownload(r.Context(), req.Ref.Key, ttl)
	}
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, signed)
}

func (h *handler) signUpload(w http.ResponseWriter, r *http.Request)   { h.sign(w, r, true) }
func (h *handler) signDownload(w http.ResponseWriter, r *http.Request) { h.sign(w, r, false) }
