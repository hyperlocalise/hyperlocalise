package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/jackc/pgx/v5"
)

// Access through a task, used for vendors and for task owners outside the project's team.
//
// A vendor is a person in a vendor team (publicauth.VendorTeamMemberSQL). Whatever their role,
// they reach nothing in the workspace but their own tasks. Every route refuses a vendor unless
// its handler resolves the actor with resolveOrganizationActorAllowingVendorIf, and each handler
// that does must limit a vendor to the post-edit and proofread tasks on a file that they own:
// the job list and the task's page for open and waiting tasks, the editor for open tasks only,
// in the task's file and languages. Within those, their role decides what they may do.
//
// The same rule lets the owner of such a task reach it when they are not on the project's
// team, whatever their role.
//
// The web app keeps the same rule in src/api/auth/vendor-access.ts and
// src/lib/projects/jobs/task-access.ts. Keep them in step.

// ownedFileTaskSQL matches a post-edit or proofread task on one file that the person owns and
// that is open or, with includeWaiting, still waiting for an earlier job. Both steps are stored
// as proofread jobs. The jobs row is aliased j; the arguments are the positions of the
// organization id and the person's user id.
func ownedFileTaskSQL(organizationArg, userArg int, includeWaiting bool) string {
	status := "j.status = 'waiting_for_review'"
	if includeWaiting {
		status = "(j.status = 'waiting_for_review' or (j.status = 'queued' and j.after_job_id is not null))"
	}
	return fmt.Sprintf(`(j.organization_id = $%d and j.owner_user_id = $%d
            and j.kind = 'proofread'
            and (j.assignee_type is null or j.assignee_type <> 'agent')
            and coalesce(j.input_payload->>'sourceFileId', '') <> ''
            and not exists (select 1 from external_job_details vx where vx.job_id = j.id)
            and %s)`, organizationArg, userArg, status)
}

// taskFileJoinSQL joins a job (aliased j) to the one file it is on: the file, on its branch, of
// the upload the job was made for. A stored file can have uploads on several branches (creating
// or merging a branch copies them), so the stored file id alone does not name a branch.
const taskFileJoinSQL = `join translation_job_details tjd on tjd.job_id = j.id
        join repository_source_file_versions tv on tv.id = tjd.source_file_version_id
            and tv.organization_id = j.organization_id and tv.project_id = j.project_id
        join repository_source_files sf on sf.id = tv.repository_source_file_id`

// editorTaskFile is one file a person reaches through open tasks they own, with the languages
// those tasks cover. A language maps to true when one of the tasks is a proofread task.
type editorTaskFile struct {
	sourcePath, branch string
	proofreadByLocale  map[string]bool
}

// editorTaskScope limits a person who reaches a project through their own open tasks, and not
// through the team rule, to those tasks' files and languages.
type editorTaskScope struct {
	files []editorTaskFile
}

func (s *editorTaskScope) file(sourcePath, branch string) *editorTaskFile {
	for i := range s.files {
		if s.files[i].sourcePath == sourcePath && s.files[i].branch == branch {
			return &s.files[i]
		}
	}
	return nil
}

func (s *editorTaskScope) allowsFile(sourcePath, branch string) bool {
	return s.file(sourcePath, branch) != nil
}

func (s *editorTaskScope) allows(sourcePath, branch, locale string) bool {
	file := s.file(sourcePath, branch)
	if file == nil {
		return false
	}
	_, ok := file.proofreadByLocale[locale]
	return ok
}

// loadEditorTaskScope reads the files and languages of the open tasks the person owns in the
// project. It returns nil when they own none.
func loadEditorTaskScope(ctx context.Context, db dictionaryDB, organizationID, userID, projectID string) (*editorTaskScope, error) {
	rows, err := db.Query(ctx, `
        select sf.source_path, sf.branch_name,
            coalesce(j.input_payload->'targetLocales', '[]'::jsonb),
            coalesce(j.input_payload->'metadata'->>'workflowTaskStep', '')
        from jobs j
        `+taskFileJoinSQL+`
        where j.project_id = $3 and `+ownedFileTaskSQL(1, 2, false),
		organizationID, userID, projectID)
	if err != nil {
		return nil, fmt.Errorf("load task scope: %w", err)
	}
	defer rows.Close()
	scope := &editorTaskScope{}
	for rows.Next() {
		var sourcePath, branch, step string
		var rawLocales []byte
		if err := rows.Scan(&sourcePath, &branch, &rawLocales, &step); err != nil {
			return nil, fmt.Errorf("scan task scope: %w", err)
		}
		var locales []string
		if err := json.Unmarshal(rawLocales, &locales); err != nil {
			// A task whose saved languages cannot be read opens nothing.
			continue
		}
		file := scope.file(sourcePath, branch)
		if file == nil {
			scope.files = append(scope.files, editorTaskFile{sourcePath: sourcePath, branch: branch, proofreadByLocale: map[string]bool{}})
			file = &scope.files[len(scope.files)-1]
		}
		for _, locale := range locales {
			locale = strings.TrimSpace(locale)
			if locale == "" {
				continue
			}
			// "edit" is a post-edit task; anything else on a proofread job is a proofread task.
			file.proofreadByLocale[locale] = file.proofreadByLocale[locale] || step != "edit"
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate task scope: %w", err)
	}
	if len(scope.files) == 0 {
		return nil, nil
	}
	return scope, nil
}

// editorScopeRule says where a route opened to task-scoped people names its file and
// language, so the request can be held to the task before the handler runs. A route without a
// rule is closed to them.
type editorScopeRule int

const (
	editorScopeClosed editorScopeRule = iota
	// The file is the sourcePath query parameter and the language is targetLocale.
	editorScopeQuery
	// The file is sourcePath and the language is targetLocale in the JSON body.
	editorScopeBody
	// The file is sourcePath in the JSON body; the route reads nothing that depends on a language.
	editorScopeBodyFile
	// The body is a list of segments, each with a sourcePath, and a list of targetLocales.
	editorScopeTargets
)

func editorScopeDenied() error {
	// Also what a person with another open task in the project gets once this one has ended.
	return editorCatFailure(403, "forbidden", "This is not part of an open task of yours")
}

// checkEditorTaskScope holds a task-scoped request to the task's file and languages. It also
// refuses every way a request can widen itself to other files: several paths, all files, and
// groups of identical strings, which span files.
func checkEditorTaskScope(r *http.Request, rule editorScopeRule, rawBody []byte, scope *editorTaskScope) error {
	query := r.URL.Query()
	branch := nativeproject.ResolveBranchName(query.Get("branch"))
	for _, key := range []string{"sourcePaths", "groupSourcePath", "groupSourcePaths", "groupId"} {
		if trimEditorCat(query.Get(key)) != "" {
			return editorScopeDenied()
		}
	}
	if trimEditorCat(query.Get("grouped")) == "true" {
		return editorScopeDenied()
	}
	switch rule {
	case editorScopeQuery:
		if !scope.allows(trimEditorCat(query.Get("sourcePath")), branch, trimEditorCat(query.Get("targetLocale"))) {
			return editorScopeDenied()
		}
		return nil
	case editorScopeBody, editorScopeBodyFile:
		var body struct {
			SourcePath   string          `json:"sourcePath"`
			TargetLocale string          `json:"targetLocale"`
			SourcePaths  json.RawMessage `json:"sourcePaths"`
			Group        json.RawMessage `json:"group"`
		}
		if err := json.Unmarshal(rawBody, &body); err != nil {
			return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
		}
		if isJSONValueSet(body.SourcePaths) || isJSONValueSet(body.Group) {
			return editorScopeDenied()
		}
		sourcePath := trimEditorCat(body.SourcePath)
		if rule == editorScopeBodyFile {
			if !scope.allowsFile(sourcePath, branch) {
				return editorScopeDenied()
			}
			return nil
		}
		if !scope.allows(sourcePath, branch, trimEditorCat(body.TargetLocale)) {
			return editorScopeDenied()
		}
		return nil
	case editorScopeTargets:
		var body struct {
			Segments []struct {
				SourcePath string `json:"sourcePath"`
			} `json:"segments"`
			TargetLocales []string `json:"targetLocales"`
		}
		if err := json.Unmarshal(rawBody, &body); err != nil {
			return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
		}
		if len(body.Segments) == 0 || len(body.TargetLocales) == 0 {
			return editorScopeDenied()
		}
		for _, segment := range body.Segments {
			for _, locale := range body.TargetLocales {
				if !scope.allows(trimEditorCat(segment.SourcePath), branch, trimEditorCat(locale)) {
					return editorScopeDenied()
				}
			}
		}
		return nil
	default:
		return editorScopeDenied()
	}
}

func isJSONValueSet(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed != "" && trimmed != "null"
}

// jobTaskFile is the file a task is on, as the editor names it.
type jobTaskFile struct {
	SourcePath string `json:"sourcePath"`
	Branch     string `json:"branch"`
}

// loadJobTaskFile reads the file a job is on, or nil for a job with none.
func loadJobTaskFile(ctx context.Context, db dictionaryDB, organizationID, jobID string) (*jobTaskFile, error) {
	var file jobTaskFile
	err := db.QueryRow(ctx, `
        select sf.source_path, sf.branch_name
        from jobs j
        `+taskFileJoinSQL+`
        where j.id = $1 and j.organization_id = $2`, jobID, organizationID).Scan(&file.SourcePath, &file.Branch)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load task file: %w", err)
	}
	return &file, nil
}

// taskOwnerMetadataKeys are the parts of a job's saved metadata the task's page shows.
var taskOwnerMetadataKeys = []string{"title", "description", "workflowTaskStep", "sourcePath", "sourceFilename"}

// redactJobForVendor leaves a vendor only what the job list and the task's page show: who made
// the job, how it ran and whatever its creator stored with it are not theirs to read.
func redactJobForVendor(job *jobWithProjectRecord) {
	job.CreatedByUserID = nil
	job.OutcomeKind = nil
	job.OutcomePayload = nil
	job.LastError = nil
	job.WorkflowRunID = nil
	job.InteractionID = nil
	job.ContextSnapshot = nil
	job.ReviewCriteria = nil
	job.ReviewConfig = nil
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(job.InputPayload, &payload); err != nil {
		job.InputPayload = json.RawMessage(`{}`)
		return
	}
	kept := map[string]json.RawMessage{}
	for _, key := range []string{"sourceFileId", "fileFormat", "sourceLocale", "targetLocales"} {
		if value, ok := payload[key]; ok {
			kept[key] = value
		}
	}
	var metadata map[string]json.RawMessage
	if err := json.Unmarshal(payload["metadata"], &metadata); err == nil {
		keptMetadata := map[string]json.RawMessage{}
		for _, key := range taskOwnerMetadataKeys {
			if value, ok := metadata[key]; ok {
				keptMetadata[key] = value
			}
		}
		if raw, err := json.Marshal(keptMetadata); err == nil {
			kept["metadata"] = raw
		}
	}
	raw, err := json.Marshal(kept)
	if err != nil {
		raw = []byte(`{}`)
	}
	job.InputPayload = raw
}

// errVendorInOtherTeam refuses adding a vendor to another team: a vendor is in their vendor team
// only. Teams decide who is told about a project and who appears in its pickers, so a second
// team would reach them past the gate.
var errVendorInOtherTeam = errors.New("vendor_in_other_team")

// errLastAdminToVendorTeam refuses adding the last admin outside vendor teams to one: the
// workspace would have no admin left who can reach it.
var errLastAdminToVendorTeam = errors.New("last_admin_protected")

// applyVendorTeamJoinRules runs before a person joins a team. A vendor joins no other team, and a
// person who joins a vendor team leaves every other team of the workspace. The workspace keeps an
// admin outside vendor teams, counted as countOtherAcceptedAdmins does. Run it in the same
// transaction as the join, so the admin lock it takes holds until the join commits.
func applyVendorTeamJoinRules(ctx context.Context, db dictionaryDB, organizationID, teamID, userID string, workosSynced bool) error {
	var vendorTeam, vendorElsewhere bool
	var role string
	err := db.QueryRow(ctx, `
        select t.is_vendor, m.role::text,
            exists (select 1 from team_memberships vtm join teams vt on vt.id = vtm.team_id
                where vtm.user_id = m.user_id and vt.organization_id = t.organization_id
                  and vt.is_vendor and vt.id <> t.id)
        from teams t
        join organization_memberships m on m.organization_id = t.organization_id and m.user_id = $3
        where t.id = $1 and t.organization_id = $2`,
		teamID, organizationID, userID).Scan(&vendorTeam, &role, &vendorElsewhere)
	if errors.Is(err, pgx.ErrNoRows) {
		// The caller has already found both; nothing to hold here.
		return nil
	}
	if err != nil {
		return fmt.Errorf("read team join rules: %w", err)
	}
	if vendorElsewhere {
		return errVendorInOtherTeam
	}
	if !vendorTeam {
		return nil
	}
	if role == "admin" {
		if _, err := db.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, organizationAdminsLockKey(organizationID)); err != nil {
			return err
		}
		others, err := countOtherAcceptedAdmins(ctx, db, organizationID, userID, workosSynced)
		if err != nil {
			return err
		}
		if others < 1 {
			return errLastAdminToVendorTeam
		}
	}
	if _, err := db.Exec(ctx, `
        delete from team_memberships tm using teams t
        where t.id = tm.team_id and t.organization_id = $1 and tm.user_id = $2 and tm.team_id <> $3`,
		organizationID, userID, teamID); err != nil {
		return fmt.Errorf("leave other teams: %w", err)
	}
	return nil
}
