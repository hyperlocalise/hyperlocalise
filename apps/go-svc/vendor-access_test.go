package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

// vendorLookup answers the WorkOS membership lookup for a seeded scope with the given role.
func vendorLookup(scope *testenv.Scope, role string) organizationMembershipLookup {
	return func(context.Context, string) (*workos.UserOrganizationMembership, error) {
		return &workos.UserOrganizationMembership{
			ID:             scope.WorkOSMembershipID,
			UserID:         scope.WorkOSUserID,
			OrganizationID: scope.WorkOSOrganizationID,
			Status:         "active",
			Role:           &workos.SlimRole{Slug: role},
		}, nil
	}
}

func TestResolveOrganizationActorVendor(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: organizationRoleVendor})
	claims := AuthClaims{UserID: scope.WorkOSUserID}
	lookup := vendorLookup(scope, organizationRoleVendor)

	t.Run("refused by default", func(t *testing.T) {
		_, err := resolveOrganizationActor(t.Context(), scope.Pool, lookup, claims, scope.Slug)
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("refused by id", func(t *testing.T) {
		_, err := resolveOrganizationActorByID(t.Context(), scope.Pool, lookup, scope.UserID, scope.OrganizationID)
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("accepted where the handler allows vendors", func(t *testing.T) {
		actor, err := resolveOrganizationActorAllowingVendor(t.Context(), scope.Pool, lookup, claims, scope.Slug)
		require.NoError(t, err)
		require.Equal(t, organizationActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: organizationRoleVendor}, actor)
	})

	t.Run("allowing vendors still refuses an unknown role", func(t *testing.T) {
		_, err := resolveOrganizationActorAllowingVendor(t.Context(), scope.Pool, vendorLookup(scope, "owner"), claims, scope.Slug)
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("allowing vendors still accepts the other roles", func(t *testing.T) {
		actor, err := resolveOrganizationActorAllowingVendor(t.Context(), scope.Pool, vendorLookup(scope, "translator"), claims, scope.Slug)
		require.NoError(t, err)
		require.Equal(t, "translator", actor.role)
	})
}

func TestVendorRoleHasNoCapabilityAndIsAssignable(t *testing.T) {
	for capability := range organizationCapabilityByRole["admin"] {
		require.False(t, hasOrganizationCapability(organizationRoleVendor, capability), capability)
	}
	require.False(t, isKnownOrganizationRole(organizationRoleVendor), "every route must refuse a vendor by default")
	require.True(t, isKnownMemberRole(organizationRoleVendor), "a member can be given the Vendor role")
	require.Contains(t, assignableRolesForActor("admin"), organizationRoleVendor)
	require.Contains(t, assignableRolesForActor("localization_manager"), organizationRoleVendor)
	for _, role := range []string{"developer", "reviewer", "translator", "member", organizationRoleVendor} {
		require.Empty(t, assignableRolesForActor(role), role)
	}
}

// taskFixture is a project with two files, and one person who is in no team.
type taskFixture struct {
	scope           *testenv.Scope
	editor          *editorCatAPI
	jobs            *projectAPI
	path, otherPath string
	storedFileID    string
	keyID, otherKey string
	otherStoredFile string
}

func newTaskFixture(t *testing.T, role string) taskFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	f := taskFixture{
		scope:     scope,
		editor:    &editorCatAPI{pool: scope.Pool, membership: scope.Membership(role)},
		jobs:      &projectAPI{pool: scope.Pool, membership: scope.Membership(role)},
		path:      "locales/app.json",
		otherPath: "locales/other.json",
	}
	f.storedFileID, f.keyID = f.mustFile(t, f.path, "greeting", "Hello")
	f.otherStoredFile, f.otherKey = f.mustFile(t, f.otherPath, "farewell", "Goodbye")
	return f
}

// mustFile seeds a source file with one uploaded version and one string.
func (f taskFixture) mustFile(t *testing.T, sourcePath, key, sourceText string) (storedFileID, keyID string) {
	t.Helper()
	fileID := mustEditorCatSourceFile(t, f.scope, sourcePath)
	storedFileID = "file_" + uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, $4, 'application/json', 10, 'deadbeef')`,
		storedFileID, f.scope.OrganizationID, f.scope.ProjectID, sourcePath)
	require.NoError(t, err)
	_, err = f.scope.Pool.Exec(t.Context(), `
        insert into repository_source_file_versions (
            id, repository_source_file_id, organization_id, project_id, source_path, stored_file_id
        ) values ($1, $2, $3, $4, $5, $6)`,
		uuid.NewString(), fileID, f.scope.OrganizationID, f.scope.ProjectID, sourcePath, storedFileID)
	require.NoError(t, err)
	return storedFileID, mustEditorCatKey(t, f.scope, fileID, key, sourceText)
}

type taskSeed struct {
	storedFileID, status, step, kind string
	locales                          string
	owner                            *string
	after                            *string
}

// mustTask seeds a task for a person on a file. The defaults are an open proofread task on the
// fixture's first file, in French, owned by the fixture's person.
func (f taskFixture) mustTask(t *testing.T, seed taskSeed) string {
	t.Helper()
	if seed.storedFileID == "" {
		seed.storedFileID = f.storedFileID
	}
	if seed.status == "" {
		seed.status = "waiting_for_review"
	}
	if seed.kind == "" {
		seed.kind = "proofread"
	}
	if seed.locales == "" {
		seed.locales = `["fr"]`
	}
	if seed.owner == nil {
		seed.owner = &f.scope.UserID
	}
	metadata := `{}`
	if seed.step != "" {
		metadata = `{"workflowTaskStep":"` + seed.step + `"}`
	}
	id := "job_" + uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload, owner_user_id, assignee_type, after_job_id)
        values ($1, $2, $3, $4::job_kind, $5::job_status,
            jsonb_build_object('sourceFileId', $6::text, 'sourceLocale', 'en', 'targetLocales', $7::jsonb, 'metadata', $8::jsonb),
            $9, 'user', $10)`,
		id, f.scope.OrganizationID, f.scope.ProjectID, seed.kind, seed.status, seed.storedFileID, seed.locales, metadata, *seed.owner, seed.after)
	require.NoError(t, err)
	return id
}

// mustOtherMember seeds another member of the workspace and returns their user id.
func (f taskFixture) mustOtherMember(t *testing.T) string {
	t.Helper()
	id := uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `insert into users (id, workos_user_id, email) values ($1, $2, $3)`,
		id, "user_"+id, id+"@example.test")
	require.NoError(t, err)
	_, err = f.scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, role, workos_membership_id)
        values ($1, $2, 'translator', $3)`, f.scope.OrganizationID, id, "om_"+id)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = f.scope.Pool.Exec(context.Background(), `delete from users where id=$1`, id)
	})
	return id
}

func (f taskFixture) cat(method, suffix, body string) *httptest.ResponseRecorder {
	return editorCatRequestScope(f.editor, f.scope, method, editorCatPathFor(f.scope, "/files/detail/cat"+suffix), body)
}

func (f taskFixture) queue(sourcePath, locale, extra string) *httptest.ResponseRecorder {
	return f.cat(http.MethodGet, "/queue?sourcePath="+url.QueryEscape(sourcePath)+"&targetLocale="+locale+extra, "")
}

func (f taskFixture) save(sourcePath, locale, keyID string, approve bool) *httptest.ResponseRecorder {
	body := `{"sourcePath":"` + sourcePath + `","targetLocale":"` + locale + `","externalStringId":"` + keyID + `","text":"Bonjour"`
	if approve {
		body += `,"approve":true`
	}
	return f.cat(http.MethodPost, "/translations", body+`}`)
}

func (f taskFixture) jobList(query string) []string {
	return decodeProjectJobIDsLoose(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs"+query)))
}

func decodeProjectJobIDsLoose(rec *httptest.ResponseRecorder) []string {
	var body struct {
		Jobs []struct {
			ID string `json:"id"`
		} `json:"jobs"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	ids := []string{}
	for _, job := range body.Jobs {
		ids = append(ids, job.ID)
	}
	return ids
}

func (f taskFixture) jobDetailCode(jobID string) int {
	return projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+jobID)).Code
}

func TestVendorJobListAndTaskPage(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	other := f.mustOtherMember(t)
	open := f.mustTask(t, taskSeed{step: "edit"})
	waitingFor := f.mustTask(t, taskSeed{owner: &other})
	waiting := f.mustTask(t, taskSeed{status: "queued", after: &waitingFor})
	finished := f.mustTask(t, taskSeed{status: "succeeded"})
	cancelled := f.mustTask(t, taskSeed{status: "cancelled"})
	translate := f.mustTask(t, taskSeed{kind: "translation", step: "translate"})
	queuedNotWaiting := f.mustTask(t, taskSeed{status: "queued"})
	// A task on chosen strings names no file.
	stringsTask := mustProjectJob(t, f.scope, projectJobSeed{kind: "proofread", status: "waiting_for_review", ownerUserID: &f.scope.UserID})
	// A job mirrored from a provider, matched to the person by owner.
	mirrored := f.mustTask(t, taskSeed{})
	mustExternalJobDetails(t, f.scope, mirrored, "synced", `[]`)

	t.Run("the assigned list holds their open and waiting tasks only", func(t *testing.T) {
		require.ElementsMatch(t, []string{open, waiting}, f.jobList("?relationship=assigned&limit=100"))
		require.ElementsMatch(t, []string{open}, f.jobList("?relationship=assigned&status=waiting_for_review"))
	})

	t.Run("every other list is empty", func(t *testing.T) {
		require.Empty(t, f.jobList(""))
		require.Empty(t, f.jobList("?relationship=created"))
		require.Empty(t, f.jobList("?open=1"))
	})

	t.Run("the task page opens for their open and waiting tasks only", func(t *testing.T) {
		require.Equal(t, http.StatusOK, f.jobDetailCode(open))
		require.Equal(t, http.StatusOK, f.jobDetailCode(waiting))
		for name, hidden := range map[string]string{
			"another person's task": waitingFor, "finished": finished, "cancelled": cancelled,
			"translate task": translate, "queued without an earlier task": queuedNotWaiting,
			"chosen strings": stringsTask, "provider mirror": mirrored,
		} {
			require.Equal(t, http.StatusNotFound, f.jobDetailCode(hidden), name)
		}
	})

	t.Run("a task given to someone else is gone", func(t *testing.T) {
		_, err := f.scope.Pool.Exec(t.Context(), `update jobs set owner_user_id=$2 where id=$1`, open, other)
		require.NoError(t, err)
		require.NotContains(t, f.jobList("?relationship=assigned"), open)
		require.Equal(t, http.StatusNotFound, f.jobDetailCode(open))
	})

	t.Run("a team they were left in opens nothing", func(t *testing.T) {
		f.scope.MustTeam(t, "default", "Default", "member")
		require.Empty(t, f.jobList(""))
		require.Equal(t, http.StatusNotFound, f.jobDetailCode(finished))
		require.Equal(t, http.StatusNotFound, f.jobDetailCode(waitingFor))
	})
}

func TestVendorClosedProjectRoutes(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	task := f.mustTask(t, taskSeed{})
	for _, suffix := range []string{
		"/projects", "/projects/" + f.scope.ProjectID, "/projects/" + f.scope.ProjectID + "/files",
		"/projects/" + f.scope.ProjectID + "/jobs", "/projects/" + f.scope.ProjectID + "/jobs/" + task,
		"/projects/" + f.scope.ProjectID + "/members", "/projects/" + f.scope.ProjectID + "/content-editor-behavior",
		"/workspace-files", "/jobs/" + task + "/events", "/jobs/" + task + "/files", "/jobs/" + task + "/comments",
		"/jobs/" + task + "/assignable-owners", "/project-templates",
	} {
		rec := projectRequest(f.jobs, f.scope, f.scope.OrgPath(suffix))
		require.Equal(t, http.StatusForbidden, rec.Code, suffix+": "+rec.Body.String())
		require.Contains(t, rec.Body.String(), "organization_access_denied", suffix)
	}
}

func TestVendorEditorIsHeldToTheTask(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	f.mustTask(t, taskSeed{step: "edit"})

	t.Run("the task's file in the task's language", func(t *testing.T) {
		rec := f.queue(f.path, "fr", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Queue struct {
				CanEditTranslations    bool               `json:"canEditTranslations"`
				CanApproveTranslations *bool              `json:"canApproveTranslations"`
				TeamGlossaries         []json.RawMessage  `json:"teamGlossaries"`
				ContributorTeams       []json.RawMessage  `json:"contributorTeams"`
				Segments               []editorCatSegment `json:"segments"`
			} `json:"contentEditorQueue"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.True(t, body.Queue.CanEditTranslations)
		require.NotNil(t, body.Queue.CanApproveTranslations)
		require.False(t, *body.Queue.CanApproveTranslations)
		require.Empty(t, body.Queue.TeamGlossaries)
		require.Empty(t, body.Queue.ContributorTeams)
		require.Len(t, body.Queue.Segments, 1)
		require.Equal(t, http.StatusOK, f.cat(http.MethodGet, "?sourcePath="+url.QueryEscape(f.path)+"&targetLocale=fr", "").Code)
	})

	t.Run("refused outside the task", func(t *testing.T) {
		for name, rec := range map[string]*httptest.ResponseRecorder{
			"another file":               f.queue(f.otherPath, "fr", ""),
			"another language":           f.queue(f.path, "de", ""),
			"all files":                  f.queue("*", "fr", ""),
			"several files":              f.queue(f.path, "fr", "&sourcePaths="+url.QueryEscape(f.otherPath)),
			"groups of identical text":   f.queue(f.path, "fr", "&grouped=true"),
			"another branch":             f.queue(f.path, "fr", "&branch=feature"),
			"a file that does not exist": f.queue("missing.json", "fr", ""),
		} {
			require.Equal(t, http.StatusForbidden, rec.Code, name+": "+rec.Body.String())
		}
	})

	t.Run("reads for one string", func(t *testing.T) {
		query := "?sourcePath=" + url.QueryEscape(f.path) + "&targetLocale=fr"
		for _, suffix := range []string{"/target", "/comments", "/revisions"} {
			require.Equal(t, http.StatusOK, f.cat(http.MethodGet, "/segments/"+f.keyID+suffix+query, "").Code, suffix)
		}
		// A string of another file cannot be read by naming the task's file.
		require.Equal(t, http.StatusNotFound, f.cat(http.MethodGet, "/segments/"+f.otherKey+"/comments"+query, "").Code)
		otherQuery := "?sourcePath=" + url.QueryEscape(f.otherPath) + "&targetLocale=fr"
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodGet, "/segments/"+f.otherKey+"/comments"+otherQuery, "").Code)
	})

	t.Run("the translations of many strings", func(t *testing.T) {
		body := func(path, key, locales string) string {
			return `{"segments":[{"externalStringId":"` + key + `","sourcePath":"` + path + `"}],"targetLocales":` + locales + `}`
		}
		require.Equal(t, http.StatusOK, f.cat(http.MethodPost, "/targets", body(f.path, f.keyID, `["fr"]`)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/targets", body(f.otherPath, f.otherKey, `["fr"]`)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/targets", body(f.path, f.keyID, `["fr","de"]`)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/targets", body("*", f.otherKey, `["fr"]`)).Code)
	})

	t.Run("saving and commenting", func(t *testing.T) {
		require.Equal(t, http.StatusOK, f.save(f.path, "fr", f.keyID, false).Code)
		require.Equal(t, http.StatusForbidden, f.save(f.otherPath, "fr", f.otherKey, false).Code)
		require.Equal(t, http.StatusForbidden, f.save(f.path, "de", f.keyID, false).Code)
		// Naming the task's file does not reach a string of another file.
		require.NotEqual(t, http.StatusOK, f.save(f.path, "fr", f.otherKey, false).Code)
		group := `{"sourcePath":"` + f.path + `","targetLocale":"fr","externalStringId":"` + f.keyID + `","text":"Bonjour","group":{"sourcePath":"*"}}`
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/translations", group).Code)
		comment := func(path, locale, key string) string {
			return `{"sourcePath":"` + path + `","targetLocale":"` + locale + `","externalStringId":"` + key + `","text":"A note"}`
		}
		require.Equal(t, http.StatusOK, f.cat(http.MethodPost, "/comments", comment(f.path, "fr", f.keyID)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/comments", comment(f.otherPath, "fr", f.otherKey)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/comments", comment(f.path, "de", f.keyID)).Code)
	})

	t.Run("attached screenshots", func(t *testing.T) {
		body := func(path, key string) string {
			return `{"sourcePath":"` + path + `","externalStringId":"` + key + `"}`
		}
		require.Equal(t, http.StatusOK, f.cat(http.MethodPost, "/visual-context", body(f.path, f.keyID)).Code)
		require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/visual-context", body(f.otherPath, f.otherKey)).Code)
	})

	t.Run("every other editor route refuses a vendor", func(t *testing.T) {
		q := "?sourcePath=" + url.QueryEscape(f.path) + "&targetLocale=fr"
		own := `"sourcePath":"` + f.path + `","targetLocale":"fr"`
		ids := `"externalStringIds":["` + f.keyID + `"]`
		for _, route := range []struct{ name, method, suffix, body string }{
			{"activity log", http.MethodGet, "/activity-logs" + q, ""},
			{"group variants", http.MethodGet, "/segments/" + f.keyID + "/variants" + q + "&groupSourcePath=" + url.QueryEscape(f.path), ""},
			{"undo", http.MethodPost, "/operations/op-1/undo", `{}`},
			{"parse back", http.MethodPost, "/document/parse-back", `{` + own + `,"content":""}`},
			{"status", http.MethodPatch, "/translations/status", `{` + own + `,"externalStringId":"` + f.keyID + `","status":"approved"}`},
			{"resolve comment", http.MethodPatch, "/comments/" + uuid.NewString() + "/resolve", `{}`},
			{"lookup in the service", http.MethodPost, "/concordance", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Hello"}`},
			{"memory entry", http.MethodGet, "/tm-segments/" + uuid.NewString(), ""},
			{"edit memory entry", http.MethodPatch, "/tm-segments/" + uuid.NewString(), `{}`},
			{"delete memory record", http.MethodDelete, "/tm-segments/" + uuid.NewString() + "/records/" + uuid.NewString(), ""},
			{"upload screenshot", http.MethodPost, "/visual-context/screenshots", `{"sourcePath":"` + f.path + `"}`},
			{"delete screenshot", http.MethodDelete, "/visual-context/screenshots/" + uuid.NewString(), ""},
			{"hide", http.MethodPost, "/strings/hidden", `{"sourcePath":"` + f.path + `",` + ids + `,"isHidden":true}`},
			{"lock", http.MethodPost, "/strings/locked", `{` + own + `,` + ids + `,"isLocked":true}`},
			{"string limit", http.MethodPost, "/segments/" + f.keyID + "/max-length", `{"sourcePath":"` + f.path + `","maxLength":10}`},
			{"tags", http.MethodPost, "/strings/tags", `{"sourcePath":"` + f.path + `",` + ids + `,"addTags":["x"]}`},
			{"design link", http.MethodPost, "/segments/" + f.keyID + "/design-url", `{"sourcePath":"` + f.path + `","designUrl":"https://example.test"}`},
			{"source text", http.MethodPost, "/segments/" + f.keyID + "/source-text", `{"sourcePath":"` + f.path + `","sourceText":"Hi"}`},
			{"image status", http.MethodPatch, "/images/status", `{` + own + `,"status":"approved"}`},
			{"treat as image", http.MethodPost, "/segments/" + f.keyID + "/treat-as-image", `{"sourcePath":"` + f.path + `","treatAsImage":true}`},
		} {
			rec := f.cat(route.method, route.suffix, route.body)
			require.Equal(t, http.StatusForbidden, rec.Code, route.name+": "+rec.Body.String())
			require.Contains(t, rec.Body.String(), "organization_access_denied", route.name)
		}
		rec := editorCatRequestScope(f.editor, f.scope, http.MethodPost, editorCatPathFor(f.scope, "/files/string-context"), `{"sourcePath":"`+f.path+`","key":"greeting","text":"Hello","cachedOnly":true}`)
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})
}

func TestVendorMayApproveOnlyOnAProofreadTask(t *testing.T) {
	t.Run("post-edit task", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		f.mustTask(t, taskSeed{step: "edit"})
		rec := f.save(f.path, "fr", f.keyID, true)
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Equal(t, http.StatusOK, f.save(f.path, "fr", f.keyID, false).Code)
	})

	t.Run("proofread task", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		f.mustTask(t, taskSeed{})
		rec := f.save(f.path, "fr", f.keyID, true)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		queue := f.queue(f.path, "fr", "")
		require.NotContains(t, queue.Body.String(), "canApproveTranslations")
	})

	t.Run("each language follows its own task", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		f.mustTask(t, taskSeed{step: "edit", locales: `["fr"]`})
		f.mustTask(t, taskSeed{locales: `["de"]`})
		require.Equal(t, http.StatusForbidden, f.save(f.path, "fr", f.keyID, true).Code)
		require.Equal(t, http.StatusOK, f.save(f.path, "de", f.keyID, true).Code)
	})

	t.Run("restoring an approved version on a post-edit task", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		f.mustTask(t, taskSeed{step: "edit"})
		translationID := mustEditorCatTranslation(t, f.scope, f.keyID, "fr", "Salut", "draft")
		var revisionID string
		require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
            insert into project_translation_revisions (organization_id, project_id, translation_id, translation_key_id, target_locale, text, status, provenance, origin, actor_kind)
            values ($1, $2, $3, $4, 'fr', 'Bonjour', 'approved', 'manual', 'human', 'user') returning id`,
			f.scope.OrganizationID, f.scope.ProjectID, translationID, f.keyID).Scan(&revisionID))
		rec := f.cat(http.MethodPost, "/segments/"+f.keyID+"/revisions/"+revisionID+"/restore", `{"sourcePath":"`+f.path+`","targetLocale":"fr"}`)
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})
}

func TestVendorEditorClosesWhenTheTaskIsNotOpen(t *testing.T) {
	for name, seed := range map[string]taskSeed{
		"finished":  {status: "succeeded"},
		"cancelled": {status: "cancelled"},
		"waiting":   {status: "queued"},
	} {
		t.Run(name, func(t *testing.T) {
			f := newTaskFixture(t, organizationRoleVendor)
			if name == "waiting" {
				earlier := f.mustTask(t, taskSeed{status: "succeeded"})
				seed.after = &earlier
			}
			f.mustTask(t, seed)
			require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
			require.Equal(t, http.StatusNotFound, f.save(f.path, "fr", f.keyID, false).Code)
		})
	}

	t.Run("given to someone else", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		task := f.mustTask(t, taskSeed{})
		require.Equal(t, http.StatusOK, f.queue(f.path, "fr", "").Code)
		other := f.mustOtherMember(t)
		_, err := f.scope.Pool.Exec(t.Context(), `update jobs set owner_user_id=$2 where id=$1`, task, other)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
	})

	t.Run("no task at all", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
	})

	t.Run("a team they were left in opens nothing more", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		f.scope.MustTeam(t, "default", "Default", "member")
		require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
		f.mustTask(t, taskSeed{})
		require.Equal(t, http.StatusOK, f.queue(f.path, "fr", "").Code)
		require.Equal(t, http.StatusForbidden, f.queue(f.otherPath, "fr", "").Code)
	})

	t.Run("another workspace's task opens nothing", func(t *testing.T) {
		f := newTaskFixture(t, organizationRoleVendor)
		elsewhere := newTaskFixture(t, "admin")
		elsewhere.mustTask(t, taskSeed{owner: &f.scope.UserID})
		require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
	})
}

// A member who is not on the project's team reaches a task they own the same way, with the
// rights their role already gave them.
func TestTaskOwnerOutsideTheProjectTeam(t *testing.T) {
	t.Run("translator", func(t *testing.T) {
		f := newTaskFixture(t, "translator")
		require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
		task := f.mustTask(t, taskSeed{step: "edit"})
		require.Equal(t, http.StatusOK, f.jobDetailCode(task))
		require.Equal(t, http.StatusOK, f.queue(f.path, "fr", "").Code)
		require.Equal(t, http.StatusForbidden, f.queue(f.otherPath, "fr", "").Code)
		require.Equal(t, http.StatusForbidden, f.queue(f.path, "de", "").Code)
		// Their role decides approving, as it did before: the step rule is for vendors.
		require.Equal(t, http.StatusOK, f.save(f.path, "fr", f.keyID, true).Code)
		// A route that is not opened to task owners answers as it always did off the team.
		rec := f.cat(http.MethodPost, "/strings/hidden", `{"sourcePath":"`+f.path+`","externalStringIds":["`+f.keyID+`"],"isHidden":true}`)
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	})

	t.Run("a member still cannot edit", func(t *testing.T) {
		f := newTaskFixture(t, "member")
		f.mustTask(t, taskSeed{})
		require.Equal(t, http.StatusOK, f.queue(f.path, "fr", "").Code)
		require.Equal(t, http.StatusForbidden, f.save(f.path, "fr", f.keyID, false).Code)
	})

	t.Run("on the team nothing changes", func(t *testing.T) {
		f := newTaskFixture(t, "translator")
		f.scope.MustTeam(t, "default", "Default", "member")
		f.mustTask(t, taskSeed{})
		require.Equal(t, http.StatusOK, f.queue(f.otherPath, "de", "").Code)
		require.Equal(t, http.StatusOK, f.queue("*", "fr", "").Code)
		require.Contains(t, f.queue(f.path, "fr", "").Body.String(), "contentEditorQueue")
	})
}

func TestJobAssignableOwners(t *testing.T) {
	emails := func(rec *httptest.ResponseRecorder) []string {
		var body struct {
			Members []struct {
				Email string `json:"email"`
			} `json:"members"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		out := []string{}
		for _, member := range body.Members {
			out = append(out, member.Email)
		}
		return out
	}
	f := newTaskFixture(t, "admin")
	vendor := f.mustOtherMember(t)
	offTeam := f.mustOtherMember(t)
	_, err := f.scope.Pool.Exec(t.Context(), `update organization_memberships set role='vendor' where user_id=$1`, vendor)
	require.NoError(t, err)
	fileTask := f.mustTask(t, taskSeed{})
	otherJob := mustProjectJob(t, f.scope, projectJobSeed{})

	all := emails(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+fileTask+"/assignable-owners")))
	require.Contains(t, all, vendor+"@example.test")
	require.Contains(t, all, offTeam+"@example.test")

	rest := emails(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+otherJob+"/assignable-owners")))
	require.NotContains(t, rest, vendor+"@example.test")
	require.NotContains(t, rest, offTeam+"@example.test")
	require.Len(t, rest, 1, "only the admin can open the project")

	// A vendor left in the project's team is still not offered for any other job.
	teamID := f.scope.MustTeam(t, "default", "Default", "")
	_, err = f.scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')`, teamID, vendor, offTeam)
	require.NoError(t, err)
	rest = emails(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+otherJob+"/assignable-owners")))
	require.NotContains(t, rest, vendor+"@example.test")
	require.Contains(t, rest, offTeam+"@example.test")
}

// The Go service is closed to vendors by default: a route accepts one only when its handler asks
// for it. This reads the source so that opening another route, or naming the role in another
// role check, has to be done on purpose, here.
func TestVendorIsAcceptedOnlyWhereListed(t *testing.T) {
	files, err := filepath.Glob("*.go")
	require.NoError(t, err)
	callers := map[string]bool{}
	naming := map[string]bool{}
	var opened []string
	openRoute := regexp.MustCompile(`^\s*(?:routeAllowingVendor|taskRoute)\("([A-Z]+) "\+([a-zA-Z]+)(?:\+"([^"]*)")?`)
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		raw, err := os.ReadFile(file)
		require.NoError(t, err)
		for _, line := range strings.Split(string(raw), "\n") {
			code := line
			if i := strings.Index(code, "//"); i >= 0 {
				code = code[:i]
			}
			if strings.Contains(code, "resolveOrganizationActorAllowingVendor") {
				callers[file] = true
			}
			// The role by its constant, or as a literal in SQL. (iris-generation.go uses the word
			// "vendor" for a model provider, which is unrelated.)
			if strings.Contains(code, "organizationRoleVendor") || strings.Contains(code, `'vendor'`) {
				naming[file] = true
			}
			if match := openRoute.FindStringSubmatch(code); match != nil {
				opened = append(opened, match[1]+" "+match[2]+match[3])
			}
		}
	}
	keys := func(set map[string]bool) []string {
		out := make([]string, 0, len(set))
		for key := range set {
			out = append(out, key)
		}
		sort.Strings(out)
		return out
	}

	require.Equal(t, []string{"editor-cat.go", "member.go", "organization-actor.go", "project.go"}, keys(callers),
		"only these resolve an actor that may be a vendor; each must then limit a vendor to their own tasks")
	require.Equal(t, []string{
		"editor-cat.go", "issue-sheet-issues.go", "member-authz.go", "member-invite.go",
		"organization-actor.go", "project-jobs.go", "project.go",
	}, keys(naming), "the Vendor role is named only where it is refused, assigned, or held to a task")
	sort.Strings(opened)
	require.Equal(t, []string{
		// The editor, held to the file and languages of an open task the person owns.
		"GET cat",
		"GET cat/queue",
		"GET cat/segments/{externalStringId}/comments",
		"GET cat/segments/{externalStringId}/revisions",
		"GET cat/segments/{externalStringId}/target",
		// Leaving the workspace: the caller's own membership.
		"GET m/leave",
		// The job list and a task's page, for the person's own open and waiting tasks.
		"GET orgRoutePrefix/jobs",
		"GET orgRoutePrefix/jobs/{jobId}",
		"POST cat/comments",
		"POST cat/segments/{externalStringId}/revisions/{revisionId}/restore",
		"POST cat/targets",
		"POST cat/translations",
		"POST cat/visual-context",
		"POST m/leave",
	}, opened, "the routes a vendor may call")
}
