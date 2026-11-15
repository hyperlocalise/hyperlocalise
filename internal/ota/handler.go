package ota

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

const publicHashPattern = `^[0-9a-f]{32}$`

type Handler struct {
	lookup Lookup
}

func NewHandler(lookup Lookup) *Handler {
	return &Handler{lookup: lookup}
}

func (h *Handler) Register(mux *http.ServeMux) {
	wrap := func(next http.HandlerFunc) http.Handler {
		return cors(http.HandlerFunc(next))
	}
	mux.Handle("GET /ota/{hash}/manifest.json", wrap(h.manifest))
	mux.Handle("HEAD /ota/{hash}/manifest.json", wrap(h.manifest))
	mux.Handle("OPTIONS /ota/{hash}/manifest.json", wrap(h.manifest))
	mux.Handle("GET /ota/{hash}/content/{locale}/{path...}", wrap(h.content))
	mux.Handle("HEAD /ota/{hash}/content/{locale}/{path...}", wrap(h.content))
	mux.Handle("OPTIONS /ota/{hash}/content/{locale}/{path...}", wrap(h.content))
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "If-None-Match")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) manifest(w http.ResponseWriter, r *http.Request) {
	release, ok := h.load(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.WriteHeader(http.StatusOK)
	if len(release.Manifest) == 0 {
		_, _ = w.Write([]byte(`{}`))
		return
	}
	_, _ = w.Write(release.Manifest)
}

func (h *Handler) content(w http.ResponseWriter, r *http.Request) {
	release, ok := h.load(w, r)
	if !ok {
		return
	}
	locale := r.PathValue("locale")
	path := strings.Trim(r.PathValue("path"), "/")
	if locale == "" || path == "" || strings.Contains(path, "..") {
		missing(w)
		return
	}
	body, found := release.Contents[locale][path]
	if !found {
		missing(w)
		return
	}
	w.Header().Set("Content-Type", contentType(release.Format))
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func (h *Handler) load(w http.ResponseWriter, r *http.Request) (*Release, bool) {
	hash := strings.ToLower(r.PathValue("hash"))
	if len(hash) != 32 || strings.Trim(hash, "0123456789abcdef") != "" {
		missing(w)
		return nil, false
	}
	if h == nil || h.lookup == nil {
		missing(w)
		return nil, false
	}
	release, err := h.lookup.LatestUnrevoked(r.Context(), hash)
	if err != nil {
		if !errors.Is(err, ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "general"})
			return nil, false
		}
		missing(w)
		return nil, false
	}
	return release, true
}

func missing(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
}

func contentType(format string) string {
	switch format {
	case "android_xml", "android-xml":
		return "application/xml; charset=utf-8"
	case "ios_strings", "ios-strings":
		return "text/plain; charset=utf-8"
	default:
		return "application/json; charset=utf-8"
	}
}

var _ = publicHashPattern
