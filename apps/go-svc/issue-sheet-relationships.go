package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const maxCycleCheckIterations = 10000

type createRelationshipBody struct {
	RelatedIssueID string `json:"relatedIssueId"`
	Kind           string `json:"kind"`
}

func (api *issueSheetAPI) listRelationships(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}

	outgoing, err := api.queryRelationships(ctx, actor, issueID, true)
	if err != nil {
		return nil, 0, err
	}
	incoming, err := api.queryRelationships(ctx, actor, issueID, false)
	if err != nil {
		return nil, 0, err
	}
	relationships := append(outgoing, incoming...)
	return map[string]any{"relationships": relationships}, 200, nil
}

func (api *issueSheetAPI) queryRelationships(ctx context.Context, actor issueSheetActor, issueID string, outgoing bool) ([]map[string]any, error) {
	accessSQL := formatQaProjectTeamAccessSQL(3, 4, 1)
	var sql string
	if outgoing {
		sql = `
            select r.id, r.kind, r.created_at, i.id, i.project_id, i.title, i.status
            from issue_sheet_relationships r
            join issue_sheet_issues i on i.id = r.related_issue_id
            join projects p on p.id = i.project_id
            where r.organization_id = $1 and r.issue_id = $2
              and ` + accessSQL
	} else {
		sql = `
            select r.id, r.kind, r.created_at, i.id, i.project_id, i.title, i.status
            from issue_sheet_relationships r
            join issue_sheet_issues i on i.id = r.issue_id
            join projects p on p.id = i.project_id
            where r.organization_id = $1 and r.related_issue_id = $2
              and ` + accessSQL
	}
	rows, err := api.pool.Query(ctx, sql, actor.organizationID, issueID, actor.canWriteProjectTeam(), actor.userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, kind, otherID, otherProjectID, title, status string
		var createdAt time.Time
		if err := rows.Scan(&id, &kind, &createdAt, &otherID, &otherProjectID, &title, &status); err != nil {
			return nil, err
		}
		direction := "outgoing"
		if !outgoing {
			direction = "incoming"
		}
		out = append(out, map[string]any{
			"id":            id,
			"presentedKind": presentRelationshipKind(kind, direction),
			"otherIssue": map[string]any{
				"issueId":   otherID,
				"projectId": otherProjectID,
				"title":     title,
				"status":    status,
			},
			"createdAt": formatIssueSheetTime(createdAt),
		})
	}
	return out, rows.Err()
}

func presentRelationshipKind(storedKind, direction string) string {
	switch storedKind {
	case "related":
		return "related"
	case "blocks":
		if direction == "outgoing" {
			return "blocks"
		}
		return "blocked_by"
	case "duplicate_of":
		if direction == "outgoing" {
			return "duplicate_of"
		}
		return "duplicate"
	default:
		return storedKind
	}
}

func (api *issueSheetAPI) createRelationship(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	var body createRelationshipBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	kind := strings.TrimSpace(body.Kind)
	relatedRef := strings.TrimSpace(body.RelatedIssueID)
	switch kind {
	case "related", "blocks", "blocked_by", "duplicate_of":
	default:
		return nil, 0, issueSheetFailure(400, "invalid_issue_relationship_payload", "Invalid issue relationship payload")
	}
	if relatedRef == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_relationship_payload", "Invalid issue relationship payload")
	}

	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	if relatedRef == issueID || relatedRef == issueRef {
		return nil, 0, issueSheetFailure(400, "relationship_target_is_self", "An issue cannot be related to itself")
	}

	targetID, targetProjectID, targetTitle, targetStatus, err := api.lookupAccessibleRelatedIssue(ctx, actor, relatedRef)
	if err != nil {
		return nil, 0, err
	}
	if targetID == issueID {
		return nil, 0, issueSheetFailure(400, "relationship_target_is_self", "An issue cannot be related to itself")
	}

	storedKind := kind
	storedIssueID := issueID
	storedRelatedID := targetID
	relationshipProjectID := project.ID
	if kind == "blocked_by" {
		storedKind = "blocks"
		storedIssueID = targetID
		storedRelatedID = issueID
		relationshipProjectID = targetProjectID
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
        select pg_advisory_xact_lock(hashtextextended($1, 0))`,
		"issue_sheet_relationships:"+actor.organizationID); err != nil {
		return nil, 0, err
	}

	if storedKind == "duplicate_of" {
		var existing string
		err := tx.QueryRow(ctx, `
            select id from issue_sheet_relationships
            where organization_id = $1 and issue_id = $2 and kind = 'duplicate_of'
            limit 1`, actor.organizationID, storedIssueID).Scan(&existing)
		if err == nil {
			return nil, 0, issueSheetFailure(409, "issue_already_marked_duplicate", "This issue is already marked as a duplicate of another issue")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, err
		}
	}

	if storedKind == "related" {
		var existing string
		err := tx.QueryRow(ctx, `
            select id from issue_sheet_relationships
            where organization_id = $1 and kind = 'related'
              and ((issue_id = $2 and related_issue_id = $3) or (issue_id = $3 and related_issue_id = $2))
            limit 1`, actor.organizationID, storedIssueID, storedRelatedID).Scan(&existing)
		if err == nil {
			return nil, 0, issueSheetFailure(409, "relationship_already_exists", "This relationship already exists")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, err
		}
	}

	if storedKind == "blocks" || storedKind == "duplicate_of" {
		cycle, err := wouldCreateCycle(ctx, tx, actor.organizationID, storedKind, storedIssueID, storedRelatedID)
		if err != nil {
			return nil, 0, err
		}
		if cycle {
			code := "blocking_relationship_cycle"
			msg := "This would create a circular blocking relationship"
			if storedKind == "duplicate_of" {
				code = "duplicate_relationship_cycle"
				msg = "This would create a circular duplicate chain"
			}
			return nil, 0, issueSheetFailure(400, code, msg)
		}
	}

	var relationshipID string
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
        insert into issue_sheet_relationships (
            organization_id, project_id, issue_id, related_issue_id, kind, created_by_user_id
        ) values ($1, $2, $3, $4, $5, $6)
        returning id, created_at`,
		actor.organizationID, relationshipProjectID, storedIssueID, storedRelatedID, storedKind, actor.userID,
	).Scan(&relationshipID, &createdAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, 0, issueSheetFailure(409, "relationship_already_exists", "This relationship already exists")
		}
		return nil, 0, err
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, 'relationship_added', jsonb_build_object('relatedIssueId', $5::text, 'kind', $6::text), clock_timestamp())`,
		actor.organizationID, project.ID, issueID, actor.userID, targetID, kind); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	direction := "outgoing"
	presented := presentRelationshipKind(storedKind, direction)
	if kind == "blocked_by" {
		presented = "blocked_by"
	}
	return map[string]any{
		"relationship": map[string]any{
			"id":            relationshipID,
			"presentedKind": presented,
			"otherIssue": map[string]any{
				"issueId":   targetID,
				"projectId": targetProjectID,
				"title":     targetTitle,
				"status":    targetStatus,
			},
			"createdAt": formatIssueSheetTime(createdAt),
		},
	}, 201, nil
}

func (api *issueSheetAPI) deleteRelationship(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef, relationshipID string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	var relatedIssueID, kind string
	err = api.pool.QueryRow(ctx, `
        select related_issue_id, kind from issue_sheet_relationships
        where organization_id = $1 and id = $2
          and (issue_id = $3 or related_issue_id = $3)
        limit 1`, actor.organizationID, relationshipID, issueID).Scan(&relatedIssueID, &kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, issueSheetFailure(404, "relationship_not_found", "Relationship not found")
	}
	if err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(ctx, `
        delete from issue_sheet_relationships
        where organization_id = $1 and id = $2`, actor.organizationID, relationshipID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, issueSheetFailure(404, "relationship_not_found", "Relationship not found")
	}
	_, _ = api.pool.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, 'relationship_removed', jsonb_build_object('relatedIssueId', $5::text, 'kind', $6::text), clock_timestamp())`,
		actor.organizationID, project.ID, issueID, actor.userID, relatedIssueID, kind)
	return nil, 204, nil
}

func wouldCreateCycle(ctx context.Context, db dictionaryDB, organizationID, kind, fromIssueID, toIssueID string) (bool, error) {
	frontier := map[string]struct{}{toIssueID: {}}
	visited := map[string]struct{}{}
	iterations := 0
	for len(frontier) > 0 {
		if _, ok := frontier[fromIssueID]; ok {
			return true, nil
		}
		iterations++
		if iterations > maxCycleCheckIterations {
			return false, nil
		}
		ids := make([]string, 0, len(frontier))
		for id := range frontier {
			visited[id] = struct{}{}
			ids = append(ids, id)
		}
		rows, err := db.Query(ctx, `
            select related_issue_id from issue_sheet_relationships
            where organization_id = $1 and kind = $2 and issue_id = any($3)`,
			organizationID, kind, ids)
		if err != nil {
			return false, err
		}
		next := map[string]struct{}{}
		for rows.Next() {
			var related string
			if err := rows.Scan(&related); err != nil {
				rows.Close()
				return false, err
			}
			if _, seen := visited[related]; !seen {
				next[related] = struct{}{}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return false, err
		}
		frontier = next
	}
	return false, nil
}
