package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/language"
)

// maxProjectTargetLocales matches maxProjectTargetLocales in the web app.
const maxProjectTargetLocales = 50

var (
	errInvalidTargetLocales = errors.New("invalid target locales")
	errSourceInTargets      = errors.New("source locale is a target locale")
)

type projectPatch struct {
	Name               *string
	Description        *string
	TranslationContext *string
	TargetLocales      []string
}

// canonicalLocale follows canonicalizeLocale in the web app, which uses
// Intl.getCanonicalLocales: "en-us" becomes "en-US" and "iw" becomes "he".
func canonicalLocale(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	// Intl rejects underscores and private-use-only tags; x/text accepts them.
	if trimmed == "" || strings.Contains(trimmed, "_") || len(trimmed) > maxLocaleLength {
		return "", false
	}
	tag, err := language.Parse(trimmed)
	if err != nil || tag == language.Und {
		return "", false
	}
	return tag.String(), true
}

// normalizeTargetLocales follows the web app's normalizeTargetLocales: canonical tags, case-
// insensitive duplicates dropped, at most 50, and never the source locale.
func normalizeTargetLocales(raw []string, sourceLocale *string) ([]string, error) {
	seen := map[string]struct{}{}
	locales := make([]string, 0, len(raw))
	for _, item := range raw {
		locale, ok := canonicalLocale(item)
		if !ok {
			return nil, errInvalidTargetLocales
		}
		key := strings.ToLower(locale)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		locales = append(locales, locale)
	}
	if len(locales) == 0 || len(locales) > maxProjectTargetLocales {
		return nil, errInvalidTargetLocales
	}
	if sourceLocale != nil {
		if _, clash := seen[strings.ToLower(*sourceLocale)]; clash {
			return nil, errSourceInTargets
		}
	}
	return locales, nil
}

// updateProject changes a native project's name, description, translation context, or target
// locales, as the web app's project settings do.
func (s *postgresStore) updateProject(ctx context.Context, actor principal, projectID string, patch projectPatch) (project, error) {
	var updated project
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM projects WHERE id = $1 FOR UPDATE`, scope.ID); err != nil {
			return fmt.Errorf("lock project: %w", err)
		}
		set := newSQLFilter("updated_at = now()")
		if patch.Name != nil {
			set.add("name = ?", *patch.Name)
		}
		if patch.Description != nil {
			set.add("description = ?", *patch.Description)
		}
		if patch.TranslationContext != nil {
			set.add("translation_context = ?", *patch.TranslationContext)
		}
		if patch.TargetLocales != nil {
			locales, err := normalizeTargetLocales(patch.TargetLocales, scope.SourceLocale)
			if err != nil {
				return err
			}
			encoded, err := json.Marshal(locales)
			if err != nil {
				return fmt.Errorf("encode target locales: %w", err)
			}
			set.add("target_locales = ?::jsonb", string(encoded))
		}
		args := append(set.args, actor.OrganizationID, scope.ID)
		n := len(set.args)
		if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE projects SET %s WHERE organization_id = $%d AND id = $%d`,
			strings.Join(set.conditions, ", "), n+1, n+2), args...); err != nil {
			return fmt.Errorf("update project: %w", err)
		}
		var err error
		updated, err = scanProject(tx.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects p WHERE p.id = $1`, scope.ID))
		if err != nil {
			return err
		}
		// Same event and payload as the web app's project settings PATCH.
		return insertActivity(ctx, tx, actor, activityEvent{
			EventType:  "project_settings_changed",
			TargetID:   scope.ID,
			TargetKind: "project",
			Payload:    map[string]any{"changedFields": patch.changedFields(), "projectId": scope.ID},
		})
	})
	return updated, err
}

// changedFields names the fields a project update set, as the web app's Object.keys(payload).
func (patch projectPatch) changedFields() []string {
	fields := []string{}
	if patch.Name != nil {
		fields = append(fields, "name")
	}
	if patch.Description != nil {
		fields = append(fields, "description")
	}
	if patch.TranslationContext != nil {
		fields = append(fields, "translationContext")
	}
	if patch.TargetLocales != nil {
		fields = append(fields, "targetLocales")
	}
	return fields
}

const maxStringBatchSize = 500

// stringUpsert creates the string with Key in FilePath, or updates the fields that are set.
type stringUpsert struct {
	Key        string
	FilePath   *string
	SourceText *string
	Context    optionalString
	Type       optionalString
	MaxLength  optionalInt
	Hidden     *bool
}

type stringBatchResult struct {
	Created int                 `json:"created"`
	Updated int                 `json:"updated"`
	Strings []translationString `json:"strings"`
}

// errStringBatchItem names the batch item a store error came from.
type errStringBatchItem struct {
	index int
	err   error
}

func (e errStringBatchItem) Error() string { return fmt.Sprintf("strings[%d]: %v", e.index, e.err) }
func (e errStringBatchItem) Unwrap() error { return e.err }

var errStringSourceTextRequired = errors.New("sourceText is required to create a string")

// upsertStrings applies the batch in one transaction, so a failing item leaves every string as
// it was. Each item takes the same locks as createString and updateString.
func (s *postgresStore) upsertStrings(ctx context.Context, actor principal, projectID string, items []stringUpsert) (stringBatchResult, error) {
	result := stringBatchResult{Strings: make([]translationString, 0, len(items))}
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		fileIDs := map[string]*string{}
		for i, item := range items {
			saved, created, err := upsertString(ctx, tx, actor, scope, item, fileIDs)
			if err != nil {
				return errStringBatchItem{index: i, err: err}
			}
			if created {
				result.Created++
			} else {
				result.Updated++
			}
			result.Strings = append(result.Strings, saved)
		}
		return insertActivity(ctx, tx, actor, activityEvent{
			EventType:  "project_strings_updated",
			TargetID:   scope.ID,
			TargetKind: "project",
			Payload: map[string]any{
				"projectId": scope.ID, "created": result.Created, "updated": result.Updated, "itemCount": len(items),
			},
		})
	})
	if err != nil {
		return stringBatchResult{}, err
	}
	return result, nil
}

func upsertString(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, item stringUpsert, fileIDs map[string]*string) (translationString, bool, error) {
	var fileID *string
	if item.FilePath != nil {
		cached, ok := fileIDs[*item.FilePath]
		if !ok {
			var id string
			err := tx.QueryRow(ctx, `SELECT f.id FROM repository_source_files f
				WHERE f.organization_id = $1 AND f.project_id = $2 AND f.source_path = $3`,
				actor.OrganizationID, scope.ID, *item.FilePath).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return translationString{}, false, errSourceFileNotFound
			}
			if err != nil {
				return translationString{}, false, fmt.Errorf("load source file: %w", err)
			}
			cached = &id
			fileIDs[*item.FilePath] = cached
		}
		fileID = cached
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
		"public-api:string:"+scope.ID, item.Key); err != nil {
		return translationString{}, false, fmt.Errorf("lock string key: %w", err)
	}
	var existingID string
	err := tx.QueryRow(ctx, `SELECT id FROM project_translation_keys
		WHERE project_id = $1 AND key = $2 AND repository_source_file_id IS NOT DISTINCT FROM $3::uuid
		ORDER BY id LIMIT 1`, scope.ID, item.Key, fileID).Scan(&existingID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if item.SourceText == nil {
			return translationString{}, false, errStringSourceTextRequired
		}
		hidden := item.Hidden != nil && *item.Hidden
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO project_translation_keys (
				organization_id, project_id, repository_source_file_id, key, source_text,
				normalized_source_text, context, type, max_length, is_hidden
			) VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id`,
			actor.OrganizationID, scope.ID, fileID, item.Key, *item.SourceText,
			normalizeSourceText(*item.SourceText), item.Context.Value, item.Type.Value, item.MaxLength.Value, hidden,
		).Scan(&id); err != nil {
			if isUniqueViolation(err) {
				return translationString{}, false, errStringKeyConflict
			}
			return translationString{}, false, fmt.Errorf("insert string: %w", err)
		}
		saved, err := loadString(ctx, tx, actor, scope, id)
		return saved, true, err
	case err != nil:
		return translationString{}, false, fmt.Errorf("find string: %w", err)
	}

	current, err := loadString(ctx, tx, actor, scope, existingID)
	if err != nil {
		return translationString{}, false, err
	}
	if _, err := lockString(ctx, tx, actor, scope, existingID); err != nil {
		return translationString{}, false, err
	}
	set := newSQLFilter("updated_at = now()")
	sourceChanged := item.SourceText != nil && *item.SourceText != current.SourceText
	if sourceChanged {
		if err := rejectSourceTextChange(ctx, tx, actor, scope, existingID); err != nil {
			return translationString{}, false, err
		}
		set.add("source_text = ?", *item.SourceText)
		set.add("normalized_source_text = ?", normalizeSourceText(*item.SourceText))
	}
	if item.Context.Set {
		set.add("context = ?", item.Context.Value)
	}
	if item.Type.Set {
		set.add("type = ?", item.Type.Value)
	}
	if item.MaxLength.Set {
		set.add("max_length = ?", item.MaxLength.Value)
	}
	if item.Hidden != nil {
		set.add("is_hidden = ?", *item.Hidden)
	}
	if len(set.conditions) > 1 {
		args := append(set.args, actor.OrganizationID, scope.ID, existingID)
		n := len(set.args)
		if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE project_translation_keys SET %s
			WHERE organization_id = $%d AND project_id = $%d AND id = $%d`,
			strings.Join(set.conditions, ", "), n+1, n+2, n+3), args...); err != nil {
			return translationString{}, false, fmt.Errorf("update string: %w", err)
		}
	}
	if sourceChanged {
		if err := sendApprovedTranslationsToReview(ctx, tx, actor, scope, existingID); err != nil {
			return translationString{}, false, err
		}
	}
	saved, err := loadString(ctx, tx, actor, scope, existingID)
	return saved, false, err
}
