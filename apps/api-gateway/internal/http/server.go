package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
	"github.com/quiet-circles/hyperlocalise/pkg/client/tmsgrpc"
	platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"
	"github.com/quiet-circles/hyperlocalise/pkg/platform/observability"
)

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

	mux.HandleFunc(openapi.ProjectsPath, func(w http.ResponseWriter, r *http.Request) {
		projects, err := backend.ListProjects(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, openapi.ProjectListResponse{Items: projects})
	})

	mux.HandleFunc(openapi.ResourcesPath, func(w http.ResponseWriter, r *http.Request) {
		resources, err := backend.ListResources(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, openapi.ResourceListResponse{Items: resources})
	})

	mux.HandleFunc(openapi.JobsPath, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			jobs, err := backend.ListJobs(r.Context())
			if err != nil {
				writeError(w, err)
				return
			}

			writeJSON(w, http.StatusOK, openapi.JobListResponse{Items: jobs})
		case http.MethodPost:
			var req openapi.CreateJobRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, openapi.ErrorResponse{Error: "invalid JSON body"})
				return
			}

			job, err := backend.CreateJob(r.Context(), req)
			if err != nil {
				writeError(w, err)
				return
			}

			writeJSON(w, http.StatusAccepted, job)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc(openapi.TranslationMemoryPath, func(w http.ResponseWriter, r *http.Request) {
		items, err := backend.ListTranslationMemory(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, openapi.TranslationMemoryListResponse{Items: items})
	})

	mux.HandleFunc(openapi.GlossariesPath, func(w http.ResponseWriter, r *http.Request) {
		items, err := backend.ListGlossaries(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, openapi.GlossaryListResponse{Items: items})
	})

	mux.HandleFunc(openapi.WorkflowsPath, func(w http.ResponseWriter, r *http.Request) {
		items, err := backend.ListWorkflows(r.Context())
		if err != nil {
			writeError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, openapi.WorkflowListResponse{Items: items})
	})

	logger.Printf("registered TMS HTTP routes")
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
	if errors.Is(err, tmsgrpc.ErrNotFound) {
		status = http.StatusNotFound
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
