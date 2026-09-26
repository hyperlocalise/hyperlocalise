package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

const maxTokenLength = 512

func newHandler(auth authenticator) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if !allowRead(w, r) {
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/v1/me", func(w http.ResponseWriter, r *http.Request) {
		if !allowRead(w, r) {
			return
		}
		tokens := r.Header.Values("X-Api-Key")
		if len(tokens) != 1 || tokens[0] == "" || len(tokens[0]) > maxTokenLength || strings.TrimSpace(tokens[0]) != tokens[0] || strings.Contains(tokens[0], ",") {
			writeError(w, http.StatusUnauthorized, "unauthorized", "A personal access token is required in x-api-key")
			return
		}
		p, err := auth.authenticate(r.Context(), tokens[0])
		switch {
		case errors.Is(err, errUnauthorized):
			writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid or revoked API key")
		case errors.Is(err, errForbidden):
			writeError(w, http.StatusForbidden, "forbidden", "Workspace access denied")
		case err != nil:
			writeError(w, http.StatusServiceUnavailable, "authentication_unavailable", "Authentication is temporarily unavailable")
		default:
			writeJSON(w, http.StatusOK, struct {
				Principal principal `json:"principal"`
			}{p})
		}
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
}

func allowRead(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	w.Header().Set("Allow", "GET, HEAD")
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use GET or HEAD")
	return false
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}{code, message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("response write failed", "status", status)
	}
}
