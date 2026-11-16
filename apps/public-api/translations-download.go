package main

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// A language's translations of one source file are rendered by the web app (structured files,
// Office, PDF, HTML, Lottie). This route forwards to the platform's own
// GET /api/v1/projects/{projectId}/translations/download with the caller's token, so the web app
// checks access and renders the file exactly as it does there, and streams the answer back.

const (
	translationsDownloadPathTemplate = "/api/v1/projects/%s/translations/download"
	translationsDownloadTimeout      = 5 * time.Minute
)

// translationsDownloadHeaders are the platform response headers passed back to the caller.
var translationsDownloadHeaders = []string{
	"Content-Type", "Content-Disposition", "Content-Length", "X-Hyperlocalise-Overflow-Keys",
}

// translationsRenderer forwards a download request to the web app.
type translationsRenderer struct {
	baseURL string
	http    webhookMintDoer
}

func newTranslationsRendererFromEnv() *translationsRenderer {
	baseURL := strings.TrimRight(webAppBaseURLFromEnv(), "/")
	if baseURL == "" {
		slog.Warn("translations download disabled", "reason", "web app URL not configured")
		return nil
	}
	return &translationsRenderer{baseURL: baseURL, http: &http.Client{
		Timeout: translationsDownloadTimeout,
		// The platform answers directly; a redirect would send the token somewhere else.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func withTranslationsRenderer(renderer *translationsRenderer) handlerOption {
	return func(s *apiServer) { s.translations = renderer }
}

// translationsDownload streams one source file's translations into a language.
func (s apiServer) translationsDownload(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	if _, ok := s.authenticate(w, r, "files:read"); !ok {
		return
	}
	query := r.URL.Query()
	sourcePath := strings.TrimSpace(query.Get("sourcePath"))
	locale := strings.TrimSpace(query.Get("locale"))
	if sourcePath == "" || len(sourcePath) > 2048 || locale == "" || len(locale) > 32 {
		writeError(w, http.StatusBadRequest, "invalid_translation_payload", "sourcePath and locale are required")
		return
	}
	if s.translations == nil {
		writeError(w, http.StatusServiceUnavailable, "translations_download_unavailable", "Translation downloads are temporarily unavailable")
		return
	}
	target := s.translations.baseURL + strings.Replace(translationsDownloadPathTemplate, "%s", url.PathEscape(projectID), 1) +
		"?" + url.Values{"sourcePath": {sourcePath}, "locale": {locale}}.Encode()
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "translations_download_unavailable", "Translation downloads are temporarily unavailable")
		return
	}
	// Rendering can take longer than the server's write timeout, which counts from the request.
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(fileDownloadWriteTimeout)); err != nil &&
		!errors.Is(err, http.ErrNotSupported) {
		slog.Warn("extend download write deadline failed", "error", err)
	}
	// authenticate accepted exactly one token, so this is the caller's own.
	req.Header.Set("X-Api-Key", r.Header.Get("X-Api-Key"))
	req.Header.Set("Accept", "*/*")
	resp, err := s.translations.http.Do(req)
	if err != nil {
		slog.Warn("translations download request failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "translations_download_unavailable", "Translation downloads are temporarily unavailable")
		return
	}
	defer func() { _ = resp.Body.Close() }()
	redirected := resp.StatusCode >= 300 && resp.StatusCode < 400
	if redirected || (resp.StatusCode >= 500 && !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json")) {
		writeError(w, http.StatusServiceUnavailable, "translations_download_unavailable", "Translation downloads are temporarily unavailable")
		return
	}
	header := w.Header()
	for _, name := range translationsDownloadHeaders {
		if value := resp.Header.Get(name); value != "" {
			header.Set(name, value)
		}
	}
	if resp.StatusCode == http.StatusOK {
		header.Set("Content-Security-Policy", "default-src 'none'; sandbox;")
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("X-Download-Options", "noopen")
	}
	header.Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		slog.Warn("stream translations download failed", "error", err)
	}
}
