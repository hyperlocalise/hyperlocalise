package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var protectedIssueSheetColumnKeys = map[string]struct{}{
	"priority":   {},
	"owner_note": {},
	"context":    {},
}

func isProtectedIssueSheetColumnKey(key string) bool {
	_, ok := protectedIssueSheetColumnKeys[key]
	return ok
}

func canDeleteIssueSheetColumn(key, layer string) bool {
	return layer == "custom" && !isProtectedIssueSheetColumnKey(key)
}

func (api *issueSheetAPI) loadColumns(ctx context.Context, organizationID, projectID string) ([]map[string]any, error) {
	rows, err := api.pool.Query(ctx, `
        select id, key, label, layer, type, config, sort_order, hidden, icon, created_at, updated_at
        from issue_sheet_columns
        where organization_id = $1 and project_id = $2
        order by sort_order, created_at, id`, organizationID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := []map[string]any{}
	for rows.Next() {
		var id, key, label, layer, typ string
		var config []byte
		var sortOrder int
		var hidden bool
		var icon *string
		var created, updated time.Time
		if err := rows.Scan(&id, &key, &label, &layer, &typ, &config, &sortOrder, &hidden, &icon, &created, &updated); err != nil {
			return nil, err
		}
		if len(config) == 0 {
			config = []byte(`{}`)
		}
		columns = append(columns, map[string]any{
			"id":        id,
			"key":       key,
			"label":     label,
			"layer":     layer,
			"type":      typ,
			"config":    json.RawMessage(config),
			"sortOrder": sortOrder,
			"hidden":    hidden,
			"icon":      icon,
			"createdAt": formatIssueSheetTime(created),
			"updatedAt": formatIssueSheetTime(updated),
		})
	}
	return columns, rows.Err()
}

type createColumnBody struct {
	Key       string          `json:"key"`
	Label     string          `json:"label"`
	Type      string          `json:"type"`
	Config    json.RawMessage `json:"config"`
	SortOrder *int            `json:"sortOrder"`
	Hidden    *bool           `json:"hidden"`
	Icon      *string         `json:"icon"`
}

func (api *issueSheetAPI) createColumn(ctx context.Context, actor issueSheetActor, project issueSheetProject, r *http.Request) (any, int, error) {
	var body createColumnBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	key := strings.TrimSpace(body.Key)
	label := strings.TrimSpace(body.Label)
	typ := strings.TrimSpace(body.Type)
	if key == "" || label == "" || typ == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_column_payload", "Invalid column payload")
	}
	if isProtectedIssueSheetColumnKey(key) {
		return nil, 0, issueSheetFailure(400, "column_key_reserved", "Column key is reserved")
	}
	config := body.Config
	if len(config) == 0 {
		config = json.RawMessage(`{}`)
	}
	sortOrder := 100
	if body.SortOrder != nil {
		sortOrder = *body.SortOrder
	}
	hidden := false
	if body.Hidden != nil {
		hidden = *body.Hidden
	}
	var id string
	var created, updated time.Time
	err := api.pool.QueryRow(ctx, `
        insert into issue_sheet_columns (
            organization_id, project_id, key, label, layer, type, config, sort_order, hidden, icon, created_by_user_id
        ) values ($1,$2,$3,$4,'custom',$5,$6::jsonb,$7,$8,$9,$10)
        returning id, created_at, updated_at`,
		actor.organizationID, project.ID, key, label, typ, config, sortOrder, hidden, body.Icon, actor.userID,
	).Scan(&id, &created, &updated)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"column": map[string]any{
		"id": id, "key": key, "label": label, "layer": "custom", "type": typ,
		"config": config, "sortOrder": sortOrder, "hidden": hidden, "icon": body.Icon,
		"createdAt": formatIssueSheetTime(created), "updatedAt": formatIssueSheetTime(updated),
	}}, 201, nil
}

type updateColumnBody struct {
	Label     *string         `json:"label"`
	Config    json.RawMessage `json:"config"`
	SortOrder *int            `json:"sortOrder"`
	Hidden    *bool           `json:"hidden"`
	Icon      *string         `json:"icon"`
}

func (api *issueSheetAPI) updateColumn(ctx context.Context, actor issueSheetActor, project issueSheetProject, columnID string, r *http.Request) (any, int, error) {
	if _, err := uuid.Parse(strings.TrimSpace(columnID)); err != nil {
		return nil, 0, issueSheetFailure(404, "issue_sheet_column_not_found", "Column not found")
	}
	var body updateColumnBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	var key, label, layer, typ string
	var config []byte
	var sortOrder int
	var hidden bool
	var icon *string
	err := api.pool.QueryRow(ctx, `
        select key, label, layer, type, config, sort_order, hidden, icon
        from issue_sheet_columns
        where id=$1 and organization_id=$2 and project_id=$3`,
		columnID, actor.organizationID, project.ID,
	).Scan(&key, &label, &layer, &typ, &config, &sortOrder, &hidden, &icon)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, issueSheetFailure(404, "issue_sheet_column_not_found", "Column not found")
	}
	if err != nil {
		return nil, 0, err
	}
	if body.Label != nil {
		label = strings.TrimSpace(*body.Label)
		if label == "" {
			return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_column_payload", "Invalid column payload")
		}
	}
	if len(body.Config) > 0 {
		if typ == "enrichment" || isProtectedIssueSheetColumnKey(key) || typ != "select" {
			return nil, 0, issueSheetFailure(400, "issue_sheet_column_config_not_editable", "Column config is not editable")
		}
		config = body.Config
	}
	if body.SortOrder != nil {
		sortOrder = *body.SortOrder
	}
	if body.Hidden != nil {
		hidden = *body.Hidden
	}
	if body.Icon != nil {
		if !canDeleteIssueSheetColumn(key, layer) {
			return nil, 0, issueSheetFailure(400, "issue_sheet_column_icon_not_editable", "Column icon is not editable")
		}
		icon = body.Icon
	}
	var updated time.Time
	err = api.pool.QueryRow(ctx, `
        update issue_sheet_columns set label=$1, config=$2::jsonb, sort_order=$3, hidden=$4, icon=$5, updated_at=now()
        where id=$6 and organization_id=$7 and project_id=$8
        returning updated_at`,
		label, config, sortOrder, hidden, icon, columnID, actor.organizationID, project.ID,
	).Scan(&updated)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"column": map[string]any{
		"id": columnID, "key": key, "label": label, "layer": layer, "type": typ,
		"config": json.RawMessage(config), "sortOrder": sortOrder, "hidden": hidden, "icon": icon,
		"updatedAt": formatIssueSheetTime(updated),
	}}, 200, nil
}

type reorderColumnsBody struct {
	ColumnIDs []string `json:"columnIds"`
}

func (api *issueSheetAPI) reorderColumns(ctx context.Context, actor issueSheetActor, project issueSheetProject, r *http.Request) (any, int, error) {
	var body reorderColumnsBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	if len(body.ColumnIDs) == 0 {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_column_order_payload", "columnIds is required")
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for index, columnID := range body.ColumnIDs {
		tag, err := tx.Exec(ctx, `
            update issue_sheet_columns set sort_order=$1, updated_at=now()
            where id=$2 and organization_id=$3 and project_id=$4`,
			index, columnID, actor.organizationID, project.ID)
		if err != nil {
			return nil, 0, err
		}
		if tag.RowsAffected() == 0 {
			return nil, 0, issueSheetFailure(404, "issue_sheet_column_not_found", "Column not found")
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	columns, err := api.loadColumns(ctx, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"columns": columns}, 200, nil
}

func (api *issueSheetAPI) deleteColumn(ctx context.Context, actor issueSheetActor, project issueSheetProject, columnID string) (any, int, error) {
	if _, err := uuid.Parse(strings.TrimSpace(columnID)); err != nil {
		return nil, 0, issueSheetFailure(404, "issue_sheet_column_not_found", "Column not found")
	}
	var key, layer string
	err := api.pool.QueryRow(ctx, `
        select key, layer from issue_sheet_columns
        where id=$1 and organization_id=$2 and project_id=$3`,
		columnID, actor.organizationID, project.ID).Scan(&key, &layer)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, issueSheetFailure(404, "issue_sheet_column_not_found", "Column not found")
	}
	if err != nil {
		return nil, 0, err
	}
	if !canDeleteIssueSheetColumn(key, layer) {
		return nil, 0, issueSheetFailure(400, "column_protected", "Protected columns cannot be deleted")
	}
	if _, err := api.pool.Exec(ctx, `delete from issue_sheet_columns where id=$1 and organization_id=$2 and project_id=$3`,
		columnID, actor.organizationID, project.ID); err != nil {
		return nil, 0, err
	}
	return nil, 204, nil
}
