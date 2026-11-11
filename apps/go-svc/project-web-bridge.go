package main

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
	"github.com/jackc/pgx/v5"
)

// Native project writes whose runtime still lives in the web app: source file
// upload (Blob storage plus the ingest workflow), translation download (the
// file serializers) and job creation (the job workflow). go-svc owns the
// session-authenticated /v1 route, checks membership and that the project is
// native, then forwards the request to the web app's go-svc bridge, which runs
// the same handlers the web app's own pages use. The web side trusts the
// server call token and rebuilds the member's auth context from the verified
// WorkOS identity.

const (
	projectWebBridgePathPrefix = "/api/internal/go-svc/orgs/"
	projectWebBridgeTimeout    = 120 * time.Second
	// Matches the web app's maxProjectFileUploadBytes, plus multipart overhead.
	projectWebBridgeUploadLimit = 25*1024*1024 + 1024*1024
	projectWebBridgeJSONLimit   = 1024 * 1024

	projectWebBridgeUserHeader = "X-Hyperlocalise-Workos-User-Id"
	projectWebBridgeOrgHeader  = "X-Hyperlocalise-Workos-Organization-Id"
)

// Response headers the web handlers set that clients read (downloads name and
// describe the file through these).
var projectWebBridgeResponseHeaders = []string{
	"Content-Type",
	"Content-Disposition",
	"Content-Length",
	"X-Export-Extension",
	"X-Hyperlocalise-Export-Warning-Count",
}

type projectWebBridgeRoute struct {
	// suffix is appended to /projects/{projectId} on both sides.
	suffix    string
	mutation  bool
	bodyLimit int64
}

func (api *projectAPI) registerWebBridge(mux *http.ServeMux, verifier SessionVerifier) {
	project := orgRoutePrefix + "/projects/{projectId}"
	routes := map[string]projectWebBridgeRoute{
		"POST " + project + "/files":                      {suffix: "/files", mutation: true, bodyLimit: projectWebBridgeUploadLimit},
		"GET " + project + "/files/translations/download": {suffix: "/files/translations/download"},
		"POST " + project + "/jobs":                       {suffix: "/jobs", mutation: true, bodyLimit: projectWebBridgeJSONLimit},
	}
	client := &http.Client{
		Timeout:       projectWebBridgeTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	for pattern, route := range routes {
		registerAuthenticated(mux, verifier, pattern, api.webBridgeHandler(client, route))
	}
}

func (api *projectAPI) webBridgeHandler(client *http.Client, route projectWebBridgeRoute) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if route.mutation && denyBrowserMutation(r) {
			writeProjectError(w, r, "origin_guard", projectFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeProjectError(w, r, "availability", projectFailure(503, "projects_unavailable", "Projects are unavailable"))
			return
		}
		claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeProjectError(w, r, "auth", projectFailure(401, "unauthorized", "Unauthorized"))
			return
		}
		slug := r.PathValue("organizationSlug")
		actor, err := api.actor(r.Context(), claims, slug)
		if err != nil {
			writeProjectError(w, r, "resolve_actor", err)
			return
		}
		projectID := strings.TrimSpace(r.PathValue("projectId"))
		if err := api.requireNativeProject(r, actor, projectID); err != nil {
			writeProjectError(w, r, "native_project", err)
			return
		}
		baseURL := strings.TrimRight(tmsauth.BaseURLFromEnv(), "/")
		if baseURL == "" {
			writeProjectError(w, r, "bridge_config", projectFailure(503, "projects_unavailable", "Projects are unavailable"))
			return
		}
		target := baseURL + projectWebBridgePathPrefix + url.PathEscape(slug) + "/projects/" + url.PathEscape(projectID) + route.suffix
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}

		var body io.Reader
		if route.bodyLimit > 0 {
			body = http.MaxBytesReader(w, r.Body, route.bodyLimit)
		}
		upstream, err := http.NewRequestWithContext(r.Context(), r.Method, target, body)
		if err != nil {
			writeProjectError(w, r, "bridge_request", err)
			return
		}
		if contentType := r.Header.Get("Content-Type"); contentType != "" && body != nil {
			upstream.Header.Set("Content-Type", contentType)
		}
		if r.ContentLength > 0 && body != nil {
			upstream.ContentLength = r.ContentLength
		}
		upstream.Header.Set("Accept", r.Header.Get("Accept"))
		upstream.Header.Set(serverCallTokenHeader, serverCallToken())
		upstream.Header.Set(projectWebBridgeUserHeader, claims.UserID)
		if claims.OrgID != "" {
			upstream.Header.Set(projectWebBridgeOrgHeader, claims.OrgID)
		}

		noteRequest(r, "bridge_suffix", route.suffix)
		resp, err := client.Do(upstream)
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				writeProjectError(w, r, "bridge_upload", projectFailure(413, "file_upload_too_large", "File upload is too large"))
				return
			}
			writeProjectError(w, r, "bridge_upstream", projectFailure(502, "projects_unavailable", "Projects are unavailable"))
			return
		}
		defer func() { _ = resp.Body.Close() }()
		noteRequest(r, "bridge_status", resp.StatusCode)
		for _, name := range projectWebBridgeResponseHeaders {
			if value := resp.Header.Get(name); value != "" {
				w.Header().Set(name, value)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})
}

// requireNativeProject 404s a project outside the workspace and refuses one
// synced from an external TMS: these writes only exist for native projects.
// Team access is enforced again by the web handler.
func (api *projectAPI) requireNativeProject(r *http.Request, actor projectActor, projectID string) error {
	if projectID == "" {
		return projectFailure(404, "project_not_found", "Project not found")
	}
	var source string
	err := api.pool.QueryRow(r.Context(),
		`select source from projects where id=$1 and organization_id=$2`,
		projectID, actor.organizationID,
	).Scan(&source)
	if errors.Is(err, pgx.ErrNoRows) {
		return projectFailure(404, "project_not_found", "Project not found")
	}
	if err != nil {
		return err
	}
	if source != "native" {
		return projectFailure(409, "provider_project_unsupported", "This project is managed in an external TMS")
	}
	return nil
}
