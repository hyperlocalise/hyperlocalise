package main

import (
	"context"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

type activityLogTargetInput struct {
	targetID   string
	targetKind string
	payload    map[string]any
}

func activityLogTargetKey(kind, id string) string {
	return kind + ":" + id
}

func payloadTargetDisplayName(payload map[string]any) *string {
	for _, key := range []string{"name", "fileName", "integrationKind", "keyPrefix"} {
		if value, ok := payload[key].(string); ok && strings.TrimSpace(value) != "" {
			trimmed := strings.TrimSpace(value)
			return &trimmed
		}
	}
	return nil
}

func isContentEditorAllFilesSourcePath(sourcePath string) bool {
	trimmed := strings.TrimSpace(sourcePath)
	return trimmed == "" || trimmed == "*"
}

func activityLogPayloadString(payload map[string]any, key string) string {
	value, ok := payload[key].(string)
	if !ok {
		return ""
	}
	return value
}

func activityLogPayloadUUID(payload map[string]any, key string) string {
	value := activityLogPayloadString(payload, key)
	if uuid.Validate(value) != nil {
		return ""
	}
	return value
}

func stringPtr(value string) *string {
	return &value
}

func loadActivityLogTargetViews(
	ctx context.Context,
	pool dictionaryPool,
	organizationID, organizationSlug string,
	rows []activityLogTargetInput,
) (map[string]activityLogTargetView, error) {
	views := map[string]activityLogTargetView{}
	if len(rows) == 0 {
		return views, nil
	}

	idsByKind := map[string][]string{}
	for _, row := range rows {
		idsByKind[row.targetKind] = append(idsByKind[row.targetKind], row.targetID)
	}

	unique := func(ids []string) []string {
		seen := make(map[string]struct{}, len(ids))
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
		return out
	}

	projectIDs := unique(idsByKind["project"])
	glossaryIDs := unique(idsByKind["glossary"])
	memoryIDs := unique(idsByKind["translation_memory"])
	jobIDs := unique(idsByKind["job"])
	automationIDs := unique(idsByKind["automation"])
	membershipIDs := unique(idsByKind["membership"])

	payloadMemberUserIDs := make([]string, 0)
	seenMembers := map[string]struct{}{}
	for _, row := range rows {
		memberUserID := activityLogPayloadUUID(row.payload, "memberUserId")
		if memberUserID == "" {
			continue
		}
		if _, ok := seenMembers[memberUserID]; ok {
			continue
		}
		seenMembers[memberUserID] = struct{}{}
		payloadMemberUserIDs = append(payloadMemberUserIDs, memberUserID)
	}

	if len(projectIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, name from projects
            where organization_id = $1 and id = any($2::text[])`, organizationID, projectIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id, name string
			if err := queryRows.Scan(&id, &name); err != nil {
				queryRows.Close()
				return nil, err
			}
			views[activityLogTargetKey("project", id)] = activityLogTargetView{
				DisplayName: stringPtr(name),
				Href:        stringPtr("/org/" + organizationSlug + "/projects/" + id),
				ID:          id,
				Kind:        "project",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	if len(glossaryIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, name from glossaries
            where organization_id = $1 and id = any($2::uuid[])`, organizationID, glossaryIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id, name string
			if err := queryRows.Scan(&id, &name); err != nil {
				queryRows.Close()
				return nil, err
			}
			views[activityLogTargetKey("glossary", id)] = activityLogTargetView{
				DisplayName: stringPtr(name),
				Href:        stringPtr("/org/" + organizationSlug + "/glossaries/" + id),
				ID:          id,
				Kind:        "glossary",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	if len(memoryIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, name from memories
            where organization_id = $1 and id = any($2::uuid[])`, organizationID, memoryIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id, name string
			if err := queryRows.Scan(&id, &name); err != nil {
				queryRows.Close()
				return nil, err
			}
			views[activityLogTargetKey("translation_memory", id)] = activityLogTargetView{
				DisplayName: stringPtr(name),
				Href:        stringPtr("/org/" + organizationSlug + "/translation-memories/" + id),
				ID:          id,
				Kind:        "translation_memory",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	if len(jobIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, kind, project_id from jobs
            where organization_id = $1 and id = any($2::text[])`, organizationID, jobIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id, kind string
			var projectID *string
			if err := queryRows.Scan(&id, &kind, &projectID); err != nil {
				queryRows.Close()
				return nil, err
			}
			href := "/org/" + organizationSlug + "/jobs"
			if projectID != nil && *projectID != "" {
				href = "/org/" + organizationSlug + "/projects/" + *projectID + "/jobs/" + id
			}
			views[activityLogTargetKey("job", id)] = activityLogTargetView{
				DisplayName: stringPtr(kind),
				Href:        stringPtr(href),
				ID:          id,
				Kind:        "job",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	if len(automationIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, name from workspace_automations
            where organization_id = $1 and id = any($2::uuid[])`, organizationID, automationIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id, name string
			if err := queryRows.Scan(&id, &name); err != nil {
				queryRows.Close()
				return nil, err
			}
			views[activityLogTargetKey("automation", id)] = activityLogTargetView{
				DisplayName: stringPtr(name),
				Href:        stringPtr("/org/" + organizationSlug + "/automations/" + id),
				ID:          id,
				Kind:        "automation",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	if len(membershipIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select m.id, u.first_name, u.last_name
            from organization_memberships m
            left join users u on u.id = m.user_id
            where m.organization_id = $1 and m.id = any($2::uuid[])`, organizationID, membershipIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id string
			var firstName, lastName *string
			if err := queryRows.Scan(&id, &firstName, &lastName); err != nil {
				queryRows.Close()
				return nil, err
			}
			name := activityLogPersonName(firstName, lastName)
			views[activityLogTargetKey("membership", id)] = activityLogTargetView{
				DisplayName: stringPtr(name),
				Href:        stringPtr("/org/" + organizationSlug + "/settings/members"),
				ID:          id,
				Kind:        "membership",
			}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	payloadMembers := map[string]struct{ firstName, lastName *string }{}
	if len(payloadMemberUserIDs) > 0 {
		queryRows, err := pool.Query(ctx, `
            select id, first_name, last_name from users where id = any($1::uuid[])`, payloadMemberUserIDs)
		if err != nil {
			return nil, err
		}
		for queryRows.Next() {
			var id string
			var firstName, lastName *string
			if err := queryRows.Scan(&id, &firstName, &lastName); err != nil {
				queryRows.Close()
				return nil, err
			}
			payloadMembers[id] = struct{ firstName, lastName *string }{firstName, lastName}
		}
		err = queryRows.Err()
		queryRows.Close()
		if err != nil {
			return nil, err
		}
	}

	for _, row := range rows {
		key := activityLogTargetKey(row.targetKind, row.targetID)
		if _, ok := views[key]; ok {
			continue
		}

		if row.targetKind == "membership" {
			memberUserID := activityLogPayloadUUID(row.payload, "memberUserId")
			if memberUserID != "" {
				var displayName *string
				if member, ok := payloadMembers[memberUserID]; ok {
					name := activityLogPersonName(member.firstName, member.lastName)
					displayName = &name
				}
				views[key] = activityLogTargetView{
					DisplayName: displayName,
					Href:        stringPtr("/org/" + organizationSlug + "/settings/members"),
					ID:          row.targetID,
					Kind:        "membership",
				}
				continue
			}
		}

		displayName := payloadTargetDisplayName(row.payload)
		projectID := activityLogPayloadString(row.payload, "projectId")
		sourcePath := activityLogPayloadString(row.payload, "sourcePath")
		canLinkFile := (row.targetKind == "file" || row.targetKind == "string_segment") &&
			projectID != "" &&
			sourcePath != "" &&
			!isContentEditorAllFilesSourcePath(sourcePath)

		var href *string
		if canLinkFile {
			href = stringPtr("/org/" + organizationSlug + "/projects/" + url.PathEscape(projectID) +
				"/files/content-editor?sourcePath=" + url.QueryEscape(sourcePath))
		}

		views[key] = activityLogTargetView{
			DisplayName: displayName,
			Href:        href,
			ID:          row.targetID,
			Kind:        row.targetKind,
		}
	}

	return views, nil
}
