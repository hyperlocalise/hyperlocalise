package main

import (
	"context"
	"net/http"
	"time"
)

const publicMemoryRequestTimeout = 30 * time.Second

type publicMemoryAPI struct {
	auth     *publicAPIAuth
	memories *memoryAPI
}

func (api *publicMemoryAPI) register(mux *http.ServeMux) {
	if api == nil || api.auth == nil {
		return
	}
	base := "/v1/translation-memories/{memoryId}"
	for pattern, spec := range map[string]struct {
		scope   string
		handler func(http.ResponseWriter, *http.Request)
	}{
		"GET " + base + "/entries/export": {
			scope:   "memories:read",
			handler: api.exportEntries,
		},
		"POST " + base + "/entries/export": {
			scope:   "memories:read",
			handler: api.createExport,
		},
		"POST " + base + "/entries/import/uploads": {
			scope:   "memories:write",
			handler: api.createImportUpload,
		},
		"POST " + base + "/entries/import": {
			scope:   "memories:write",
			handler: api.importEntries,
		},
		"GET " + base + "/import-attempts/{attemptId}": {
			scope:   "memories:read",
			handler: api.getImportAttempt,
		},
		"GET " + base + "/import-attempts/{attemptId}/download": {
			scope:   "memories:read",
			handler: api.downloadImportAttempt,
		},
	} {
		protected := api.auth.middleware(api.auth.requirePermission(spec.scope, http.HandlerFunc(spec.handler)))
		mux.Handle(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			ctx, cancel := context.WithTimeout(r.Context(), publicMemoryRequestTimeout)
			defer cancel()
			protected.ServeHTTP(w, r.WithContext(ctx))
		}))
	}
}

func (api *publicMemoryAPI) exportEntries(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).exportMemoryEntriesHandler)
}

func (api *publicMemoryAPI) createExport(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).createMemoryExportHandler)
}

func (api *publicMemoryAPI) createImportUpload(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).createMemoryImportUploadHandler)
}

func (api *publicMemoryAPI) importEntries(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).importMemoryEntriesHandler)
}

func (api *publicMemoryAPI) getImportAttempt(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).getMemoryImportAttemptHandler)
}

func (api *publicMemoryAPI) downloadImportAttempt(w http.ResponseWriter, r *http.Request) {
	api.serveOwned(w, r, (*memoryAPI).getMemoryInterchangeDownloadHandler)
}

func (api *publicMemoryAPI) serveOwned(
	w http.ResponseWriter,
	r *http.Request,
	fn func(*memoryAPI, *http.Request, memoryActor, memoryRecord) (any, int, error),
) {
	if api.memories == nil || api.memories.pool == nil {
		api.auth.writeError(w, r, "availability", publicAPIFailure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable"))
		return
	}
	principal, ok := publicAPIPrincipalFrom(r.Context())
	if !ok {
		api.auth.writeError(w, r, "auth", publicAPIAuthenticationRequired())
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, memoryBodyLimit)
	actor := memoryActor{userID: principal.userID, organizationID: principal.organizationID, role: principal.role}
	memory, err := ownedMemory(r.Context(), api.memories.pool, actor, r.PathValue("memoryId"))
	if err != nil {
		writeMemoryError(w, r, "load", err)
		return
	}
	value, status, err := fn(api.memories, r, actor, memory)
	if err != nil {
		writeMemoryError(w, r, "handle", err)
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	if download, ok := value.(interchangeDownload); ok {
		writeInterchangeDownload(w, status, download)
		return
	}
	memoryJSON(w, status, value)
}
