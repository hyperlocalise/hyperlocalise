package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/customfield"
	"github.com/jackc/pgx/v5"
)

func (s *postgresStore) listCustomFields(ctx context.Context, actor principal) ([]customfield.Field, error) {
	return customfield.List(ctx, s.pool, actor.OrganizationID)
}

func (s *postgresStore) getCustomField(ctx context.Context, actor principal, idOrKey string) (customfield.Field, error) {
	return customfield.Get(ctx, s.pool, actor.OrganizationID, idOrKey)
}

func (s *postgresStore) createCustomField(ctx context.Context, actor principal, in customfield.CreateInput) (customfield.Field, error) {
	var field customfield.Field
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var err error
		field, err = customfield.Create(ctx, tx, actor.OrganizationID, actor.UserID, in)
		return err
	})
	return field, err
}

func (s *postgresStore) updateCustomField(ctx context.Context, actor principal, idOrKey string, in customfield.UpdateInput) (customfield.Field, error) {
	var field customfield.Field
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var err error
		field, err = customfield.Update(ctx, tx, actor.OrganizationID, actor.UserID, idOrKey, in)
		return err
	})
	return field, err
}

func (s *postgresStore) deleteCustomField(ctx context.Context, actor principal, idOrKey string) error {
	return customfield.Delete(ctx, s.pool, actor.OrganizationID, idOrKey)
}

func (s *postgresStore) getProjectCustomFields(ctx context.Context, actor principal, projectID string) ([]customfield.ProjectValue, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, err
	}
	return customfield.ProjectValues(ctx, s.pool, actor.OrganizationID, scope.ID)
}

// setProjectCustomFields sets or clears a project's custom field values and records
// project_settings_changed, as other project setting changes do.
func (s *postgresStore) setProjectCustomFields(ctx context.Context, actor principal, projectID string, values map[string]json.RawMessage) ([]customfield.ProjectValue, error) {
	var result []customfield.ProjectValue
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		scope, err := loadProjectScope(ctx, tx, actor, projectID)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `SELECT 1 FROM projects WHERE id = $1 FOR UPDATE`, scope.ID); err != nil {
			return fmt.Errorf("lock project: %w", err)
		}
		if err := customfield.SetProjectValues(ctx, tx, actor.OrganizationID, actor.UserID, scope.ID, values); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = now() WHERE id = $1`, scope.ID); err != nil {
			return fmt.Errorf("touch project: %w", err)
		}
		if err := insertActivity(ctx, tx, actor, activityEvent{
			EventType:  "project_settings_changed",
			TargetID:   scope.ID,
			TargetKind: "project",
			Payload:    map[string]any{"changedFields": []string{"customFields"}, "projectId": scope.ID},
		}); err != nil {
			return err
		}
		result, err = customfield.ProjectValues(ctx, tx, actor.OrganizationID, scope.ID)
		return err
	})
	return result, err
}

// inTx runs fn in a transaction and commits when it returns nil.
func (s *postgresStore) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
