package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/image/webp"
)

const (
	screenshotUploadTTL      = 15 * time.Minute
	screenshotDownloadTTL    = time.Hour
	screenshotMaxBytes       = 10 * 1024 * 1024
	screenshotMaxFilenameLen = 255
	screenshotMaxNameRunes   = 256
	screenshotMaxImagePixels = 25_000_000
	screenshotMaxImageSide   = 10_000
	screenshotMaxMarkers     = 1000
	screenshotStaleUploadAge = screenshotUploadTTL + 45*time.Minute
	screenshotStaleUploadN   = 20
	screenshotMarkerEpsilon  = 1e-9
)

var (
	errScreenshotNotFound           = fmt.Errorf("%w: screenshot", errResourceNotFound)
	errScreenshotMarkerNotFound     = fmt.Errorf("%w: screenshot marker", errResourceNotFound)
	errScreenshotStorageUnavailable = errors.New("screenshot object storage is not configured")
	errScreenshotUploadMissing      = errors.New("screenshot upload has not completed")
	errScreenshotNotPending         = errors.New("screenshot is no longer waiting for upload")
	errScreenshotUploadTooLarge     = errors.New("screenshot exceeds the 10 MB limit")
	errScreenshotInvalidImage       = errors.New("uploaded file is not a valid PNG, JPEG, or WebP image")
	errScreenshotInvalidFilename    = errors.New("invalid screenshot filename")
	errScreenshotInvalidContentType = errors.New("screenshot content type does not match the filename")
	errScreenshotInvalidMarker      = errors.New("invalid screenshot marker")
	errScreenshotInvalidDimensions  = errors.New("invalid screenshot dimensions")
	errScreenshotAmbiguousKey       = errors.New("screenshot key matches more than one string")
	errTooManyScreenshotMarkers     = errors.New("a screenshot holds at most 1,000 markers")
	errScreenshotMarkerNeedsString  = errors.New("each marker must pick one string")
	errVisualContextInvalidImage    = errors.New("visual context upload is not a supported image")
)

type screenshotMarkerBox struct {
	Left   float64 `json:"left"`
	Top    float64 `json:"top"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type screenshotMarker struct {
	ID           string               `json:"id"`
	ScreenshotID string               `json:"screenshotId"`
	StringID     string               `json:"stringId"`
	Key          string               `json:"key"`
	FilePath     *string              `json:"filePath"`
	Marker       *screenshotMarkerBox `json:"marker"`
	Source       string               `json:"source"`
}

type screenshot struct {
	ID          string             `json:"id"`
	Name        *string            `json:"name"`
	Filename    string             `json:"filename"`
	ContentType string             `json:"contentType"`
	Status      string             `json:"status"`
	Width       *int               `json:"width"`
	Height      *int               `json:"height"`
	ImageURL    *string            `json:"imageUrl"`
	FigmaURL    *string            `json:"figmaUrl"`
	Markers     []screenshotMarker `json:"markers"`
	CreatedAt   time.Time          `json:"createdAt"`
	UpdatedAt   time.Time          `json:"updatedAt"`
	location    string             `json:"-"`
	key         string             `json:"-"`
}

type screenshotUpload struct {
	URL       string              `json:"url"`
	Method    string              `json:"method"`
	Headers   map[string][]string `json:"headers"`
	ExpiresAt time.Time           `json:"expiresAt"`
}

type screenshotCreateResult struct {
	Screenshot screenshot       `json:"screenshot"`
	Upload     screenshotUpload `json:"upload"`
}

type screenshotFilters struct {
	StringID string
	Key      string
	FilePath string
	Status   string
	Limit    int
	Offset   int
}

type screenshotCreate struct {
	Filename    string
	ContentType string
	ByteSize    int64
	Name        *string
	Width       *int
	Height      *int
	Markers     []screenshotMarkerInput
}

type screenshotFinalize struct {
	Name   *string `json:"name"`
	Width  *int    `json:"width"`
	Height *int    `json:"height"`
}

type screenshotMarkerInput struct {
	StringID string
	Key      string
	FilePath string
	Marker   *screenshotMarkerBox
}

type screenshotExec interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (s *postgresStore) listScreenshots(ctx context.Context, actor principal, projectID string, filters screenshotFilters) ([]screenshot, int, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	if err := scope.requireNative(); err != nil {
		return nil, 0, err
	}
	where := newSQLFilter("s.organization_id = $1 AND s.project_id = $2", actor.OrganizationID, scope.ID)
	if filters.StringID != "" || filters.Key != "" || filters.FilePath != "" {
		bound := []string{"b.screenshot_id = s.id", "k.id = b.translation_key_id"}
		fileJoin := ""
		if filters.StringID != "" {
			where.args = append(where.args, filters.StringID)
			bound = append(bound, fmt.Sprintf("k.id = $%d::uuid", len(where.args)))
		}
		if filters.Key != "" {
			where.args = append(where.args, filters.Key)
			bound = append(bound, fmt.Sprintf("k.key = $%d", len(where.args)))
		}
		if filters.FilePath != "" {
			fileJoin = " JOIN repository_source_files f ON f.id = k.repository_source_file_id"
			where.args = append(where.args, filters.FilePath)
			bound = append(bound, fmt.Sprintf("f.source_path = $%d", len(where.args)))
		}
		where.conditions = append(where.conditions, `EXISTS (
			SELECT 1 FROM project_visual_context_bindings b
			JOIN project_translation_keys k ON k.id = b.translation_key_id`+fileJoin+`
			WHERE `+strings.Join(bound, " AND ")+`)`)
	}
	if filters.Status != "" {
		where.add("s.status = ?", filters.Status)
	}
	from := `FROM project_visual_context_screenshots s`
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+from+` WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count screenshots: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT s.id, s.name, s.filename, s.content_type, s.status, s.width, s.height,
			s.object_location, s.object_key, s.figma_url, s.created_at, s.updated_at
		`+from+` WHERE `+where.sql()+`
		ORDER BY s.created_at DESC, s.id ASC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list screenshots: %w", err)
	}
	items, err := collectRows(rows, scanScreenshotRow)
	if err != nil {
		return nil, 0, err
	}
	if err := s.attachScreenshotMarkers(ctx, actor, scope, items); err != nil {
		return nil, 0, err
	}
	if err := s.signScreenshotDownloads(ctx, items); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (s *postgresStore) getScreenshot(ctx context.Context, actor principal, projectID, screenshotID string) (screenshot, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return screenshot{}, err
	}
	if err := scope.requireNative(); err != nil {
		return screenshot{}, err
	}
	item, err := s.loadScreenshot(ctx, s.pool, actor, scope, screenshotID)
	if err != nil {
		return screenshot{}, err
	}
	items := []screenshot{item}
	if err := s.attachScreenshotMarkers(ctx, actor, scope, items); err != nil {
		return screenshot{}, err
	}
	if err := s.signScreenshotDownloads(ctx, items); err != nil {
		return screenshot{}, err
	}
	return items[0], nil
}

func (s *postgresStore) createScreenshot(ctx context.Context, actor principal, projectID string, input screenshotCreate) (screenshotCreateResult, error) {
	if s.objects == nil {
		return screenshotCreateResult{}, errScreenshotStorageUnavailable
	}
	filename, contentType, err := normalizeScreenshotUpload(input.Filename, input.ContentType)
	if err != nil {
		return screenshotCreateResult{}, err
	}
	if input.ByteSize <= 0 || input.ByteSize > screenshotMaxBytes {
		return screenshotCreateResult{}, errScreenshotUploadTooLarge
	}
	if err := validateScreenshotDimensions(input.Width, input.Height); err != nil {
		return screenshotCreateResult{}, err
	}
	if len(input.Markers) > screenshotMaxMarkers {
		return screenshotCreateResult{}, errTooManyScreenshotMarkers
	}
	for _, marker := range input.Markers {
		if err := validateScreenshotMarkerInput(marker); err != nil {
			return screenshotCreateResult{}, err
		}
	}
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return screenshotCreateResult{}, err
	}
	if err := scope.requireNative(); err != nil {
		return screenshotCreateResult{}, err
	}
	s.sweepStaleScreenshotUploads(ctx, actor, scope)
	location := s.objects.DefaultLocationID()
	signer, err := s.objects.Presigner(location)
	if err != nil {
		return screenshotCreateResult{}, errScreenshotStorageUnavailable
	}
	screenshotID := uuid.NewString()
	objectKey := fmt.Sprintf("visual-context/%s/%s/%s/%s", actor.OrganizationID, scope.ID, screenshotID, filename)
	signed, err := signer.PresignUpload(ctx, objectstore.Upload{
		Key:           objectKey,
		ContentType:   contentType,
		ContentLength: input.ByteSize,
		IfAbsent:      true,
	}, screenshotUploadTTL)
	if err != nil {
		return screenshotCreateResult{}, fmt.Errorf("sign screenshot upload: %w", err)
	}
	name := optionalScreenshotName(input.Name)
	now := time.Now().UTC()
	item := screenshot{
		ID:          screenshotID,
		Name:        name,
		Filename:    filename,
		ContentType: contentType,
		Status:      "upload_pending",
		Width:       input.Width,
		Height:      input.Height,
		Markers:     []screenshotMarker{},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	err = s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO project_visual_context_screenshots (
				id, organization_id, project_id, name, filename, content_type,
				object_location, object_key, status, width, height, created_by_user_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upload_pending',$9,$10,$11)`,
			screenshotID, actor.OrganizationID, scope.ID, name, filename, contentType,
			location, objectKey, input.Width, input.Height, actor.UserID,
		); err != nil {
			return fmt.Errorf("insert screenshot: %w", err)
		}
		markers, err := s.upsertScreenshotMarkerRows(ctx, tx, actor, scope, screenshotID, input.Markers)
		if err != nil {
			return err
		}
		item.Markers = markers
		return nil
	})
	if err != nil {
		return screenshotCreateResult{}, err
	}
	return screenshotCreateResult{
		Screenshot: item,
		Upload: screenshotUpload{
			URL:       signed.URL,
			Method:    signed.Method,
			Headers:   signed.Headers,
			ExpiresAt: signed.ExpiresAt,
		},
	}, nil
}

func (s *postgresStore) finalizeScreenshot(ctx context.Context, actor principal, projectID, screenshotID string, input screenshotFinalize) (screenshot, error) {
	if s.objects == nil {
		return screenshot{}, errScreenshotStorageUnavailable
	}
	if err := validateScreenshotDimensions(input.Width, input.Height); err != nil {
		return screenshot{}, err
	}
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return screenshot{}, err
	}
	if err := scope.requireNative(); err != nil {
		return screenshot{}, err
	}
	if _, err := uuid.Parse(screenshotID); err != nil {
		return screenshot{}, errScreenshotNotFound
	}
	var location, key, filename, contentType string
	var storedName *string
	var width, height *int
	err = s.pool.QueryRow(ctx, `
		SELECT object_location, object_key, filename, content_type, name, width, height
		FROM project_visual_context_screenshots
		WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND status='upload_pending'`,
		screenshotID, actor.OrganizationID, scope.ID,
	).Scan(&location, &key, &filename, &contentType, &storedName, &width, &height)
	if errors.Is(err, pgx.ErrNoRows) {
		return screenshot{}, errScreenshotNotFound
	}
	if err != nil {
		return screenshot{}, fmt.Errorf("load pending screenshot: %w", err)
	}
	store, err := s.objects.Resolve(location)
	if err != nil {
		return screenshot{}, errScreenshotStorageUnavailable
	}
	info, err := store.Stat(ctx, key)
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return screenshot{}, errScreenshotUploadMissing
		}
		return screenshot{}, err
	}
	if info.Size <= 0 || info.Size > screenshotMaxBytes {
		s.discardRejectedScreenshotUpload(ctx, actor, scope, screenshotID, location, key)
		return screenshot{}, errScreenshotUploadTooLarge
	}
	digest, decoded, err := hashScreenshotUpload(ctx, store, key, contentType)
	if errors.Is(err, errVisualContextInvalidImage) {
		s.discardRejectedScreenshotUpload(ctx, actor, scope, screenshotID, location, key)
		return screenshot{}, errScreenshotInvalidImage
	}
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return screenshot{}, errScreenshotUploadMissing
		}
		return screenshot{}, err
	}
	if name := optionalScreenshotName(input.Name); name != nil {
		storedName = name
	}
	if input.Width != nil {
		width = input.Width
	} else if width == nil {
		width = &decoded.Width
	}
	if input.Height != nil {
		height = input.Height
	} else if height == nil {
		height = &decoded.Height
	}
	storedFileID := "file_" + uuid.NewString()
	storageURL := fmt.Sprintf("object://%s/%s", location, key)
	err = s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO stored_files (
				id, organization_id, project_id, created_by_user_id, role, source_kind,
				storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
			) VALUES ($1,$2,$3,$4,'reference','editor_upload',$5,$6,$7,$8,$9,$10,$11)`,
			storedFileID, actor.OrganizationID, scope.ID, actor.UserID,
			location, key, storageURL, filename, contentType, int(info.Size), digest,
		); err != nil {
			return fmt.Errorf("insert stored screenshot: %w", err)
		}
		tag, err := tx.Exec(ctx, `
			UPDATE project_visual_context_screenshots
			SET stored_file_id=$2, name=$3, width=$4, height=$5, status='ready', updated_at=now()
			WHERE id=$1 AND status='upload_pending'`,
			screenshotID, storedFileID, storedName, width, height,
		)
		if err != nil {
			return fmt.Errorf("finalize screenshot: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return errScreenshotNotPending
		}
		return nil
	})
	if err != nil {
		return screenshot{}, err
	}
	return s.getScreenshot(ctx, actor, projectID, screenshotID)
}

func (s *postgresStore) deleteScreenshot(ctx context.Context, actor principal, projectID, screenshotID string) error {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return err
	}
	if err := scope.requireNative(); err != nil {
		return err
	}
	if _, err := uuid.Parse(screenshotID); err != nil {
		return errScreenshotNotFound
	}
	var location, key string
	var storedFileID *string
	err = s.pool.QueryRow(ctx, `
		SELECT object_location, object_key, stored_file_id
		FROM project_visual_context_screenshots
		WHERE id=$1 AND organization_id=$2 AND project_id=$3`,
		screenshotID, actor.OrganizationID, scope.ID,
	).Scan(&location, &key, &storedFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errScreenshotNotFound
	}
	if err != nil {
		return fmt.Errorf("load screenshot: %w", err)
	}
	err = s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := tx.Exec(ctx, `
			DELETE FROM project_visual_context_screenshots
			WHERE id=$1 AND organization_id=$2 AND project_id=$3`,
			screenshotID, actor.OrganizationID, scope.ID,
		); err != nil {
			return fmt.Errorf("delete screenshot: %w", err)
		}
		if storedFileID != nil && strings.TrimSpace(*storedFileID) != "" {
			if _, err := tx.Exec(ctx, `
				DELETE FROM stored_files
				WHERE id=$1 AND organization_id=$2 AND project_id=$3`,
				*storedFileID, actor.OrganizationID, scope.ID,
			); err != nil {
				return fmt.Errorf("delete stored screenshot: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.deleteScreenshotObject(ctx, location, key)
	return nil
}

func (s *postgresStore) upsertScreenshotMarkers(ctx context.Context, actor principal, projectID, screenshotID string, inputs []screenshotMarkerInput) ([]screenshotMarker, error) {
	if len(inputs) == 0 || len(inputs) > screenshotMaxMarkers {
		return nil, errTooManyScreenshotMarkers
	}
	for _, marker := range inputs {
		if err := validateScreenshotMarkerInput(marker); err != nil {
			return nil, err
		}
	}
	var markers []screenshotMarker
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if err := requireScreenshotRow(ctx, tx, actor, scope, screenshotID); err != nil {
			return err
		}
		var err error
		markers, err = s.upsertScreenshotMarkerRows(ctx, tx, actor, scope, screenshotID, inputs)
		return err
	})
	return markers, err
}

func (s *postgresStore) deleteScreenshotMarker(ctx context.Context, actor principal, projectID, screenshotID, markerID string) error {
	return s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := uuid.Parse(screenshotID); err != nil {
			return errScreenshotNotFound
		}
		if _, err := uuid.Parse(markerID); err != nil {
			return errScreenshotMarkerNotFound
		}
		tag, err := tx.Exec(ctx, `
			DELETE FROM project_visual_context_bindings
			WHERE id=$1 AND screenshot_id=$2 AND organization_id=$3 AND project_id=$4`,
			markerID, screenshotID, actor.OrganizationID, scope.ID,
		)
		if err != nil {
			return fmt.Errorf("delete screenshot marker: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return errScreenshotMarkerNotFound
		}
		return nil
	})
}

func (s *postgresStore) upsertScreenshotMarkerRows(ctx context.Context, db screenshotExec, actor principal, scope projectScope, screenshotID string, inputs []screenshotMarkerInput) ([]screenshotMarker, error) {
	markers := make([]screenshotMarker, 0, len(inputs))
	for _, input := range inputs {
		keyID, err := resolveScreenshotString(ctx, db, actor, scope, input)
		if err != nil {
			return nil, err
		}
		var left, top, width, height *float64
		if input.Marker != nil {
			left, top, width, height = &input.Marker.Left, &input.Marker.Top, &input.Marker.Width, &input.Marker.Height
		}
		var marker screenshotMarker
		err = db.QueryRow(ctx, `
			INSERT INTO project_visual_context_bindings (
				organization_id, project_id, screenshot_id, translation_key_id,
				marker_left, marker_top, marker_width, marker_height, source, created_by_user_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)
			ON CONFLICT (screenshot_id, translation_key_id) DO UPDATE SET
				marker_left=excluded.marker_left,
				marker_top=excluded.marker_top,
				marker_width=excluded.marker_width,
				marker_height=excluded.marker_height,
				source='manual',
				match_process_id=null,
				updated_at=now()
			RETURNING id`,
			actor.OrganizationID, scope.ID, screenshotID, keyID, left, top, width, height, actor.UserID,
		).Scan(&marker.ID)
		if err != nil {
			return nil, fmt.Errorf("upsert screenshot marker: %w", err)
		}
		item, err := loadString(ctx, db, actor, scope, keyID)
		if err != nil {
			return nil, err
		}
		marker.ScreenshotID = screenshotID
		marker.StringID = item.ID
		marker.Key = item.Key
		marker.FilePath = item.FilePath
		marker.Marker = input.Marker
		marker.Source = "manual"
		markers = append(markers, marker)
	}
	return markers, nil
}

func (s *postgresStore) loadScreenshot(ctx context.Context, db queryRower, actor principal, scope projectScope, screenshotID string) (screenshot, error) {
	if _, err := uuid.Parse(screenshotID); err != nil {
		return screenshot{}, errScreenshotNotFound
	}
	item, err := scanScreenshotRow(db.QueryRow(ctx, `
		SELECT s.id, s.name, s.filename, s.content_type, s.status, s.width, s.height,
			s.object_location, s.object_key, s.figma_url, s.created_at, s.updated_at
		FROM project_visual_context_screenshots s
		WHERE s.id=$1 AND s.organization_id=$2 AND s.project_id=$3`,
		screenshotID, actor.OrganizationID, scope.ID))
	if errors.Is(err, pgx.ErrNoRows) {
		return screenshot{}, errScreenshotNotFound
	}
	return item, err
}

func scanScreenshotRow(row rowScanner) (screenshot, error) {
	var item screenshot
	if err := row.Scan(
		&item.ID, &item.Name, &item.Filename, &item.ContentType, &item.Status, &item.Width, &item.Height,
		&item.location, &item.key, &item.FigmaURL, &item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return screenshot{}, err
	}
	item.Markers = []screenshotMarker{}
	return item, nil
}

func (s *postgresStore) attachScreenshotMarkers(ctx context.Context, actor principal, scope projectScope, items []screenshot) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]string, len(items))
	index := make(map[string]int, len(items))
	for i, item := range items {
		ids[i] = item.ID
		index[item.ID] = i
		items[i].Markers = []screenshotMarker{}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT b.id, b.screenshot_id, k.id, k.key, f.source_path, b.source,
			b.marker_left, b.marker_top, b.marker_width, b.marker_height
		FROM project_visual_context_bindings b
		JOIN project_translation_keys k ON k.id = b.translation_key_id
		LEFT JOIN repository_source_files f ON f.id = k.repository_source_file_id
		WHERE b.organization_id=$1 AND b.project_id=$2 AND b.screenshot_id = ANY($3::uuid[])
		ORDER BY b.created_at ASC, b.id ASC`,
		actor.OrganizationID, scope.ID, ids,
	)
	if err != nil {
		return fmt.Errorf("list screenshot markers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var marker screenshotMarker
		var left, top, width, height *float64
		if err := rows.Scan(&marker.ID, &marker.ScreenshotID, &marker.StringID, &marker.Key, &marker.FilePath, &marker.Source,
			&left, &top, &width, &height); err != nil {
			return fmt.Errorf("scan screenshot marker: %w", err)
		}
		marker.Marker = screenshotMarkerFromColumns(left, top, width, height)
		i, ok := index[marker.ScreenshotID]
		if !ok {
			continue
		}
		items[i].Markers = append(items[i].Markers, marker)
	}
	return rows.Err()
}

func (s *postgresStore) signScreenshotDownloads(ctx context.Context, items []screenshot) error {
	for i, item := range items {
		if item.Status != "ready" {
			continue
		}
		url, err := s.signScreenshotDownload(ctx, item.location, item.key)
		if err != nil {
			return err
		}
		items[i].ImageURL = &url
	}
	return nil
}

func (s *postgresStore) signScreenshotDownload(ctx context.Context, location, key string) (string, error) {
	if s.objects == nil {
		return "", errScreenshotStorageUnavailable
	}
	signer, err := s.objects.Presigner(location)
	if err != nil {
		return "", errScreenshotStorageUnavailable
	}
	signed, err := signer.PresignDownload(ctx, key, screenshotDownloadTTL)
	if err != nil {
		return "", fmt.Errorf("sign screenshot download: %w", err)
	}
	return signed.URL, nil
}

func requireScreenshotRow(ctx context.Context, db queryRower, actor principal, scope projectScope, screenshotID string) error {
	if _, err := uuid.Parse(screenshotID); err != nil {
		return errScreenshotNotFound
	}
	var id string
	err := db.QueryRow(ctx, `
		SELECT id FROM project_visual_context_screenshots
		WHERE id=$1 AND organization_id=$2 AND project_id=$3`,
		screenshotID, actor.OrganizationID, scope.ID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return errScreenshotNotFound
	}
	return err
}

func resolveScreenshotString(ctx context.Context, db screenshotExec, actor principal, scope projectScope, input screenshotMarkerInput) (string, error) {
	if input.StringID != "" {
		item, err := loadString(ctx, db, actor, scope, input.StringID)
		if err != nil {
			return "", err
		}
		return item.ID, nil
	}
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2 AND k.key = $3", actor.OrganizationID, scope.ID, input.Key)
	from := stringFrom
	if input.FilePath != "" {
		where.add("f.source_path = ?", input.FilePath)
	}
	rows, err := db.Query(ctx, `SELECT k.id `+from+` WHERE `+where.sql()+` ORDER BY k.id LIMIT 3`, where.args...)
	if err != nil {
		return "", fmt.Errorf("resolve screenshot string: %w", err)
	}
	defer rows.Close()
	ids := make([]string, 0, 2)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	switch len(ids) {
	case 0:
		return "", errStringNotFound
	case 1:
		return ids[0], nil
	default:
		return "", errScreenshotAmbiguousKey
	}
}

func (s *postgresStore) discardRejectedScreenshotUpload(ctx context.Context, actor principal, scope projectScope, screenshotID, location, key string) {
	_, _ = s.pool.Exec(ctx, `
		DELETE FROM project_visual_context_screenshots
		WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND status='upload_pending'`,
		screenshotID, actor.OrganizationID, scope.ID,
	)
	s.deleteScreenshotObject(ctx, location, key)
}

func (s *postgresStore) sweepStaleScreenshotUploads(ctx context.Context, actor principal, scope projectScope) {
	rows, err := s.pool.Query(ctx, `
		DELETE FROM project_visual_context_screenshots
		WHERE id IN (
			SELECT id FROM project_visual_context_screenshots
			WHERE organization_id=$1 AND project_id=$2 AND status='upload_pending'
			  AND created_at < now() - make_interval(secs => $3)
			ORDER BY created_at
			LIMIT $4
		)
		RETURNING object_location, object_key`,
		actor.OrganizationID, scope.ID, screenshotStaleUploadAge.Seconds(), screenshotStaleUploadN,
	)
	if err != nil {
		slog.WarnContext(ctx, "screenshot_stale_upload_sweep_failed", "project_id", scope.ID, "error", err)
		return
	}
	type staleObject struct{ location, key string }
	stale := make([]staleObject, 0)
	for rows.Next() {
		var object staleObject
		if err := rows.Scan(&object.location, &object.key); err != nil {
			rows.Close()
			slog.WarnContext(ctx, "screenshot_stale_upload_sweep_failed", "project_id", scope.ID, "error", err)
			return
		}
		stale = append(stale, object)
	}
	rows.Close()
	for _, object := range stale {
		s.deleteScreenshotObject(ctx, object.location, object.key)
	}
}

func (s *postgresStore) deleteScreenshotObject(ctx context.Context, location, key string) {
	if s.objects == nil {
		return
	}
	store, err := s.objects.Resolve(location)
	if err == nil {
		err = store.Delete(ctx, key)
	}
	if err != nil {
		slog.WarnContext(ctx, "screenshot_object_delete_failed", "object_location", location, "error", err)
	}
}

func hashScreenshotUpload(ctx context.Context, store objectstore.Store, key, contentType string) (string, image.Config, error) {
	body, _, err := store.Get(ctx, key)
	if err != nil {
		return "", image.Config{}, err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, screenshotMaxBytes+1))
	if err != nil {
		return "", image.Config{}, err
	}
	if len(data) > screenshotMaxBytes {
		return "", image.Config{}, errVisualContextInvalidImage
	}
	cfg, err := decodeScreenshotConfig(data, contentType)
	if err != nil {
		return "", image.Config{}, errVisualContextInvalidImage
	}
	if err := rejectScreenshotImageSize(cfg.Width, cfg.Height); err != nil {
		return "", image.Config{}, err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), cfg, nil
}

func decodeScreenshotConfig(data []byte, contentType string) (image.Config, error) {
	reader := bytes.NewReader(data)
	switch contentType {
	case "image/png":
		return png.DecodeConfig(reader)
	case "image/jpeg":
		return jpeg.DecodeConfig(reader)
	case "image/webp":
		return webp.DecodeConfig(reader)
	default:
		return image.Config{}, errVisualContextInvalidImage
	}
}

func rejectScreenshotImageSize(width, height int) error {
	if width <= 0 || height <= 0 || width > screenshotMaxImageSide || height > screenshotMaxImageSide {
		return errVisualContextInvalidImage
	}
	if int64(width)*int64(height) > screenshotMaxImagePixels {
		return errVisualContextInvalidImage
	}
	return nil
}

func normalizeScreenshotUpload(filename, contentType string) (string, string, error) {
	sanitized, err := sanitizeScreenshotFilename(filename)
	if err != nil {
		return "", "", err
	}
	normalizedType, err := normalizeScreenshotContentType(contentType, sanitized)
	if err != nil {
		return "", "", err
	}
	return sanitized, normalizedType, nil
}

func sanitizeScreenshotFilename(name string) (string, error) {
	cleaned := path.Base(strings.ReplaceAll(strings.TrimSpace(name), "\\", "/"))
	if cleaned == "" || cleaned == "." || cleaned == "/" {
		return "", errScreenshotInvalidFilename
	}
	var builder strings.Builder
	for _, r := range cleaned {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('_')
	}
	out := strings.Trim(builder.String(), ".")
	if out == "" || !strings.Contains(out, ".") || len(out) > screenshotMaxFilenameLen {
		return "", errScreenshotInvalidFilename
	}
	return out, nil
}

func normalizeScreenshotContentType(contentType, filename string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(contentType))
	if normalized == "image/jpg" {
		normalized = "image/jpeg"
	}
	ext := strings.ToLower(path.Ext(filename))
	expected := ""
	switch ext {
	case ".png":
		expected = "image/png"
	case ".jpg", ".jpeg":
		expected = "image/jpeg"
	case ".webp":
		expected = "image/webp"
	default:
		return "", errScreenshotInvalidFilename
	}
	if normalized != "" && normalized != expected {
		return "", errScreenshotInvalidContentType
	}
	return expected, nil
}

func validateScreenshotDimensions(width, height *int) error {
	if width != nil && (*width <= 0 || *width > screenshotMaxImageSide) {
		return errScreenshotInvalidDimensions
	}
	if height != nil && (*height <= 0 || *height > screenshotMaxImageSide) {
		return errScreenshotInvalidDimensions
	}
	if width != nil && height != nil && rejectScreenshotImageSize(*width, *height) != nil {
		return errScreenshotInvalidDimensions
	}
	return nil
}

func validateScreenshotMarkerInput(input screenshotMarkerInput) error {
	hasID := strings.TrimSpace(input.StringID) != ""
	hasKey := strings.TrimSpace(input.Key) != ""
	if hasID == hasKey {
		return errScreenshotMarkerNeedsString
	}
	if hasID {
		if _, err := uuid.Parse(input.StringID); err != nil {
			return errStringNotFound
		}
	}
	if hasKey && (input.Key == "" || len(input.Key) > 1000 || len(input.FilePath) > 2048) {
		return errScreenshotMarkerNeedsString
	}
	return validateScreenshotMarkerBox(input.Marker)
}

func validateScreenshotMarkerBox(marker *screenshotMarkerBox) error {
	if marker == nil {
		return nil
	}
	if marker.Left < 0 || marker.Left > 100 || marker.Top < 0 || marker.Top > 100 ||
		marker.Width <= 0 || marker.Width > 100 || marker.Height <= 0 || marker.Height > 100 ||
		marker.Left+marker.Width > 100+screenshotMarkerEpsilon ||
		marker.Top+marker.Height > 100+screenshotMarkerEpsilon {
		return errScreenshotInvalidMarker
	}
	return nil
}

func screenshotMarkerFromColumns(left, top, width, height *float64) *screenshotMarkerBox {
	if left == nil || top == nil || width == nil || height == nil {
		return nil
	}
	return &screenshotMarkerBox{Left: *left, Top: *top, Width: *width, Height: *height}
}

func optionalScreenshotName(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	if utf8.RuneCountInString(trimmed) > screenshotMaxNameRunes {
		runes := []rune(trimmed)
		trimmed = strings.TrimSpace(string(runes[:screenshotMaxNameRunes]))
	}
	return &trimmed
}

func parseScreenshotStatus(value string) (string, bool) {
	switch value {
	case "", "ready", "upload_pending":
		return value, true
	default:
		return "", false
	}
}
