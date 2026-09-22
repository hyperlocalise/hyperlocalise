package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

type glossaryPayload struct {
	Name         *string  `json:"name"`
	Description  *string  `json:"description"`
	SourceLocale *string  `json:"sourceLocale"`
	ControlLevel *string  `json:"controlLevel"`
	TeamID       *string  `json:"teamId"`
	ProjectIDs   []string `json:"projectIds"`
	ProjectID    *string  `json:"projectId"`
}

func (p *glossaryPayload) validateCreate() error {
	if p.Name == nil {
		return invalidGlossary()
	}
	name := trimGlossaryInput(*p.Name)
	p.Name = &name
	if name == "" || utf16Length(name) > 200 {
		return invalidGlossary()
	}
	if p.Description != nil && utf16Length(*p.Description) > 10000 {
		return invalidGlossary()
	}
	if p.SourceLocale == nil {
		return invalidGlossary()
	}
	locale := strings.ReplaceAll(trimGlossaryInput(*p.SourceLocale), "_", "-")
	p.SourceLocale = &locale
	if locale == "" || utf16Length(locale) > 50 {
		return invalidGlossary()
	}
	if p.ControlLevel != nil && *p.ControlLevel != "org" && *p.ControlLevel != "team" {
		return invalidGlossary()
	}
	if p.TeamID != nil && !validGlossaryID(*p.TeamID) {
		return invalidGlossary()
	}
	if p.TeamID != nil && (p.ControlLevel == nil || *p.ControlLevel != "team") {
		return invalidGlossary()
	}
	return nil
}

func (p *glossaryPayload) validateUpdate() error {
	if p.Name == nil && p.Description == nil && p.SourceLocale == nil {
		return invalidGlossary()
	}
	if p.Name != nil {
		name := trimGlossaryInput(*p.Name)
		p.Name = &name
		if name == "" || utf16Length(name) > 200 {
			return invalidGlossary()
		}
	}
	if p.Description != nil && utf16Length(*p.Description) > 10000 {
		return invalidGlossary()
	}
	if p.SourceLocale != nil {
		locale := strings.ReplaceAll(trimGlossaryInput(*p.SourceLocale), "_", "-")
		p.SourceLocale = &locale
		if locale == "" || utf16Length(locale) > 50 {
			return invalidGlossary()
		}
	}
	return nil
}

func (p *glossaryPayload) projectIDs() []string {
	ids := []string{}
	seen := map[string]bool{}
	for _, id := range p.ProjectIDs {
		id = trimGlossaryInput(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if p.ProjectID != nil {
		id := trimGlossaryInput(*p.ProjectID)
		if id != "" && !seen[id] {
			ids = append(ids, id)
		}
	}
	return ids
}

func glossaryPage(r *http.Request, defaultLimit, maxLimit int) (int, int, error) {
	limit, offset := defaultLimit, 0
	for key, target := range map[string]*int{"limit": &limit, "offset": &offset} {
		if raw, ok := r.URL.Query()[key]; ok {
			n, err := strconv.ParseFloat(strings.TrimSpace(raw[0]), 64)
			if strings.TrimSpace(raw[0]) == "" {
				n, err = 0, nil
			}
			if err != nil || n < 0 || n > 9007199254740991 || n != float64(int(n)) {
				return 0, 0, invalidGlossary()
			}
			*target = int(n)
		}
	}
	if limit < 1 || limit > maxLimit {
		return 0, 0, invalidGlossary()
	}
	return limit, offset, nil
}

func (api *glossaryAPI) getGlossaryHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.getGlossary(r.Context(), actor, g)
}

func (api *glossaryAPI) patchGlossaryHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.patchGlossary(r, actor, g)
}

func (api *glossaryAPI) deleteGlossaryHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.deleteGlossary(r.Context(), actor, g)
}

func (api *glossaryAPI) listGlossaries(r *http.Request, actor glossaryActor) (any, int, error) {
	limit, offset, err := glossaryPage(r, 50, 100)
	if err != nil {
		limit, offset = 50, 0
	}
	where := glossaryAccessPredicate("g", 1, 2, 3)
	search := trimGlossaryInput(r.URL.Query().Get("search"))
	args := []any{actor.organizationID, actor.userID, actor.orgWideAccess()}
	if search != "" {
		where += ` and (g.name ilike $4 or coalesce(g.external_project_id,'') ilike $4 or coalesce(g.external_glossary_id,'') ilike $4)`
		args = append(args, "%"+search+"%")
	}
	source := trimGlossaryInput(r.URL.Query().Get("source"))
	if source == "native" || source == "external_tms" {
		args = append(args, source)
		where += ` and g.source=$` + strconv.Itoa(len(args))
	}
	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	args = append(args, limit, offset)
	rows, err := api.pool.Query(r.Context(), `select `+glossaryColumns+` from glossaries g where `+where+` order by g.created_at desc limit $`+strconv.Itoa(limitPos)+` offset $`+strconv.Itoa(offsetPos), args...)
	if err != nil {
		return nil, 0, err
	}
	records := []glossaryRecord{}
	for rows.Next() {
		g, scanErr := scanGlossary(rows)
		if scanErr != nil {
			rows.Close()
			return nil, 0, scanErr
		}
		records = append(records, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	countArgs := args[:len(args)-2]
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from glossaries g where `+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	ids := make([]string, len(records))
	nativeIDs := make([]string, 0, len(records))
	for i, g := range records {
		ids[i] = g.ID
		if g.Source == "native" {
			nativeIDs = append(nativeIDs, g.ID)
		}
	}
	projectCounts, err := api.glossaryProjectCounts(r.Context(), actor, ids)
	if err != nil {
		return nil, 0, err
	}
	termCounts, err := api.glossaryTermCounts(r.Context(), nativeIDs)
	if err != nil {
		return nil, 0, err
	}
	for i := range records {
		records[i].ProjectCount = projectCounts[records[i].ID]
		if records[i].Source == "native" {
			count := termCounts[records[i].ID]
			records[i].TermCount = &count
		}
	}
	return map[string]any{"glossaries": records, "total": total}, 200, nil
}

func (api *glossaryAPI) glossaryTermCount(ctx context.Context, glossaryID string) (int, error) {
	var count int
	err := api.pool.QueryRow(ctx, `select count(*) from glossary_terms where glossary_id=$1 and concept_id is not null and archived_at is null`, glossaryID).Scan(&count)
	return count, err
}

func (api *glossaryAPI) glossaryTermCounts(ctx context.Context, glossaryIDs []string) (map[string]int, error) {
	counts := map[string]int{}
	if len(glossaryIDs) == 0 {
		return counts, nil
	}
	rows, err := api.pool.Query(ctx, `select glossary_id, count(*) from glossary_terms where glossary_id=any($1::uuid[]) and concept_id is not null and archived_at is null group by glossary_id`, glossaryIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		counts[id] = count
	}
	return counts, rows.Err()
}

func (api *glossaryAPI) glossaryProjectCount(ctx context.Context, actor glossaryActor, glossaryID string) (int, error) {
	var count int
	err := api.pool.QueryRow(ctx, `select count(*) from project_glossaries a join projects p on p.id=a.project_id where a.glossary_id=$1 and a.organization_id=$2 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`, glossaryID, actor.organizationID, actor.orgWideAccess(), actor.userID).Scan(&count)
	return count, err
}

func (api *glossaryAPI) glossaryProjectCounts(ctx context.Context, actor glossaryActor, glossaryIDs []string) (map[string]int, error) {
	counts := map[string]int{}
	if len(glossaryIDs) == 0 {
		return counts, nil
	}
	rows, err := api.pool.Query(ctx, `select a.glossary_id, count(*) from project_glossaries a join projects p on p.id=a.project_id where a.glossary_id=any($1::uuid[]) and a.organization_id=$2 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default')))) group by a.glossary_id`, glossaryIDs, actor.organizationID, actor.orgWideAccess(), actor.userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		counts[id] = count
	}
	return counts, rows.Err()
}

func (api *glossaryAPI) createGlossary(r *http.Request, actor glossaryActor) (any, int, error) {
	var payload glossaryPayload
	if err := readGlossaryBody(r, []string{"name", "description", "sourceLocale", "controlLevel", "teamId", "projectIds", "projectId"}, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validateCreate(); err != nil {
		return nil, 0, err
	}
	controlLevel := "org"
	if payload.ControlLevel != nil {
		controlLevel = *payload.ControlLevel
	}
	if actor.canManageGlossaries() {
		if payload.ControlLevel == nil {
			controlLevel = "org"
		}
	} else if actor.role == "translator" {
		if payload.ControlLevel != nil && *payload.ControlLevel == "org" {
			return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
		}
		controlLevel = "team"
	} else {
		return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
	}
	projectIDs := payload.projectIDs()
	if controlLevel == "team" && len(projectIDs) == 0 {
		return nil, 0, glossaryFailure(403, "glossary_team_project_required", "Team glossaries must attach at least one accessible project")
	}
	description := ""
	if payload.Description != nil {
		description = *payload.Description
	}
	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	type lockedProject struct {
		id, source   string
		sourceLocale *string
		teamID       *string
	}
	// Reuse the transaction connection for access checks; pool reads here can
	// exhaust the pool while concurrent creates each hold a transaction.
	projects := []lockedProject{}
	for _, projectID := range projectIDs {
		owned, projectErr := ownedGlossaryProject(ctx, tx, actor, projectID)
		if projectErr != nil {
			return nil, 0, projectErr
		}
		var p lockedProject
		err := tx.QueryRow(ctx, `select id, source, source_locale, team_id from projects where id=$1 and organization_id=$2 for update`, owned, actor.organizationID).Scan(&p.id, &p.source, &p.sourceLocale, &p.teamID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, missingGlossaryProject()
		}
		if err != nil {
			return nil, 0, err
		}
		projects = append(projects, p)
	}
	if controlLevel == "team" {
		for _, p := range projects {
			if p.source != "native" {
				return nil, 0, glossaryFailure(400, "glossary_team_native_project_required", "Team glossaries must attach to Hyperlocalise-owned projects")
			}
		}
	}
	for _, p := range projects {
		if p.sourceLocale == nil || *p.sourceLocale != *payload.SourceLocale {
			return nil, 0, glossaryFailure(400, "glossary_source_locale_mismatch", "The selected project uses a different source locale")
		}
	}
	var teamID *string
	if controlLevel == "team" {
		if payload.TeamID != nil {
			teamID = payload.TeamID
		} else if len(projects) > 0 {
			teamID = projects[0].teamID
		}
		if teamID == nil {
			return nil, 0, glossaryFailure(404, "glossary_team_not_found", "Team not found")
		}
		var found string
		err := tx.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`, *teamID, actor.organizationID).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, glossaryFailure(404, "glossary_team_not_found", "Team not found")
		}
		if err != nil {
			return nil, 0, err
		}
		if !actor.canManageGlossaries() {
			ok, memberErr := isGlossaryTeamMember(ctx, tx, actor, *teamID)
			if memberErr != nil {
				return nil, 0, memberErr
			}
			if !ok {
				return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
			}
		}
	}
	g, err := scanGlossary(tx.QueryRow(ctx, `insert into glossaries as g (organization_id, created_by_user_id, name, description, source_locale, target_locale, control_level, team_id) values ($1,$2,$3,$4,$5,null,$6,$7) returning `+glossaryColumns, actor.organizationID, actor.userID, *payload.Name, description, *payload.SourceLocale, controlLevel, teamID))
	if err != nil {
		return nil, 0, err
	}
	for _, p := range projects {
		if _, err := tx.Exec(ctx, `insert into project_glossaries (organization_id, project_id, glossary_id, priority) values ($1,$2,$3,0)`, actor.organizationID, p.id, g.ID); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	g.ProjectCount = len(projects)
	zero := 0
	g.TermCount = &zero
	return map[string]any{"glossary": g}, 201, nil
}

func (api *glossaryAPI) getGlossary(ctx context.Context, actor glossaryActor, g glossaryRecord) (any, int, error) {
	count, err := api.glossaryProjectCount(ctx, actor, g.ID)
	if err != nil {
		return nil, 0, err
	}
	g.ProjectCount = count
	if g.Source == "native" {
		termCount, termErr := api.cachedGlossaryTermCount(ctx, actor, g.ID)
		if termErr != nil {
			return nil, 0, termErr
		}
		g.TermCount = &termCount
	}
	canContribute, err := api.canContributeGlossary(ctx, actor, g)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"glossary": g, "canContribute": canContribute}, 200, nil
}

func (api *glossaryAPI) patchGlossary(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if !actor.canManageGlossaries() {
		return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeGlossary(g); err != nil {
		return nil, 0, err
	}
	var payload glossaryPayload
	if err := readGlossaryBody(r, []string{"name", "description", "sourceLocale"}, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validateUpdate(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	if payload.SourceLocale != nil && *payload.SourceLocale != g.SourceLocale {
		var mismatch int
		err := api.pool.QueryRow(ctx, `select count(*) from project_glossaries a join projects p on p.id=a.project_id where a.glossary_id=$1 and a.organization_id=$2 and p.source_locale is distinct from $3`, g.ID, actor.organizationID, *payload.SourceLocale).Scan(&mismatch)
		if err != nil {
			return nil, 0, err
		}
		if mismatch > 0 {
			return nil, 0, glossaryFailure(400, "glossary_source_locale_attached_projects", "Cannot change the glossary source locale while attached projects use a different source locale")
		}
		var terms int
		err = api.pool.QueryRow(ctx, `select count(*) from glossary_terms where glossary_id=$1 and locale=$2 and concept_id is not null`, g.ID, g.SourceLocale).Scan(&terms)
		if err != nil {
			return nil, 0, err
		}
		if terms > 0 {
			return nil, 0, glossaryFailure(400, "glossary_source_locale_existing_terms", "Cannot change the glossary source locale while terms exist in the current source language")
		}
	}
	updated, err := scanGlossary(api.pool.QueryRow(ctx, `update glossaries as g set name=coalesce($3,name), description=coalesce($4,description), source_locale=coalesce($5,source_locale), updated_at=now() where id=$1 and organization_id=$2 returning `+glossaryColumns, g.ID, actor.organizationID, payload.Name, payload.Description, payload.SourceLocale))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	return api.getGlossary(ctx, actor, updated)
}

func (api *glossaryAPI) deleteGlossary(ctx context.Context, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if !actor.canManageGlossaries() {
		return nil, 0, glossaryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeGlossary(g); err != nil {
		return nil, 0, err
	}
	_, err := api.pool.Exec(ctx, `delete from glossaries where id=$1 and organization_id=$2 and source='native'`, g.ID, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	api.bumpGlossaryCache(ctx, actor, g.ID)
	return nil, 204, nil
}
