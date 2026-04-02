package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (r *Repository) InsertProject(ctx context.Context, db queryExecutor, project *TranslationProjectModel) error {
	if _, err := db.Insert().Table(TranslationProjects).Model(project).Exec(ctx); err != nil {
		return fmt.Errorf("insert translation project: %w", err)
	}

	return nil
}

func (r *Repository) GetProject(ctx context.Context, projectID string) (*TranslationProjectModel, error) {
	project := &TranslationProjectModel{}
	err := r.db.Select().
		Table(TranslationProjects).
		Where(TranslationProjects.ID.Eq(projectID)).
		Limit(1).
		Scan(ctx, project)
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
	if err := r.db.Select().
		Table(TranslationProjects).
		OrderBy(TranslationProjects.CreatedAt.Desc()).
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
	translationContext *string,
	updatedAt time.Time,
) (*TranslationProjectModel, error) {
	update := r.db.Update().
		Table(TranslationProjects).
		Set(TranslationProjects.UpdatedAt, updatedAt).
		Where(TranslationProjects.ID.Eq(projectID))

	if name != nil {
		update = update.Set(TranslationProjects.Name, *name)
	}
	if description != nil {
		update = update.Set(TranslationProjects.Description, *description)
	}
	if translationContext != nil {
		update = update.Set(TranslationProjects.TranslationContext, *translationContext)
	}

	result, err := update.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("update translation project: %w", err)
	}

	affected, err := rowsAffected(result, "project update")
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, ErrNotFound
	}

	return r.GetProject(ctx, projectID)
}

func (r *Repository) DeleteProject(ctx context.Context, projectID string) error {
	result, err := r.db.Delete().
		Table(TranslationProjects).
		Where(TranslationProjects.ID.Eq(projectID)).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete translation project: %w", err)
	}

	affected, err := rowsAffected(result, "project delete")
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}
