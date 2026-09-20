package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"
)

func normalizeGlossaryProjectID(raw string) string {
	value := trimGlossaryInput(raw)
	for i := 0; i < 2 && strings.Contains(value, "%"); i++ {
		decoded, err := url.PathUnescape(value)
		if err != nil || decoded == value {
			break
		}
		value = decoded
	}
	return trimGlossaryInput(value)
}

func (api *glossaryAPI) ownedGlossaryProject(ctx context.Context, actor glossaryActor, raw string) (string, error) {
	id := normalizeGlossaryProjectID(raw)
	if id == "" || utf16Length(id) > 128 {
		return "", missingGlossaryProject()
	}
	var found string
	err := api.pool.QueryRow(ctx, `select p.id from projects p where p.id=$1 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`, id, actor.organizationID, actor.orgWideAccess(), actor.userID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", missingGlossaryProject()
	}
	return found, err
}

type glossaryAttachmentPayload struct {
	ProjectID string `json:"projectId"`
	Priority  *int   `json:"priority"`
}

func (p glossaryAttachmentPayload) validate() error {
	if trimGlossaryInput(p.ProjectID) == "" {
		return invalidGlossary()
	}
	if p.Priority != nil && (*p.Priority < 0 || *p.Priority > 10000) {
		return invalidGlossary()
	}
	return nil
}

type glossaryProjectRecord struct {
	ProjectID     string   `json:"projectId"`
	ProjectName   string   `json:"projectName"`
	Priority      int      `json:"priority"`
	SourceLocale  *string  `json:"sourceLocale"`
	TargetLocales []string `json:"targetLocales"`
	ExternalURL   *string  `json:"externalUrl"`
}

func (api *glossaryAPI) glossaryProjects(ctx context.Context, actor glossaryActor, glossaryID string) ([]glossaryProjectRecord, error) {
	rows, err := api.pool.Query(ctx, `select a.project_id, p.name, a.priority, p.source_locale, p.target_locales from project_glossaries a join projects p on p.id=a.project_id where a.glossary_id=$1 and a.organization_id=$2 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default')))) order by a.priority, a.created_at, a.project_id`, glossaryID, actor.organizationID, actor.orgWideAccess(), actor.userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []glossaryProjectRecord{}
	for rows.Next() {
		var record glossaryProjectRecord
		var targets []byte
		if err := rows.Scan(&record.ProjectID, &record.ProjectName, &record.Priority, &record.SourceLocale, &targets); err != nil {
			return nil, err
		}
		record.TargetLocales = []string{}
		if len(targets) > 0 {
			_ = json.Unmarshal(targets, &record.TargetLocales)
		}
		record.ExternalURL = nil
		result = append(result, record)
	}
	return result, rows.Err()
}

func (api *glossaryAPI) glossaryProjectRequest(r *http.Request, actor glossaryActor, g glossaryRecord, rest []string) (any, int, error) {
	if len(rest) > 1 {
		return nil, 0, missingGlossary()
	}
	ctx := r.Context()
	if r.Method == http.MethodDelete && len(rest) == 1 {
		if !actor.canManageGlossaries() {
			return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
		}
		if err := requireNativeGlossary(g); err != nil {
			return nil, 0, err
		}
		projectID, err := api.ownedGlossaryProject(ctx, actor, rest[0])
		if err != nil {
			return nil, 0, err
		}
		if g.ControlLevel == "team" {
			var nativeCount int
			err := api.pool.QueryRow(ctx, `select count(*) from project_glossaries a join projects p on p.id=a.project_id where a.glossary_id=$1 and p.source='native'`, g.ID).Scan(&nativeCount)
			if err != nil {
				return nil, 0, err
			}
			var detachingNative bool
			err = api.pool.QueryRow(ctx, `select p.source='native' from projects p where p.id=$1`, projectID).Scan(&detachingNative)
			if err != nil {
				return nil, 0, err
			}
			if detachingNative && nativeCount <= 1 {
				return nil, 0, glossaryFailure(403, "glossary_team_project_required", "Team glossaries must attach at least one accessible project")
			}
		}
		_, err = api.pool.Exec(ctx, `delete from project_glossaries where glossary_id=$1 and project_id=$2 and organization_id=$3`, g.ID, projectID, actor.organizationID)
		return nil, 204, err
	}
	if len(rest) != 0 {
		return nil, 0, missingGlossary()
	}
	if r.Method == http.MethodPost {
		if !actor.canManageGlossaries() {
			return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
		}
		if err := requireNativeGlossary(g); err != nil {
			return nil, 0, err
		}
		var payload glossaryAttachmentPayload
		if err := readGlossaryBody(r, []string{"projectId", "priority"}, &payload); err != nil {
			return nil, 0, err
		}
		if err := payload.validate(); err != nil {
			return nil, 0, err
		}
		projectID, err := api.ownedGlossaryProject(ctx, actor, payload.ProjectID)
		if err != nil {
			return nil, 0, err
		}
		var source string
		var sourceLocale *string
		err = api.pool.QueryRow(ctx, `select source, source_locale from projects where id=$1 and organization_id=$2`, projectID, actor.organizationID).Scan(&source, &sourceLocale)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, missingGlossaryProject()
		}
		if err != nil {
			return nil, 0, err
		}
		if sourceLocale == nil || *sourceLocale != g.SourceLocale {
			return nil, 0, glossaryFailure(400, "glossary_source_locale_mismatch", "The selected project uses a different source locale")
		}
		if g.ControlLevel == "team" && source != "native" {
			return nil, 0, glossaryFailure(400, "glossary_team_native_project_required", "Team glossaries must attach to Hyperlocalise-owned projects")
		}
		priority := 0
		if payload.Priority != nil {
			priority = *payload.Priority
		}
		_, err = api.pool.Exec(ctx, `insert into project_glossaries (organization_id, project_id, glossary_id, priority) values ($1,$2,$3,$4) on conflict (project_id, glossary_id) do update set priority=excluded.priority, updated_at=now()`, actor.organizationID, projectID, g.ID, priority)
		if err != nil {
			return nil, 0, err
		}
	} else if r.Method != http.MethodGet {
		return glossaryMethodNotAllowed()
	}
	projects, err := api.glossaryProjects(ctx, actor, g.ID)
	return map[string]any{"projects": projects}, 200, err
}
