package main

import (
	"encoding/json"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)

type validateSegmentRequest struct {
	SourceText string   `json:"sourceText"`
	TargetText string   `json:"targetText"`
	SourcePath string   `json:"sourcePath"`
	MaxLength  int      `json:"maxLength"`
	Modes      []string `json:"modes,omitempty"`
}

type validateSegmentResponse struct {
	Checks []segmentvalidate.Check `json:"checks"`
}

type handler struct {
	validate func(segmentvalidate.Request) []segmentvalidate.Check
}

func newHandler() *handler {
	return &handler{
		validate: segmentvalidate.ValidateSegment,
	}
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (h *handler) validateSegment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req validateSegmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeBadRequest(w, "invalid JSON body")
		return
	}

	checks := h.validate(segmentvalidate.Request{
		SourceText: req.SourceText,
		TargetText: req.TargetText,
		SourcePath: req.SourcePath,
		MaxLength:  req.MaxLength,
		Modes:      req.Modes,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(validateSegmentResponse{Checks: checks})
}

func writeBadRequest(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "bad_request",
		"message": message,
	})
}
