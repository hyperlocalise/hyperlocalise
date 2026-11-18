package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
)

// Access through a task, used for vendors and for task owners outside the project's team.
//
// A vendor (organizationRoleVendor) has no rights in the workspace. Every route refuses a
// vendor unless its handler resolves the actor with resolveOrganizationActorAllowingVendor,
// and each handler that does must limit a vendor to the post-edit and proofread tasks on a
// file that they own: the job list and the task's page for open and waiting tasks, the
// editor for open tasks only, in the task's file and languages.
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

// isProofread reports whether a proofread task covers the file and language.
func (s *editorTaskScope) isProofread(sourcePath, branch, locale string) bool {
	file := s.file(sourcePath, branch)
	return file != nil && file.proofreadByLocale[locale]
}

// loadEditorTaskScope reads the files and languages of the open tasks the person owns in the
// project. It returns nil when they own none.
func loadEditorTaskScope(ctx context.Context, db dictionaryDB, organizationID, userID, projectID string) (*editorTaskScope, error) {
	rows, err := db.Query(ctx, `
        select sf.source_path, sf.branch_name,
            coalesce(j.input_payload->'targetLocales', '[]'::jsonb),
            coalesce(j.input_payload->'metadata'->>'workflowTaskStep', '')
        from jobs j
        join repository_source_file_versions v on v.stored_file_id = j.input_payload->>'sourceFileId'
            and v.organization_id = j.organization_id and v.project_id = j.project_id
        join repository_source_files sf on sf.id = v.repository_source_file_id
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
	return editorCatFailure(403, "forbidden", "This is outside the task you were given")
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
