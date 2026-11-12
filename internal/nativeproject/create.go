package nativeproject

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is the part of a pgx pool or transaction this package uses.
type DB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

const (
	defaultMemoryNameFallback = "Translation memory"
	maxDefaultMemoryNameRunes = 200

	SourceChangeStayApproved = "stay_approved"
	SourceChangeNeedsReview  = "needs_review"
)

var (
	// ErrTeamNotFound means the team is not in the workspace, or the actor is not a member.
	ErrTeamNotFound = errors.New("team not found")
	// ErrMemoryNotFound means a translation memory is not in the workspace.
	ErrMemoryNotFound = errors.New("translation memory not found")
	// ErrGlossaryNotFound means a glossary is not in the workspace.
	ErrGlossaryNotFound = errors.New("glossary not found")
	// ErrGlossarySourceLocale means a glossary's source locale differs from the project's.
	ErrGlossarySourceLocale = errors.New("glossary source locale differs from the project source locale")
)

// Actor is who creates the project.
type Actor struct {
	OrganizationID string
	UserID         string
	// CanReadAllTeams is true for workspace admins and localization managers, who may put a
	// project in any team and are not added to it.
	CanReadAllTeams bool
}

// Settings are the content editor settings a project starts with. The zero value is the
// project defaults.
type Settings struct {
	AutomaticallyGroupIdenticalStrings bool
	SourceTextEditable                 bool
	// ApprovedTranslationsOnSourceChange is SourceChangeStayApproved (or "") or
	// SourceChangeNeedsReview.
	ApprovedTranslationsOnSourceChange string
}

// Input is a validated native project. Locales must already be canonical, and the source locale
// must not be a target locale.
type Input struct {
	Name               string
	Description        string
	TranslationContext string
	SourceLocale       string
	TargetLocales      []string
	// TeamID nil puts the project in the actor's first team, creating a default team if the
	// workspace has none.
	TeamID   *string
	Settings Settings
	// MemoryIDs and GlossaryIDs attach in order: the first has the highest priority. With no
	// memories, the project gets its own new translation memory.
	MemoryIDs   []string
	GlossaryIDs []string
}

// Create inserts a native project and its attachments inside tx, and returns its ID. Callers
// check the workspace's project limit and record activity.
func Create(ctx context.Context, tx DB, actor Actor, in Input) (string, error) {
	teamID, err := ResolveTeam(ctx, tx, actor, in.TeamID)
	if err != nil {
		return "", err
	}
	targetLocalesJSON, err := json.Marshal(in.TargetLocales)
	if err != nil {
		return "", err
	}
	sourceChange := in.Settings.ApprovedTranslationsOnSourceChange
	if sourceChange == "" {
		sourceChange = SourceChangeStayApproved
	}

	projectID := "project_" + uuid.NewString()
	createdID, err := InsertWithAllocatedIdentifier(ctx, tx, actor.OrganizationID, in.Name,
		func(ctx context.Context, identifier string) (string, error) {
			var id string
			err := tx.QueryRow(ctx, `
				insert into projects (
					id, organization_id, team_id, created_by_user_id, name, identifier,
					description, translation_context, source, source_locale, target_locales,
					automatically_group_identical_strings, source_text_editable,
					approved_translations_on_source_change
				) values ($1,$2,$3,$4,$5,$6,$7,$8,'native',$9,$10::jsonb,$11,$12,$13)
				on conflict (organization_id, identifier) do nothing
				returning id`,
				projectID, actor.OrganizationID, teamID, actor.UserID, in.Name, identifier,
				in.Description, in.TranslationContext, in.SourceLocale, targetLocalesJSON,
				in.Settings.AutomaticallyGroupIdenticalStrings, in.Settings.SourceTextEditable, sourceChange,
			).Scan(&id)
			return id, err
		},
	)
	if err != nil {
		return "", err
	}

	if err := attachMemories(ctx, tx, actor.OrganizationID, createdID, in.MemoryIDs); err != nil {
		return "", err
	}
	if err := attachGlossaries(ctx, tx, actor.OrganizationID, createdID, in.SourceLocale, in.GlossaryIDs); err != nil {
		return "", err
	}
	if err := EnsureDefaultMemory(ctx, tx, actor.OrganizationID, createdID, in.Name, actor.UserID); err != nil {
		return "", err
	}

	if !actor.CanReadAllTeams {
		if _, err := tx.Exec(ctx, `
			insert into team_memberships(team_id,user_id,role) values($1,$2,'member')
			on conflict(team_id,user_id) do nothing`,
			teamID, actor.UserID); err != nil {
			return "", err
		}
	}
	if err := EnsureDefaultBranch(ctx, tx, actor.OrganizationID, createdID, actor.UserID); err != nil {
		return "", err
	}
	return createdID, nil
}

// EnsureDefaultBranch creates the `main` version branch when the native project has none.
func EnsureDefaultBranch(ctx context.Context, tx DB, organizationID, projectID, createdByUserID string) error {
	var createdBy any
	if createdByUserID != "" {
		createdBy = createdByUserID
	}
	_, err := tx.Exec(ctx, `
		insert into project_branches (organization_id, project_id, name, is_default, created_by_user_id)
		select $1, $2, $3, true, $4
		where not exists (
			select 1 from project_branches
			where project_id = $2 and name = $3 and status = 'active'
		)`,
		organizationID, projectID, DefaultBranchName, createdBy)
	return err
}

// ResolveTeam returns teamID when the actor may use it, or the actor's first team. A workspace
// with no team gets a default team.
func ResolveTeam(ctx context.Context, tx DB, actor Actor, teamID *string) (string, error) {
	if teamID != nil {
		if _, err := uuid.Parse(*teamID); err != nil {
			return "", ErrTeamNotFound
		}
		var found string
		var err error
		if actor.CanReadAllTeams {
			err = tx.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`,
				*teamID, actor.OrganizationID).Scan(&found)
		} else {
			err = tx.QueryRow(ctx, `
				select t.id from teams t join team_memberships m on m.team_id=t.id
				where t.id=$1 and t.organization_id=$2 and m.user_id=$3`,
				*teamID, actor.OrganizationID, actor.UserID).Scan(&found)
		}
		if isNoRows(err) {
			return "", ErrTeamNotFound
		}
		if err != nil {
			return "", err
		}
		return found, nil
	}

	var activeTeamID string
	var err error
	if actor.CanReadAllTeams {
		err = tx.QueryRow(ctx, `select id from teams where organization_id=$1 order by slug limit 1`,
			actor.OrganizationID).Scan(&activeTeamID)
	} else {
		err = tx.QueryRow(ctx, `
			select t.id from teams t join team_memberships m on m.team_id=t.id
			where t.organization_id=$1 and m.user_id=$2
			order by t.slug limit 1`,
			actor.OrganizationID, actor.UserID).Scan(&activeTeamID)
	}
	if err == nil {
		return activeTeamID, nil
	}
	if !isNoRows(err) {
		return "", err
	}

	var defaultTeamID string
	err = tx.QueryRow(ctx, `
		insert into teams(organization_id,slug,name) values($1,'default','Default team')
		on conflict(organization_id,slug) do update set slug=excluded.slug
		returning id`,
		actor.OrganizationID).Scan(&defaultTeamID)
	return defaultTeamID, err
}

func attachMemories(ctx context.Context, tx DB, organizationID, projectID string, memoryIDs []string) error {
	for priority, memoryID := range memoryIDs {
		var found string
		err := tx.QueryRow(ctx, `select id from memories where id::text=$1 and organization_id=$2`,
			memoryID, organizationID).Scan(&found)
		if isNoRows(err) {
			return fmt.Errorf("%w: %s", ErrMemoryNotFound, memoryID)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into project_memories (organization_id, project_id, memory_id, priority)
			values ($1,$2,$3,$4)
			on conflict (project_id, memory_id) do update set priority=excluded.priority, updated_at=now()`,
			organizationID, projectID, found, priority); err != nil {
			return err
		}
	}
	return nil
}

// CheckGlossary returns the glossary's ID, or an error when it cannot attach to a native project
// with this source locale, matching go-svc's glossary attach rules.
func CheckGlossary(ctx context.Context, db DB, organizationID, glossaryID, sourceLocale string) (string, error) {
	var found, glossaryLang string
	err := db.QueryRow(ctx, `
		select id, source_locale from glossaries where id::text=$1 and organization_id=$2`,
		glossaryID, organizationID).Scan(&found, &glossaryLang)
	if isNoRows(err) {
		return "", fmt.Errorf("%w: %s", ErrGlossaryNotFound, glossaryID)
	}
	if err != nil {
		return "", err
	}
	if glossaryLang != sourceLocale {
		return "", fmt.Errorf("%w: %s", ErrGlossarySourceLocale, glossaryID)
	}
	return found, nil
}

func attachGlossaries(ctx context.Context, tx DB, organizationID, projectID, sourceLocale string, glossaryIDs []string) error {
	for priority, glossaryID := range glossaryIDs {
		found, err := CheckGlossary(ctx, tx, organizationID, glossaryID, sourceLocale)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into project_glossaries (organization_id, project_id, glossary_id, priority)
			values ($1,$2,$3,$4)
			on conflict (project_id, glossary_id) do update set priority=excluded.priority, updated_at=now()`,
			organizationID, projectID, found, priority); err != nil {
			return err
		}
	}
	return nil
}

// DefaultMemoryName is the name of the translation memory a new project gets: the project name,
// cut to 200 characters.
func DefaultMemoryName(projectName string) string {
	name := strings.TrimSpace(projectName)
	if name == "" {
		return defaultMemoryNameFallback
	}
	if utf8.RuneCountInString(name) > maxDefaultMemoryNameRunes {
		return string([]rune(name)[:maxDefaultMemoryNameRunes])
	}
	return name
}

// EnsureDefaultMemory gives a project with no translation memory a new one of its own.
func EnsureDefaultMemory(ctx context.Context, tx DB, organizationID, projectID, projectName, createdByUserID string) error {
	var hasMemory bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from project_memories where project_id=$1)`, projectID).Scan(&hasMemory); err != nil {
		return err
	}
	if hasMemory {
		return nil
	}
	var memoryID string
	if err := tx.QueryRow(ctx, `
		insert into memories(organization_id,created_by_user_id,name,description,source)
		values($1,$2,$3,'','native') returning id`,
		organizationID, createdByUserID, DefaultMemoryName(projectName)).Scan(&memoryID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		insert into project_memories(organization_id,project_id,memory_id,priority) values($1,$2,$3,0)`,
		organizationID, projectID, memoryID)
	return err
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
