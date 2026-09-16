package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	teamSlugPattern     = regexp.MustCompile(`^[a-z0-9-]+$`)
	teamRolePattern     = map[string]struct{}{"manager": {}, "member": {}}
	teamUniqueViolation = "23505"
)

type teamRecord struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type teamSummary struct {
	ID              string  `json:"id"`
	Slug            string  `json:"slug"`
	Name            string  `json:"name"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	MemberCount     int     `json:"memberCount"`
	CurrentUserRole *string `json:"currentUserRole"`
}

type teamMember struct {
	WorkosUserID string `json:"workosUserId"`
	Email        string `json:"email"`
	Role         string `json:"role"`
}

func validTeamID(id string) bool {
	return uuid.Validate(id) == nil
}

var teamSlugifyPattern = regexp.MustCompile(`[^a-z0-9]+`)

func slugifyTeamName(name string) string {
	slug := teamSlugifyPattern.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	slug = strings.Trim(slug, "-")
	if len(slug) > 120 {
		slug = slug[:120]
	}
	return slug
}

func isTeamUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == teamUniqueViolation
}

func (api *teamAPI) visibleTeamIDs(ctx context.Context, actor teamActor) ([]string, error) {
	if actor.canManageTeams() {
		rows, err := api.pool.Query(ctx, `select id from teams where organization_id=$1`, actor.organizationID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
		return ids, rows.Err()
	}
	rows, err := api.pool.Query(ctx, `select t.id from team_memberships m join teams t on t.id=m.team_id where m.user_id=$1 and t.organization_id=$2`, actor.userID, actor.organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (api *teamAPI) accessibleTeam(ctx context.Context, actor teamActor, teamID string) (teamRecord, error) {
	var record teamRecord
	var created, updated time.Time
	err := api.pool.QueryRow(ctx, `select id, organization_id, slug, name, created_at, updated_at from teams where id=$1 and organization_id=$2`,
		teamID, actor.organizationID).Scan(&record.ID, &record.OrganizationID, &record.Slug, &record.Name, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return record, teamFailure(404, "team_not_found")
	}
	if err != nil {
		return record, err
	}
	record.CreatedAt = formatTeamTime(created)
	record.UpdatedAt = formatTeamTime(updated)
	if actor.canManageTeams() {
		return record, nil
	}
	var membershipID string
	err = api.pool.QueryRow(ctx, `select id from team_memberships where team_id=$1 and user_id=$2`, teamID, actor.userID).Scan(&membershipID)
	if errors.Is(err, pgx.ErrNoRows) {
		return record, teamFailure(404, "team_not_found")
	}
	if err != nil {
		return record, err
	}
	return record, nil
}

func (api *teamAPI) canManageTeamMembership(ctx context.Context, actor teamActor, teamID string) (bool, error) {
	if actor.canManageTeams() {
		return true, nil
	}
	var role string
	err := api.pool.QueryRow(ctx, `select role from team_memberships where team_id=$1 and user_id=$2`, teamID, actor.userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return role == "manager", nil
}

func (api *teamAPI) listTeams(ctx context.Context, actor teamActor) (any, int, error) {
	ids, err := api.visibleTeamIDs(ctx, actor)
	if err != nil {
		return nil, 0, err
	}
	if len(ids) == 0 {
		return map[string]any{"teams": []teamSummary{}}, 200, nil
	}
	rows, err := api.pool.Query(ctx, `
        select t.id, t.slug, t.name, t.created_at, t.updated_at,
               count(tm.id) as member_count, cum.role
        from teams t
        left join team_memberships tm on tm.team_id=t.id
        left join team_memberships cum on cum.team_id=t.id and cum.user_id=$1
        where t.organization_id=$2 and t.id = any($3)
        group by t.id, t.slug, t.name, t.created_at, t.updated_at, cum.role
        order by t.created_at desc`, actor.userID, actor.organizationID, ids)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	teams := make([]teamSummary, 0, len(ids))
	for rows.Next() {
		var summary teamSummary
		var created, updated time.Time
		var currentRole *string
		if err := rows.Scan(&summary.ID, &summary.Slug, &summary.Name, &created, &updated, &summary.MemberCount, &currentRole); err != nil {
			return nil, 0, err
		}
		summary.CreatedAt = formatTeamTime(created)
		summary.UpdatedAt = formatTeamTime(updated)
		summary.CurrentUserRole = currentRole
		teams = append(teams, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"teams": teams}, 200, nil
}

func (api *teamAPI) listMemberDirectory(ctx context.Context, actor teamActor) (any, int, error) {
	rows, err := api.pool.Query(ctx, `
        select u.workos_user_id, u.email
        from users u
        inner join organization_memberships m on m.user_id=u.id
        where m.organization_id=$1
        order by u.email`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	members := make([]teamMember, 0)
	for rows.Next() {
		var member teamMember
		if err := rows.Scan(&member.WorkosUserID, &member.Email); err != nil {
			return nil, 0, err
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"members": members}, 200, nil
}

type createTeamBody struct {
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

func parseCreateTeamBody(r *http.Request) (createTeamBody, error) {
	var body createTeamBody
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil {
		return body, teamFailure(400, "invalid_team_payload")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return body, teamFailure(400, "invalid_team_payload")
	}
	return body, nil
}

func validateTeamName(name string) (string, bool) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || len(trimmed) > 120 {
		return "", false
	}
	return trimmed, true
}

func validateTeamSlug(slug string) (string, bool) {
	trimmed := strings.TrimSpace(slug)
	if trimmed == "" || len(trimmed) > 120 || !teamSlugPattern.MatchString(trimmed) {
		return "", false
	}
	return trimmed, true
}

func (api *teamAPI) createTeam(ctx context.Context, actor teamActor, r *http.Request) (any, int, error) {
	if !actor.canManageTeams() {
		return nil, 0, teamFailure(403, "forbidden")
	}
	body, err := parseCreateTeamBody(r)
	if err != nil {
		return nil, 0, err
	}
	if body.Name == nil {
		return nil, 0, teamFailure(400, "invalid_team_payload")
	}
	name, ok := validateTeamName(*body.Name)
	if !ok {
		return nil, 0, teamFailure(400, "invalid_team_payload")
	}
	slug := slugifyTeamName(name)
	if body.Slug != nil {
		slug, ok = validateTeamSlug(*body.Slug)
		if !ok {
			return nil, 0, teamFailure(400, "invalid_team_payload")
		}
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var record teamRecord
	var created, updated time.Time
	err = tx.QueryRow(ctx, `insert into teams (organization_id, name, slug) values ($1,$2,$3)
        returning id, organization_id, slug, name, created_at, updated_at`,
		actor.organizationID, name, slug).Scan(&record.ID, &record.OrganizationID, &record.Slug, &record.Name, &created, &updated)
	if err != nil {
		if isTeamUniqueViolation(err) {
			return nil, 0, teamFailure(409, "team_slug_already_exists")
		}
		return nil, 0, err
	}
	_, err = tx.Exec(ctx, `insert into team_memberships (team_id, user_id, role) values ($1,$2,'manager')`, record.ID, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		if isTeamUniqueViolation(err) {
			return nil, 0, teamFailure(409, "team_slug_already_exists")
		}
		return nil, 0, err
	}
	record.CreatedAt = formatTeamTime(created)
	record.UpdatedAt = formatTeamTime(updated)
	return map[string]any{"team": record}, 201, nil
}

func (api *teamAPI) getTeam(ctx context.Context, actor teamActor, teamID string) (any, int, error) {
	record, err := api.accessibleTeam(ctx, actor, teamID)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(ctx, `
        select u.workos_user_id, u.email, m.role
        from team_memberships m
        inner join users u on u.id=m.user_id
        where m.team_id=$1`, teamID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	members := make([]teamMember, 0)
	for rows.Next() {
		var member teamMember
		if err := rows.Scan(&member.WorkosUserID, &member.Email, &member.Role); err != nil {
			return nil, 0, err
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"team": map[string]any{
		"id":             record.ID,
		"organizationId": record.OrganizationID,
		"slug":           record.Slug,
		"name":           record.Name,
		"createdAt":      record.CreatedAt,
		"updatedAt":      record.UpdatedAt,
		"members":        members,
	}}, 200, nil
}

type updateTeamBody struct {
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

func parseUpdateTeamBody(r *http.Request) (updateTeamBody, error) {
	var body updateTeamBody
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil {
		return body, teamFailure(400, "invalid_team_payload")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return body, teamFailure(400, "invalid_team_payload")
	}
	if body.Name == nil && body.Slug == nil {
		return body, teamFailure(400, "invalid_team_payload")
	}
	return body, nil
}

func (api *teamAPI) updateTeam(ctx context.Context, actor teamActor, teamID string, r *http.Request) (any, int, error) {
	if !actor.canManageTeams() {
		return nil, 0, teamFailure(403, "forbidden")
	}
	body, err := parseUpdateTeamBody(r)
	if err != nil {
		return nil, 0, err
	}
	_, err = api.accessibleTeam(ctx, actor, teamID)
	if err != nil {
		return nil, 0, err
	}
	name := ""
	slug := ""
	setName := false
	setSlug := false
	if body.Name != nil {
		validated, ok := validateTeamName(*body.Name)
		if !ok {
			return nil, 0, teamFailure(400, "invalid_team_payload")
		}
		name = validated
		setName = true
	}
	if body.Slug != nil {
		validated, ok := validateTeamSlug(*body.Slug)
		if !ok {
			return nil, 0, teamFailure(400, "invalid_team_payload")
		}
		slug = validated
		setSlug = true
	}
	var record teamRecord
	var created, updated time.Time
	err = api.pool.QueryRow(ctx, `
        update teams set
            name = case when $3 then $4 else name end,
            slug = case when $5 then $6 else slug end,
            updated_at = now()
        where id=$1 and organization_id=$2
        returning id, organization_id, slug, name, created_at, updated_at`,
		teamID, actor.organizationID, setName, name, setSlug, slug).
		Scan(&record.ID, &record.OrganizationID, &record.Slug, &record.Name, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, teamFailure(404, "team_not_found")
	}
	if err != nil {
		if isTeamUniqueViolation(err) {
			return nil, 0, teamFailure(409, "team_slug_already_exists")
		}
		return nil, 0, err
	}
	record.CreatedAt = formatTeamTime(created)
	record.UpdatedAt = formatTeamTime(updated)
	return map[string]any{"team": record}, 200, nil
}

func (api *teamAPI) deleteTeam(ctx context.Context, actor teamActor, teamID string) (int, error) {
	if !actor.canManageTeams() {
		return 0, teamFailure(403, "forbidden")
	}
	_, err := api.accessibleTeam(ctx, actor, teamID)
	if err != nil {
		return 0, err
	}
	var projectID string
	err = api.pool.QueryRow(ctx, `select id from projects where team_id=$1 limit 1`, teamID).Scan(&projectID)
	if err == nil {
		return 0, teamFailure(409, "team_has_projects")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	var glossaryID string
	err = api.pool.QueryRow(ctx, `select id from glossaries where team_id=$1 limit 1`, teamID).Scan(&glossaryID)
	if err == nil {
		return 0, teamFailure(409, "team_has_glossaries")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	tag, err := api.pool.Exec(ctx, `delete from teams where id=$1 and organization_id=$2`, teamID, actor.organizationID)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return 0, teamFailure(404, "team_not_found")
	}
	return 204, nil
}

type addTeamMemberBody struct {
	WorkosUserID *string `json:"workosUserId"`
	Email        *string `json:"email"`
	Role         *string `json:"role"`
}

func parseAddTeamMemberBody(r *http.Request) (addTeamMemberBody, error) {
	var body addTeamMemberBody
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil {
		return body, teamFailure(400, "invalid_team_payload")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return body, teamFailure(400, "invalid_team_payload")
	}
	hasWorkos := body.WorkosUserID != nil && strings.TrimSpace(*body.WorkosUserID) != ""
	hasEmail := body.Email != nil && strings.TrimSpace(*body.Email) != ""
	if !hasWorkos && !hasEmail {
		return body, teamFailure(400, "invalid_team_payload")
	}
	if body.Role != nil {
		role := strings.TrimSpace(*body.Role)
		if _, ok := teamRolePattern[role]; !ok {
			return body, teamFailure(400, "invalid_team_payload")
		}
		body.Role = &role
	}
	if hasWorkos {
		trimmed := strings.TrimSpace(*body.WorkosUserID)
		if len(trimmed) > 256 {
			return body, teamFailure(400, "invalid_team_payload")
		}
		body.WorkosUserID = &trimmed
	}
	if hasEmail {
		trimmed := strings.TrimSpace(*body.Email)
		if trimmed == "" || len(trimmed) > 320 || !strings.Contains(trimmed, "@") {
			return body, teamFailure(400, "invalid_team_payload")
		}
		for _, r := range trimmed {
			if r > unicode.MaxASCII {
				return body, teamFailure(400, "invalid_team_payload")
			}
		}
		body.Email = &trimmed
	}
	return body, nil
}

func (api *teamAPI) addTeamMember(ctx context.Context, actor teamActor, teamID string, r *http.Request) (any, int, error) {
	_, err := api.accessibleTeam(ctx, actor, teamID)
	if err != nil {
		return nil, 0, err
	}
	canManage, err := api.canManageTeamMembership(ctx, actor, teamID)
	if err != nil {
		return nil, 0, err
	}
	if !canManage {
		return nil, 0, teamFailure(403, "forbidden")
	}
	body, err := parseAddTeamMemberBody(r)
	if err != nil {
		return nil, 0, err
	}
	var userID, workosUserID, email string
	if body.WorkosUserID != nil {
		err = api.pool.QueryRow(ctx, `
            select u.id, u.workos_user_id, u.email
            from users u
            inner join organization_memberships m on m.user_id=u.id
            where u.workos_user_id=$1 and m.organization_id=$2`, *body.WorkosUserID, actor.organizationID).
			Scan(&userID, &workosUserID, &email)
	} else {
		err = api.pool.QueryRow(ctx, `
            select u.id, u.workos_user_id, u.email
            from users u
            inner join organization_memberships m on m.user_id=u.id
            where u.email=$1 and m.organization_id=$2`, *body.Email, actor.organizationID).
			Scan(&userID, &workosUserID, &email)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, teamFailure(404, "organization_member_not_found")
	}
	if err != nil {
		return nil, 0, err
	}
	var role string
	if body.Role == nil {
		err = api.pool.QueryRow(ctx, `
            insert into team_memberships (team_id, user_id, role) values ($1,$2,'member')
            on conflict (team_id, user_id) do nothing
            returning role`, teamID, userID).Scan(&role)
		if errors.Is(err, pgx.ErrNoRows) {
			err = api.pool.QueryRow(ctx, `select role from team_memberships where team_id=$1 and user_id=$2`, teamID, userID).Scan(&role)
		}
	} else {
		err = api.pool.QueryRow(ctx, `
            insert into team_memberships (team_id, user_id, role) values ($1,$2,$3)
            on conflict (team_id, user_id) do update set role=excluded.role
            returning role`, teamID, userID, *body.Role).Scan(&role)
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"member": teamMember{WorkosUserID: workosUserID, Email: email, Role: role}}, 201, nil
}

func (api *teamAPI) removeTeamMember(ctx context.Context, actor teamActor, teamID string, workosUserID string) (int, error) {
	_, err := api.accessibleTeam(ctx, actor, teamID)
	if err != nil {
		return 0, err
	}
	canManage, err := api.canManageTeamMembership(ctx, actor, teamID)
	if err != nil {
		return 0, err
	}
	if !canManage {
		return 0, teamFailure(403, "forbidden")
	}
	var userID string
	err = api.pool.QueryRow(ctx, `
        select u.id
        from users u
        inner join organization_memberships m on m.user_id=u.id
        where u.workos_user_id=$1 and m.organization_id=$2`, workosUserID, actor.organizationID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 204, nil
	}
	if err != nil {
		return 0, err
	}
	_, err = api.pool.Exec(ctx, `delete from team_memberships where team_id=$1 and user_id=$2`, teamID, userID)
	if err != nil {
		return 0, err
	}
	return 204, nil
}
