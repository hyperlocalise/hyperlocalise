package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
	"github.com/quiet-circles/hyperlocalise/pkg/client/tmsgrpc"
	platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"
	"github.com/quiet-circles/hyperlocalise/pkg/platform/observability"
)

const idempotencyHeader = "Idempotency-Key"

type Server struct {
	httpServer *http.Server
}

func NewServer(cfg platformconfig.ServiceConfig, backend tmsgrpc.Backend, logger *observability.Logger) *Server {
	mux := http.NewServeMux()
	registerRoutes(mux, backend, logger)

	return &Server{
		httpServer: &http.Server{
			Addr:              cfg.Address(),
			Handler:           mux,
			ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		},
	}
}

func (s *Server) ListenAndServe() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

func registerRoutes(mux *http.ServeMux, backend tmsgrpc.Backend, logger *observability.Logger) {
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc(openapi.TranslationJobsPath, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			filter, err := parseListFilter(r)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, openapi.ErrorResponse{Error: err.Error()})
				return
			}
			items, err := backend.ListTranslationJobs(r.Context(), filter)
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, openapi.TranslationJobListResponse{Items: items})
		case http.MethodPost:
			var req openapi.CreateTranslationJobRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, openapi.ErrorResponse{Error: "invalid JSON body"})
				return
			}
			job, err := backend.CreateTranslationJob(r.Context(), req, r.Header.Get(idempotencyHeader))
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusAccepted, job)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc(openapi.TranslationJobsPath+"/", func(w http.ResponseWriter, r *http.Request) {
		id, action := parseJobPath(r.URL.Path)
		if id == "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		switch {
		case action == "" && r.Method == http.MethodGet:
			job, err := backend.GetTranslationJob(r.Context(), id)
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, job)
		case action == "cancel" && r.Method == http.MethodPost:
			job, err := backend.CancelTranslationJob(r.Context(), id)
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusAccepted, job)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	logger.Printf("registered translation HTTP routes")
}

func parseListFilter(r *http.Request) (tmsgrpc.TranslationJobFilter, error) {
	query := r.URL.Query()
	filter := tmsgrpc.TranslationJobFilter{
		ProjectID:    strings.TrimSpace(query.Get("projectId")),
		Status:       strings.TrimSpace(query.Get("status")),
		TargetLocale: strings.TrimSpace(query.Get("targetLocale")),
		Cursor:       strings.TrimSpace(query.Get("cursor")),
	}

	if raw := strings.TrimSpace(query.Get("createdAfter")); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return tmsgrpc.TranslationJobFilter{}, errors.New("createdAfter must be RFC3339")
		}
		filter.CreatedAfter = parsed
	}
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			return tmsgrpc.TranslationJobFilter{}, errors.New("limit must be an integer")
		}
		filter.Limit = limit
	}
	return filter, nil
}

func parseJobPath(rawPath string) (string, string) {
	path := strings.TrimPrefix(rawPath, openapi.TranslationJobsPath+"/")
	if path == rawPath {
		return "", ""
	}
	if actionIndex := strings.Index(path, ":"); actionIndex >= 0 {
		return path[:actionIndex], path[actionIndex+1:]
	}
	return path, ""
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, tmsgrpc.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, tmsgrpc.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, tmsgrpc.ErrBadRequest):
		status = http.StatusBadRequest
	}

	writeJSON(w, status, openapi.ErrorResponse{Error: sanitizeError(err)})
}

func sanitizeError(err error) string {
	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		return "internal error"
	}

	return msg
}
