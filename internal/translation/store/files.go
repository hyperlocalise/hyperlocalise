package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/uptrace/bun"
)

func (r *Repository) InsertFileUpload(ctx context.Context, db bun.IDB, upload *TranslationFileUploadModel) error {
	if _, err := db.NewInsert().Model(upload).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation file upload: %w", err)
	}
	return nil
}

func (r *Repository) GetFileUpload(ctx context.Context, uploadID, projectID string) (*TranslationFileUploadModel, error) {
	upload := &TranslationFileUploadModel{}
	err := r.db.NewSelect().
		Model(upload).
		Where("tfu.id = ?", uploadID).
		Where("tfu.project_id = ?", projectID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file upload: %w", err)
	}
	return upload, nil
}

func (r *Repository) FinalizeFileUpload(ctx context.Context, db bun.IDB, uploadID string, finalizedAt time.Time) error {
	result, err := db.NewUpdate().
		Model((*TranslationFileUploadModel)(nil)).
		Set("status = ?", FileUploadStatusFinalized).
		Set("updated_at = ?", finalizedAt).
		Set("finalized_at = ?", finalizedAt).
		Where("id = ?", uploadID).
		Where("status = ?", FileUploadStatusPending).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("finalize translation file upload: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count file upload finalize rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UpsertFile(ctx context.Context, db bun.IDB, file *TranslationFileModel) error {
	if _, err := db.NewInsert().
		Model(file).
		On("CONFLICT (project_id, path) DO UPDATE").
		Set("file_format = EXCLUDED.file_format").
		Set("source_locale = EXCLUDED.source_locale").
		Set("content_type = EXCLUDED.content_type").
		Set("size_bytes = EXCLUDED.size_bytes").
		Set("checksum_sha256 = EXCLUDED.checksum_sha256").
		Set("storage_driver = EXCLUDED.storage_driver").
		Set("bucket = EXCLUDED.bucket").
		Set("object_key = EXCLUDED.object_key").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx); err != nil {
		return fmt.Errorf("upsert translation file: %w", err)
	}
	return nil
}

func (r *Repository) GetFile(ctx context.Context, fileID, projectID string) (*TranslationFileModel, error) {
	file := &TranslationFileModel{}
	err := r.db.NewSelect().
		Model(file).
		Where("tf.id = ?", fileID).
		Where("tf.project_id = ?", projectID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file: %w", err)
	}
	return file, nil
}

func (r *Repository) GetFileByPath(ctx context.Context, projectID, path string) (*TranslationFileModel, error) {
	file := &TranslationFileModel{}
	err := r.db.NewSelect().
		Model(file).
		Where("tf.project_id = ?", projectID).
		Where("tf.path = ?", path).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file by path: %w", err)
	}
	return file, nil
}

func (r *Repository) ListFilesByPrefix(ctx context.Context, projectID, prefix string) ([]TranslationFileModel, error) {
	query := r.db.NewSelect().
		Model((*TranslationFileModel)(nil)).
		Where("tf.project_id = ?", projectID).
		OrderExpr("tf.path ASC")
	if prefix != "" {
		escapedPrefix := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix)
		query = query.Where("tf.path LIKE ? ESCAPE '\\'", escapedPrefix+"%")
	}

	var files []TranslationFileModel
	if err := query.Scan(ctx, &files); err != nil {
		return nil, fmt.Errorf("list translation files by prefix: %w", err)
	}
	return files, nil
}

func (r *Repository) ListFileVariants(ctx context.Context, fileID string) ([]TranslationFileVariantModel, error) {
	var variants []TranslationFileVariantModel
	if err := r.db.NewSelect().
		Model((*TranslationFileVariantModel)(nil)).
		Where("tfv.file_id = ?", fileID).
		OrderExpr("tfv.locale ASC").
		Scan(ctx, &variants); err != nil {
		return nil, fmt.Errorf("list translation file variants: %w", err)
	}
	return variants, nil
}

func (r *Repository) ListFileVariantsByFileIDs(ctx context.Context, fileIDs []string) ([]TranslationFileVariantModel, error) {
	if len(fileIDs) == 0 {
		return nil, nil
	}

	var variants []TranslationFileVariantModel
	if err := r.db.NewSelect().
		Model((*TranslationFileVariantModel)(nil)).
		Where("tfv.file_id IN (?)", bun.In(fileIDs)).
		OrderExpr("tfv.file_id ASC").
		OrderExpr("tfv.locale ASC").
		Scan(ctx, &variants); err != nil {
		return nil, fmt.Errorf("list translation file variants by file ids: %w", err)
	}
	return variants, nil
}

func (r *Repository) GetFileVariant(ctx context.Context, fileID, locale string) (*TranslationFileVariantModel, error) {
	variant := &TranslationFileVariantModel{}
	err := r.db.NewSelect().
		Model(variant).
		Where("tfv.file_id = ?", fileID).
		Where("tfv.locale = ?", locale).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file variant: %w", err)
	}
	return variant, nil
}

func (r *Repository) UpsertFileVariant(ctx context.Context, db bun.IDB, variant *TranslationFileVariantModel) error {
	if _, err := db.NewInsert().
		Model(variant).
		On("CONFLICT (file_id, locale) DO UPDATE").
		Set("path = EXCLUDED.path").
		Set("content_type = EXCLUDED.content_type").
		Set("size_bytes = EXCLUDED.size_bytes").
		Set("checksum_sha256 = EXCLUDED.checksum_sha256").
		Set("storage_driver = EXCLUDED.storage_driver").
		Set("bucket = EXCLUDED.bucket").
		Set("object_key = EXCLUDED.object_key").
		Set("last_job_id = EXCLUDED.last_job_id").
		Set("status = EXCLUDED.status").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx); err != nil {
		return fmt.Errorf("upsert translation file variant: %w", err)
	}
	return nil
}

func (r *Repository) SaveFileVariant(ctx context.Context, variant *TranslationFileVariantModel) error {
	return r.UpsertFileVariant(ctx, r.db, variant)
}
