package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"
)

func (r *Repository) InsertProject(ctx context.Context, db bun.IDB, project *TranslationProjectModel) error {
	if _, err := db.NewInsert().Model(project).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation project: %w", err)
	}

	return nil
}

func (r *Repository) GetProject(ctx context.Context, projectID string) (*TranslationProjectModel, error) {
	project := &TranslationProjectModel{}
	err := r.db.NewSelect().
		Model(project).
		Where("tp.id = ?", projectID).
		Limit(1).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}

		return nil, fmt.Errorf("select translation project: %w", err)
	}

	return project, nil
}

func (r *Repository) ListProjects(ctx context.Context, limit int) ([]TranslationProjectModel, error) {
	if limit <= 0 {
		limit = 50
	}

	var projects []TranslationProjectModel
	if err := r.db.NewSelect().
		Model((*TranslationProjectModel)(nil)).
		OrderExpr("tp.created_at DESC").
		Limit(limit).
		Scan(ctx, &projects); err != nil {
		return nil, fmt.Errorf("list translation projects: %w", err)
	}

	return projects, nil
}

func (r *Repository) UpdateProject(
	ctx context.Context,
	projectID string,
	name *string,
	description *string,
	updatedAt time.Time,
) (*TranslationProjectModel, error) {
	update := r.db.NewUpdate().
		Model((*TranslationProjectModel)(nil)).
		Set("updated_at = ?", updatedAt).
		Where("id = ?", projectID)

	if name != nil {
		update = update.Set("name = ?", *name)
	}
	if description != nil {
		update = update.Set("description = ?", *description)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("update translation project: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("count project update rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return nil, ErrNotFound
	}

	return r.GetProject(ctx, projectID)
}

func (r *Repository) DeleteProject(ctx context.Context, projectID string) error {
	result, err := r.db.NewDelete().
		Model((*TranslationProjectModel)(nil)).
		Where("id = ?", projectID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete translation project: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count project delete rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}

	return nil
}
