package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (r *Repository) InsertFileUpload(ctx context.Context, db queryExecutor, upload *TranslationFileUploadModel) error {
	if _, err := db.Insert().Table(TranslationFileUploads).Model(upload).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation file upload: %w", err)
	}
	return nil
}

func (r *Repository) GetFileUpload(ctx context.Context, uploadID, projectID string) (*TranslationFileUploadModel, error) {
	upload := &TranslationFileUploadModel{}
	err := r.db.Select().
		Table(TranslationFileUploads).
		Where(TranslationFileUploads.ID.Eq(uploadID)).
		Where(TranslationFileUploads.ProjectID.Eq(projectID)).
		Limit(1).
		Scan(ctx, upload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file upload: %w", err)
	}
	return upload, nil
}

func (r *Repository) ListFileUploadsByProject(ctx context.Context, projectID string) ([]TranslationFileUploadModel, error) {
	var uploads []TranslationFileUploadModel
	if err := r.db.Select().
		Table(TranslationFileUploads).
		Where(TranslationFileUploads.ProjectID.Eq(projectID)).
		OrderBy(TranslationFileUploads.CreatedAt.Asc()).
		Scan(ctx, &uploads); err != nil {
		return nil, fmt.Errorf("list translation file uploads by project: %w", err)
	}
	return uploads, nil
}

func (r *Repository) FinalizeFileUpload(ctx context.Context, db queryExecutor, uploadID string, finalizedAt time.Time) error {
	result, err := db.Update().
		Table(TranslationFileUploads).
		Set(TranslationFileUploads.Status, FileUploadStatusFinalized).
		Set(TranslationFileUploads.UpdatedAt, finalizedAt).
		Set(TranslationFileUploads.FinalizedAt, finalizedAt).
		Where(TranslationFileUploads.ID.Eq(uploadID)).
		Where(TranslationFileUploads.Status.Eq(FileUploadStatusPending)).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("finalize translation file upload: %w", err)
	}
	affected, err := rowsAffected(result, "file upload finalize")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UpsertFile(ctx context.Context, db queryExecutor, file *TranslationFileModel) error {
	if _, err := db.Insert().
		Table(TranslationFiles).
		Model(file).
		OnConflict(TranslationFiles.ProjectID, TranslationFiles.Path).
		DoUpdateSet(
			TranslationFiles.FileFormat,
			TranslationFiles.SourceLocale,
			TranslationFiles.ContentType,
			TranslationFiles.SizeBytes,
			TranslationFiles.ChecksumSHA256,
			TranslationFiles.StorageDriver,
			TranslationFiles.Bucket,
			TranslationFiles.ObjectKey,
			TranslationFiles.UpdatedAt,
		).
		Exec(ctx); err != nil {
		return fmt.Errorf("upsert translation file: %w", err)
	}
	return nil
}

func (r *Repository) GetFile(ctx context.Context, fileID, projectID string) (*TranslationFileModel, error) {
	file := &TranslationFileModel{}
	err := r.db.Select().
		Table(TranslationFiles).
		Where(TranslationFiles.ID.Eq(fileID)).
		Where(TranslationFiles.ProjectID.Eq(projectID)).
		Limit(1).
		Scan(ctx, file)
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
	err := r.db.Select().
		Table(TranslationFiles).
		Where(TranslationFiles.ProjectID.Eq(projectID)).
		Where(TranslationFiles.Path.Eq(path)).
		Limit(1).
		Scan(ctx, file)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file by path: %w", err)
	}
	return file, nil
}

func (r *Repository) ListFilesByPrefix(ctx context.Context, projectID, prefix string) ([]TranslationFileModel, error) {
	if prefix == "" {
		var files []TranslationFileModel
		if err := r.db.Select().
			Table(TranslationFiles).
			Where(TranslationFiles.ProjectID.Eq(projectID)).
			OrderBy(TranslationFiles.Path.Asc()).
			Scan(ctx, &files); err != nil {
			return nil, fmt.Errorf("list translation files by prefix: %w", err)
		}
		return files, nil
	}

	escapedPrefix := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix)
	rows, err := r.db.Query(
		ctx,
		`SELECT id, project_id, path, file_format, source_locale, content_type, size_bytes, checksum_sha256, storage_driver, bucket, object_key, created_at, updated_at
		FROM translation_files
		WHERE project_id = $1 AND path LIKE $2 ESCAPE '\'
		ORDER BY path ASC`,
		projectID,
		escapedPrefix+"%",
	)
	if err != nil {
		return nil, fmt.Errorf("list translation files by prefix: %w", err)
	}
	defer func() { _ = rows.Close() }()

	files := make([]TranslationFileModel, 0)
	for rows.Next() {
		var file TranslationFileModel
		if err := rows.Scan(
			&file.ID,
			&file.ProjectID,
			&file.Path,
			&file.FileFormat,
			&file.SourceLocale,
			&file.ContentType,
			&file.SizeBytes,
			&file.ChecksumSHA256,
			&file.StorageDriver,
			&file.Bucket,
			&file.ObjectKey,
			&file.CreatedAt,
			&file.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan translation files by prefix: %w", err)
		}
		files = append(files, file)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read translation files by prefix: %w", err)
	}

	return files, nil
}

func (r *Repository) ListFileVariants(ctx context.Context, fileID string) ([]TranslationFileVariantModel, error) {
	var variants []TranslationFileVariantModel
	if err := r.db.Select().
		Table(TranslationFileVariants).
		Where(TranslationFileVariants.FileID.Eq(fileID)).
		OrderBy(TranslationFileVariants.Locale.Asc()).
		Scan(ctx, &variants); err != nil {
		return nil, fmt.Errorf("list translation file variants: %w", err)
	}
	return variants, nil
}

func (r *Repository) ListFileVariantsByFileIDs(ctx context.Context, fileIDs []string) ([]TranslationFileVariantModel, error) {
	if len(fileIDs) == 0 {
		return nil, nil
	}

	values := make([]string, 0, len(fileIDs))
	values = append(values, fileIDs...)

	var variants []TranslationFileVariantModel
	if err := r.db.Select().
		Table(TranslationFileVariants).
		Where(TranslationFileVariants.FileID.In(values...)).
		OrderBy(TranslationFileVariants.FileID.Asc(), TranslationFileVariants.Locale.Asc()).
		Scan(ctx, &variants); err != nil {
		return nil, fmt.Errorf("list translation file variants by file ids: %w", err)
	}
	return variants, nil
}

func (r *Repository) GetFileVariant(ctx context.Context, fileID, locale string) (*TranslationFileVariantModel, error) {
	variant := &TranslationFileVariantModel{}
	err := r.db.Select().
		Table(TranslationFileVariants).
		Where(TranslationFileVariants.FileID.Eq(fileID)).
		Where(TranslationFileVariants.Locale.Eq(locale)).
		Limit(1).
		Scan(ctx, variant)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("select translation file variant: %w", err)
	}
	return variant, nil
}

func (r *Repository) UpsertFileVariant(ctx context.Context, db queryExecutor, variant *TranslationFileVariantModel) error {
	if _, err := db.Insert().
		Table(TranslationFileVariants).
		Model(variant).
		OnConflict(TranslationFileVariants.FileID, TranslationFileVariants.Locale).
		DoUpdateSet(
			TranslationFileVariants.Path,
			TranslationFileVariants.ContentType,
			TranslationFileVariants.SizeBytes,
			TranslationFileVariants.ChecksumSHA256,
			TranslationFileVariants.StorageDriver,
			TranslationFileVariants.Bucket,
			TranslationFileVariants.ObjectKey,
			TranslationFileVariants.LastJobID,
			TranslationFileVariants.Status,
			TranslationFileVariants.UpdatedAt,
		).
		Exec(ctx); err != nil {
		return fmt.Errorf("upsert translation file variant: %w", err)
	}
	return nil
}

func (r *Repository) SaveFileVariant(ctx context.Context, variant *TranslationFileVariantModel) error {
	return r.UpsertFileVariant(ctx, r.db, variant)
}
