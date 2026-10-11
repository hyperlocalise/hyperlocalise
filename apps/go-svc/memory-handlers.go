package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

type memoryPayload struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
}

func (p *memoryPayload) validateCreate() error {
	if p.Name == nil {
		return invalidMemory()
	}
	name := trimMemoryInput(*p.Name)
	p.Name = &name
	if name == "" || utf16Length(name) > 200 {
		return invalidMemory()
	}
	if p.Description != nil && utf16Length(*p.Description) > 10000 {
		return invalidMemory()
	}
	return nil
}

func (p *memoryPayload) validateUpdate() error {
	if p.Name == nil && p.Description == nil && p.Status == nil {
		return invalidMemory()
	}
	if p.Name != nil {
		name := trimMemoryInput(*p.Name)
		p.Name = &name
		if name == "" || utf16Length(name) > 200 {
			return invalidMemory()
		}
	}
	if p.Description != nil && utf16Length(*p.Description) > 10000 {
		return invalidMemory()
	}
	if p.Status != nil && *p.Status != "active" && *p.Status != "draft" && *p.Status != "archived" {
		return invalidMemory()
	}
	return nil
}

func memoryPage(r *http.Request, defaultLimit, maxLimit int) (int, int, error) {
	limit, offset := defaultLimit, 0
	for key, target := range map[string]*int{"limit": &limit, "offset": &offset} {
		if raw, ok := r.URL.Query()[key]; ok {
			n, err := strconv.ParseFloat(strings.TrimSpace(raw[0]), 64)
			if strings.TrimSpace(raw[0]) == "" {
				n, err = 0, nil
			}
			if err != nil || n < 0 || n > 9007199254740991 || n != float64(int(n)) {
				return 0, 0, invalidMemory()
			}
			*target = int(n)
		}
	}
	if limit < 1 || limit > maxLimit {
		return 0, 0, invalidMemory()
	}
	return limit, offset, nil
}

func (api *memoryAPI) getMemoryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return map[string]any{"memory": m}, 200, nil
}

func (api *memoryAPI) patchMemoryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.patchMemory(r, actor, m)
}

func (api *memoryAPI) deleteMemoryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.deleteMemory(r.Context(), actor, m)
}

func (api *memoryAPI) listMemories(r *http.Request, actor memoryActor) (any, int, error) {
	limit, offset, err := memoryPage(r, 50, 100)
	if err != nil {
		limit, offset = 50, 0
	}
	projectID := normalizeMemoryProjectID(r.URL.Query().Get("projectId"))
	if r.URL.Query().Has("projectId") {
		if projectID == "" || utf16Length(projectID) > 128 {
			return map[string]any{"memories": []memoryRecord{}, "total": 0}, 200, nil
		}
		if _, projectErr := api.ownedMemoryProject(r.Context(), actor, projectID); projectErr != nil {
			return map[string]any{"memories": []memoryRecord{}, "total": 0}, 200, nil
		}
	}
	where := memoryAccessPredicate("m", 1, 2, 3)
	args := []any{actor.organizationID, actor.userID, actor.orgWideAccess()}
	if projectID != "" {
		args = append(args, projectID)
		where += ` and exists(select 1 from project_memories pm where pm.memory_id=m.id and pm.organization_id=$1 and pm.project_id=$` + strconv.Itoa(len(args)) + `)`
	}
	source := trimMemoryInput(r.URL.Query().Get("source"))
	if source == "native" || source == "external_tms" {
		args = append(args, source)
		where += ` and m.source=$` + strconv.Itoa(len(args))
	}
	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	args = append(args, limit, offset)
	rows, err := api.pool.Query(r.Context(), `select `+memoryColumns+` from memories m where `+where+` order by m.created_at desc limit $`+strconv.Itoa(limitPos)+` offset $`+strconv.Itoa(offsetPos), args...)
	if err != nil {
		return nil, 0, err
	}
	records := []memoryRecord{}
	for rows.Next() {
		m, scanErr := scanMemory(rows, actor)
		if scanErr != nil {
			rows.Close()
			return nil, 0, scanErr
		}
		records = append(records, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := api.attachMemoryProjectCounts(r.Context(), actor, records); err != nil {
		return nil, 0, err
	}
	countArgs := args[:len(args)-2]
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from memories m where `+where, countArgs...).Scan(&total)
	return map[string]any{"memories": records, "total": total}, 200, err
}

func (api *memoryAPI) createMemory(r *http.Request, actor memoryActor) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	var payload memoryPayload
	if err := readMemoryBody(r, []string{"name", "description"}, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validateCreate(); err != nil {
		return nil, 0, err
	}
	description := ""
	if payload.Description != nil {
		description = *payload.Description
	}
	m, err := scanMemory(api.pool.QueryRow(r.Context(), `insert into memories as m (organization_id, created_by_user_id, name, description) values ($1,$2,$3,$4) returning `+memoryColumns, actor.organizationID, actor.userID, *payload.Name, description), actor)
	if err != nil {
		return nil, 0, err
	}
	createdPayload := map[string]any{
		"name":       m.Name,
		"resourceId": m.ID,
		"source":     m.Source,
	}
	if m.ExternalProviderKind != nil {
		createdPayload["providerKind"] = *m.ExternalProviderKind
	}
	api.trackMemoryCreated(r.Context())
	api.publishActivity(r.Context(), activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "translation_memory_created",
		OrganizationID: actor.organizationID,
		Payload:        createdPayload,
		TargetID:       m.ID,
		TargetKind:     "translation_memory",
	})
	return map[string]any{"memory": m}, 201, nil
}

func (api *memoryAPI) trackMemoryCreated(ctx context.Context) {
	if api == nil || api.analytics == nil {
		return
	}
	api.analytics.Track(ctx, productUsageMemoryCreatedEvent, map[string]string{
		"status": productUsageMemoryCreatedStatus,
		"source": productUsageMemoryCreatedSource,
	})
}

func (api *memoryAPI) patchMemory(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(r.Context(), actor, m, "edit", true, false); denied {
		return nil, 0, err
	}
	var payload memoryPayload
	if err := readMemoryBody(r, []string{"name", "description", "status"}, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validateUpdate(); err != nil {
		return nil, 0, err
	}
	updated, err := scanMemory(api.pool.QueryRow(r.Context(), `update memories as m set name=coalesce($3,name), description=coalesce($4,description), status=coalesce($5::asset_status,status), updated_at=now() where id=$1 and organization_id=$2 and source='native' returning `+memoryColumns, m.ID, actor.organizationID, payload.Name, payload.Description, payload.Status), actor)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingMemory()
	}
	return map[string]any{"memory": updated}, 200, err
}

func (api *memoryAPI) deleteMemory(ctx context.Context, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(ctx, actor, m, "delete", true, true); denied {
		return nil, 0, err
	}
	_, err := api.pool.Exec(ctx, `delete from memories where id=$1 and organization_id=$2 and source='native'`, m.ID, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "translation_memory_deleted",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"name":       m.Name,
			"resourceId": m.ID,
		},
		TargetID:   m.ID,
		TargetKind: "translation_memory",
	})
	return nil, 204, nil
}

func normalizeMemoryProjectID(raw string) string {
	value := trimMemoryInput(raw)
	for i := 0; i < 2 && strings.Contains(value, "%"); i++ {
		decoded, err := url.PathUnescape(value)
		if err != nil || decoded == value {
			break
		}
		value = decoded
	}
	return trimMemoryInput(value)
}

func (api *memoryAPI) ownedMemoryProject(ctx context.Context, actor memoryActor, raw string) (string, error) {
	id := normalizeMemoryProjectID(raw)
	if id == "" || utf16Length(id) > 128 {
		return "", missingMemoryProject()
	}
	var found string
	err := api.pool.QueryRow(ctx, `select p.id from projects p where p.id=$1 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`, id, actor.organizationID, actor.orgWideAccess(), actor.userID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", missingMemoryProject()
	}
	return found, err
}

type memoryAttachmentPayload struct {
	ProjectID string `json:"projectId"`
	Priority  *int   `json:"priority"`
}

func (p memoryAttachmentPayload) validate() error {
	if trimMemoryInput(p.ProjectID) == "" {
		return invalidMemory()
	}
	if p.Priority != nil && (*p.Priority < 0 || *p.Priority > 10000) {
		return invalidMemory()
	}
	return nil
}

type memoryProjectRecord struct {
	ProjectID     string   `json:"projectId"`
	ProjectName   string   `json:"projectName"`
	Priority      int      `json:"priority"`
	SourceLocale  *string  `json:"sourceLocale"`
	TargetLocales []string `json:"targetLocales"`
}

func (api *memoryAPI) memoryProjects(ctx context.Context, actor memoryActor, memoryID string) ([]memoryProjectRecord, error) {
	rows, err := api.pool.Query(ctx, `select a.project_id, p.name, a.priority, p.source_locale, p.target_locales from project_memories a join projects p on p.id=a.project_id where a.memory_id=$1 and a.organization_id=$2 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default')))) order by a.priority, a.created_at, a.project_id`, memoryID, actor.organizationID, actor.orgWideAccess(), actor.userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []memoryProjectRecord{}
	for rows.Next() {
		var record memoryProjectRecord
		var targets []byte
		if err := rows.Scan(&record.ProjectID, &record.ProjectName, &record.Priority, &record.SourceLocale, &targets); err != nil {
			return nil, err
		}
		record.TargetLocales = []string{}
		if len(targets) > 0 {
			_ = json.Unmarshal(targets, &record.TargetLocales)
		}
		result = append(result, record)
	}
	return result, rows.Err()
}

func (api *memoryAPI) listMemoryProjects(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	projects, err := api.memoryProjects(r.Context(), actor, m.ID)
	return map[string]any{"projects": projects}, 200, err
}

func (api *memoryAPI) attachMemoryProject(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(r.Context(), actor, m, "edit", true, true); denied {
		return nil, 0, err
	}
	var payload memoryAttachmentPayload
	if err := readMemoryBody(r, []string{"projectId", "priority"}, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validate(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	projectID, err := api.ownedMemoryProject(ctx, actor, payload.ProjectID)
	if err != nil {
		return nil, 0, err
	}
	priority := 0
	if payload.Priority != nil {
		priority = *payload.Priority
	}
	_, err = api.pool.Exec(ctx, `insert into project_memories (organization_id, project_id, memory_id, priority) values ($1,$2,$3,$4) on conflict (project_id, memory_id) do update set priority=excluded.priority, updated_at=now()`, actor.organizationID, projectID, m.ID, priority)
	if err != nil {
		return nil, 0, err
	}
	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "translation_memory_project_attached",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"projectId":  projectID,
			"resourceId": m.ID,
		},
		TargetID:   projectID,
		TargetKind: "project",
	})
	return api.listMemoryProjects(r, actor, m)
}

func (api *memoryAPI) detachMemoryProject(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(r.Context(), actor, m, "edit", true, true); denied {
		return nil, 0, err
	}
	projectID, err := api.ownedMemoryProject(r.Context(), actor, r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(r.Context(), `delete from project_memories where memory_id=$1 and project_id=$2 and organization_id=$3`, m.ID, projectID, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() > 0 {
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorUserID:    actor.userID,
			EventType:      "translation_memory_project_detached",
			OrganizationID: actor.organizationID,
			Payload: map[string]any{
				"projectId":  projectID,
				"resourceId": m.ID,
			},
			TargetID:   projectID,
			TargetKind: "project",
		})
	}
	return nil, 204, nil
}

func (api *memoryAPI) denyMemoryAction(ctx context.Context, actor memoryActor, m memoryRecord, action string, requireNative, rejectArchived bool) (bool, error) {
	if !actor.canWriteMemories() {
		return true, api.rejectMemoryAction(ctx, actor, m, action, "unauthorized", memoryFailure(403, "forbidden", "Insufficient permissions"))
	}
	if requireNative {
		if err := requireNativeMemory(m); err != nil {
			return true, api.rejectMemoryAction(ctx, actor, m, action, "read_only", err)
		}
	}
	if rejectArchived && m.Status == "archived" {
		return true, api.rejectMemoryAction(ctx, actor, m, action, "archived", memoryFailure(403, "memory_action_archived", "This translation memory is archived"))
	}
	return false, nil
}

func (api *memoryAPI) rejectMemoryAction(ctx context.Context, actor memoryActor, m memoryRecord, action, reason string, err error) error {
	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "translation_memory_action_rejected",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"action":     action,
			"reason":     reason,
			"resourceId": m.ID,
		},
		TargetID:   m.ID,
		TargetKind: "translation_memory",
	})
	return err
}

func (api *memoryAPI) attachMemoryProjectCounts(ctx context.Context, actor memoryActor, records []memoryRecord) error {
	if len(records) == 0 {
		return nil
	}
	ids := make([]string, len(records))
	index := make(map[string]int, len(records))
	for i, record := range records {
		ids[i] = record.ID
		index[record.ID] = i
	}
	rows, err := api.pool.Query(ctx, `select a.memory_id, count(*) from project_memories a join projects p on p.id=a.project_id where a.memory_id=any($1::uuid[]) and a.organization_id=$2 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default')))) group by a.memory_id`, ids, actor.organizationID, actor.orgWideAccess(), actor.userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var memoryID string
		var count int
		if scanErr := rows.Scan(&memoryID, &count); scanErr != nil {
			return scanErr
		}
		if i, ok := index[memoryID]; ok {
			records[i].ProjectCount = count
		}
	}
	return rows.Err()
}
