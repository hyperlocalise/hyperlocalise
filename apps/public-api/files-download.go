package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

// Stored files are the web app's uploads and job outputs. Their bytes live with the provider
// stored_files.storage_provider names (Vercel Blob today) at storage_key.

const (
	storageProviderVercelBlob = "vercel_blob"
	// fileDownloadWriteTimeout replaces the server's write timeout for one download.
	fileDownloadWriteTimeout = 10 * time.Minute
)

var (
	errStoredFileNotFound     = fmt.Errorf("%w: stored file", errResourceNotFound)
	errFileStorageUnavailable = errors.New("file storage is not configured")
)

// storedFileDownload is an open stored file. The caller closes Body.
type storedFileDownload struct {
	Filename    string
	ContentType string
	Size        int64
	Body        io.ReadCloser
}

// openStoredFile follows the platform's GET /api/v1/files/{fileId}/download: a file of a project
// the token can access, or one in no project that its owner may read.
func (s *postgresStore) openStoredFile(ctx context.Context, actor principal, fileID string) (storedFileDownload, error) {
	var projectID, createdBy *string
	var provider, key string
	var file storedFileDownload
	err := s.pool.QueryRow(ctx, `SELECT f.project_id, f.created_by_user_id::text, f.storage_provider, f.storage_key,
			f.filename, f.content_type
		FROM stored_files f
		WHERE f.id = $1 AND f.organization_id = $2`, fileID, actor.OrganizationID).
		Scan(&projectID, &createdBy, &provider, &key, &file.Filename, &file.ContentType)
	if errors.Is(err, pgx.ErrNoRows) {
		return storedFileDownload{}, errStoredFileNotFound
	}
	if err != nil {
		return storedFileDownload{}, fmt.Errorf("load stored file: %w", err)
	}
	if projectID != nil {
		if _, err := loadProjectScope(ctx, s.pool, actor, *projectID); err != nil {
			if errors.Is(err, errProjectNotFound) {
				return storedFileDownload{}, errStoredFileNotFound
			}
			return storedFileDownload{}, err
		}
	} else if actor.Role != "admin" && actor.Role != "localization_manager" && createdBy != nil && *createdBy != actor.UserID {
		return storedFileDownload{}, errStoredFileNotFound
	}
	store := s.fileStores[provider]
	if store == nil {
		return storedFileDownload{}, errFileStorageUnavailable
	}
	body, info, err := store.Get(ctx, key)
	if errors.Is(err, objectstore.ErrNotFound) {
		return storedFileDownload{}, errStoredFileNotFound
	}
	if err != nil {
		return storedFileDownload{}, fmt.Errorf("read stored file: %w", err)
	}
	if info.ContentType != "" {
		file.ContentType = info.ContentType
	}
	file.Size = info.Size
	file.Body = body
	return file, nil
}

// fileDownload streams a stored file: a job's source file or one of its output files.
func (s apiServer) fileDownload(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	fileID, ok := pathID(w, r, "fileId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "files:read")
	if !ok {
		return
	}
	file, err := s.store.openStoredFile(r.Context(), p, fileID)
	switch {
	case errors.Is(err, errStoredFileNotFound):
		writeError(w, http.StatusNotFound, "file_not_found", "File not found")
		return
	case errors.Is(err, errFileStorageUnavailable):
		writeError(w, http.StatusServiceUnavailable, "file_storage_unavailable", "File storage is temporarily unavailable")
		return
	case err != nil:
		writeStoreError(w, err, "download file")
		return
	}
	defer func() { _ = file.Body.Close() }()
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(fileDownloadWriteTimeout)); err != nil &&
		!errors.Is(err, http.ErrNotSupported) {
		slog.Warn("extend download write deadline failed", "error", err)
	}
	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	header := w.Header()
	header.Set("Content-Type", contentType)
	// The platform's headers: always an attachment, never rendered or cached.
	header.Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(file.Filename))
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox;")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Download-Options", "noopen")
	header.Set("Cache-Control", "no-store")
	if file.Size > 0 {
		header.Set("Content-Length", fmt.Sprint(file.Size))
	}
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, file.Body); err != nil {
		slog.Warn("stream file download failed", "error", err)
	}
}
