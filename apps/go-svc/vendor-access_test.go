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
	// The upload (file version) each stored file was seeded with.
	versions map[string]string
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
		versions:  map[string]string{},
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
	f.mustStoredFile(t, storedFileID, sourcePath)
	f.versions[storedFileID] = f.mustVersion(t, fileID, sourcePath, storedFileID)
	return storedFileID, mustEditorCatKey(t, f.scope, fileID, key, sourceText)
}

func (f taskFixture) mustStoredFile(t *testing.T, storedFileID, sourcePath string) {
	t.Helper()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, $4, 'application/json', 10, 'deadbeef')`,
		storedFileID, f.scope.OrganizationID, f.scope.ProjectID, sourcePath)
	require.NoError(t, err)
}

// mustVersion records an upload of a stored file as a version of a source file.
func (f taskFixture) mustVersion(t *testing.T, fileID, sourcePath, storedFileID string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into repository_source_file_versions (
            id, repository_source_file_id, organization_id, project_id, source_path, stored_file_id
        ) values ($1, $2, $3, $4, $5, $6)`,
		id, fileID, f.scope.OrganizationID, f.scope.ProjectID, sourcePath, storedFileID)
	require.NoError(t, err)
	return id
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
	// The upload the task was made for, which names its file and branch.
	var version *string
	if id, ok := f.versions[seed.storedFileID]; ok {
		version = &id
	}
	_, err = f.scope.Pool.Exec(t.Context(), `insert into translation_job_details (job_id, type, source_file_version_id) values ($1, 'file', $2)`, id, version)
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

	// A reader cannot save or mark done, so a task is not offered to one outside the team.
	reader := f.mustOtherMember(t)
	_, err = f.scope.Pool.Exec(t.Context(), `update organization_memberships set role='member' where user_id=$1`, reader)
	require.NoError(t, err)

	all := emails(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+fileTask+"/assignable-owners")))
	require.Contains(t, all, vendor+"@example.test")
	require.Contains(t, all, offTeam+"@example.test")
	require.NotContains(t, all, reader+"@example.test")

	// A finished task is an ordinary job again: only people who can open the project.
	finished := f.mustTask(t, taskSeed{status: "succeeded"})
	done := emails(projectRequest(f.jobs, f.scope, f.scope.OrgPath("/jobs/"+finished+"/assignable-owners")))
	require.NotContains(t, done, vendor+"@example.test")
	require.NotContains(t, done, offTeam+"@example.test")

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
		"editor-cat.go", "issue-org-bulk.go", "issue-org-notify.go", "issue-sheet-access.go",
		"issue-sheet-issues.go", "member-authz.go", "member-handlers.go", "member-invite.go",
		"organization-actor.go", "project-jobs.go", "project.go", "team-handlers.go",
	}, keys(naming), "the Vendor role is named only where it is refused, assigned, or held to a task")
	// The two helpers above are the only ways a route is opened: nothing else may ask a wrapper
	// to accept a vendor.
	var accepting []string
	acceptsVendor := regexp.MustCompile(`handleFor\([^)]*\)|\.handle\([^,()]+, [a-zA-Z]+\)`)
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		raw, err := os.ReadFile(file)
		require.NoError(t, err)
		for _, line := range strings.Split(string(raw), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "func ") || strings.HasPrefix(strings.TrimSpace(line), "//") {
				continue
			}
			for _, call := range acceptsVendor.FindAllString(line, -1) {
				accepting = append(accepting, file+": "+call)
			}
		}
	}
	sort.Strings(accepting)
	require.Equal(t, []string{
		"editor-cat.go: .handle(fn, editorScopeClosed)",
		"editor-cat.go: .handle(fn, rule)",
		"member.go: handleFor(fn, false)",
		"member.go: handleFor(fn, true)",
		"project.go: handleFor(fn, false)",
		"project.go: handleFor(fn, true)",
	}, accepting, "a wrapper is asked to accept a vendor only inside routeAllowingVendor and taskRoute")

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

// A task is on one file on one branch: the upload it was made for. Creating a branch copies the
// file's upload record with the same stored file, which must not open that branch.
func TestTaskScopeIsOneBranchOfTheFile(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	f.mustTask(t, taskSeed{})
	// The same path on a branch, sharing the stored file, as creating a branch leaves it.
	var branchFileID string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_files (organization_id, project_id, source_path, branch_name)
        values ($1, $2, $3, 'release') returning id`,
		f.scope.OrganizationID, f.scope.ProjectID, f.path).Scan(&branchFileID))
	f.mustVersion(t, branchFileID, f.path, f.storedFileID)
	branchKey := mustEditorCatKey(t, f.scope, branchFileID, "greeting", "Hello on release")
	_, err := f.scope.Pool.Exec(t.Context(), `update project_translation_keys set branch_name='release' where id=$1`, branchKey)
	require.NoError(t, err)
	mustEditorCatTranslation(t, f.scope, branchKey, "fr", "Bonjour release", "draft")

	require.Equal(t, http.StatusOK, f.queue(f.path, "fr", "").Code)
	require.Equal(t, http.StatusForbidden, f.queue(f.path, "fr", "&branch=release").Code)
	save := `{"sourcePath":"` + f.path + `","targetLocale":"fr","externalStringId":"` + branchKey + `","text":"Changed"}`
	require.Equal(t, http.StatusForbidden, f.cat(http.MethodPost, "/translations?branch=release", save).Code)

	// Naming the other branch's string while on the task's branch returns nothing of it.
	targets := f.cat(http.MethodPost, "/targets", `{"segments":[{"externalStringId":"`+branchKey+`","sourcePath":"`+f.path+`"}],"targetLocales":["fr"]}`)
	require.Equal(t, http.StatusOK, targets.Code, targets.Body.String())
	require.NotContains(t, targets.Body.String(), "Bonjour release")

	// A task made on the branch opens that branch and not the default one.
	onBranch := newTaskFixture(t, organizationRoleVendor)
	var releaseFile string
	require.NoError(t, onBranch.scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_files (organization_id, project_id, source_path, branch_name)
        values ($1, $2, $3, 'release') returning id`,
		onBranch.scope.OrganizationID, onBranch.scope.ProjectID, onBranch.path).Scan(&releaseFile))
	releaseStored := "file_" + uuid.NewString()
	onBranch.mustStoredFile(t, releaseStored, onBranch.path)
	onBranch.versions[releaseStored] = onBranch.mustVersion(t, releaseFile, onBranch.path, releaseStored)
	task := onBranch.mustTask(t, taskSeed{storedFileID: releaseStored})
	require.Equal(t, http.StatusOK, onBranch.queue(onBranch.path, "fr", "&branch=release").Code)
	require.Equal(t, http.StatusForbidden, onBranch.queue(onBranch.path, "fr", "").Code)

	// The task's page names the file and branch for the editor.
	rec := projectRequest(onBranch.jobs, onBranch.scope, onBranch.scope.OrgPath("/jobs/"+task))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"taskFile":{"sourcePath":"`+onBranch.path+`","branch":"release"}`)
}

func TestTaskWithNoUploadRecordOpensNoFile(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	delete(f.versions, f.storedFileID)
	task := f.mustTask(t, taskSeed{})
	require.Equal(t, http.StatusOK, f.jobDetailCode(task))
	require.Equal(t, http.StatusNotFound, f.queue(f.path, "fr", "").Code)
}

func TestVendorSeesOnlyWhatTheTaskPageShows(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	other := f.mustOtherMember(t)
	task := f.mustTask(t, taskSeed{step: "edit"})
	_, err := f.scope.Pool.Exec(t.Context(), `
        update jobs set created_by_user_id = $2, workflow_run_id = 'run_secret', last_error = 'secret error',
            context_snapshot = '{"note":"secret context"}'::jsonb,
            input_payload = input_payload || '{"internal":"secret payload","metadata":{"title":"Post-edit: app.json","workflowTaskStep":"edit","ticket":"SECRET-1"}}'::jsonb
        where id = $1`, task, other)
	require.NoError(t, err)

	for _, path := range []string{"/jobs/" + task, "/jobs?relationship=assigned"} {
		body := projectRequest(f.jobs, f.scope, f.scope.OrgPath(path)).Body.String()
		for _, hidden := range []string{other, "run_secret", "secret error", "secret context", "secret payload", "SECRET-1"} {
			require.NotContains(t, body, hidden, path)
		}
		for _, shown := range []string{"Post-edit: app.json", `"workflowTaskStep":"edit"`, f.storedFileID, `"targetLocales":["fr"]`} {
			require.Contains(t, body, shown, path)
		}
	}

	// Someone on the team reads the job as before.
	manager := newTaskFixture(t, "admin")
	job := manager.mustTask(t, taskSeed{})
	_, err = manager.scope.Pool.Exec(t.Context(), `update jobs set workflow_run_id = 'run_visible' where id = $1`, job)
	require.NoError(t, err)
	require.Contains(t, projectRequest(manager.jobs, manager.scope, manager.scope.OrgPath("/jobs/"+job)).Body.String(), "run_visible")
}

func TestTaskScopedQueueCarriesNoTeamsButTheQaRules(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	f.mustTask(t, taskSeed{})
	teamID := f.scope.MustTeam(t, "default", "Default team name", "")
	_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id = $2, qa_check_policy = '{"not_localized":{"enabled":true,"severity":"error"},"guideline":{"enabled":true,"severity":"error"}}'::jsonb where id = $1`, f.scope.ProjectID, teamID)
	require.NoError(t, err)
	f.scope.MustAttachGlossaryToProject(t, f.scope.ProjectID, f.scope.MustTeamGlossary(t, uuid.NewString(), "Team glossary name", "en", teamID), 0)

	body := f.queue(f.path, "fr", "").Body.String()
	require.NotContains(t, body, "Default team name")
	require.NotContains(t, body, "Team glossary name")
	for _, teamField := range []string{"teamGlossaries", "contributorTeams", "projectTeamId", "projectTeamSlug", "teamName", "canContributeTeamGlossary"} {
		require.NotContains(t, body, teamField)
	}
	require.Contains(t, body, `"not_localized":{"enabled":true,"severity":"error"}`)
	// Guideline checks read the project's guidelines, which stay closed.
	require.Contains(t, body, `"guideline":{"enabled":false,"severity":"error"}`)

	// The same project for an admin still carries its team and glossaries, and no QA rules here.
	admin := &editorCatAPI{pool: f.scope.Pool, membership: f.scope.Membership("admin")}
	adminBody := editorCatRequestScope(admin, f.scope, http.MethodGet, editorCatPathFor(f.scope, "/files/detail/cat/queue?sourcePath="+url.QueryEscape(f.path)+"&targetLocale=fr"), "").Body.String()
	for _, teamField := range []string{"Default team name", "projectTeamId", "projectTeamSlug", "canContributeTeamGlossary"} {
		require.Contains(t, adminBody, teamField)
	}
	require.NotContains(t, adminBody, "qaChecks")
}

func TestTaskScopedCommentsNameAuthorsWithoutEmail(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	f.mustTask(t, taskSeed{})
	other := f.mustOtherMember(t)
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into project_translation_comments (organization_id, project_id, translation_key_id, target_locale, type, text, author_user_id)
        values ($1, $2, $3, 'fr', 'comment', 'From someone with no name set', $4)`,
		f.scope.OrganizationID, f.scope.ProjectID, f.keyID, other)
	require.NoError(t, err)
	path := "/segments/" + f.keyID + "/comments?sourcePath=" + url.QueryEscape(f.path) + "&targetLocale=fr"

	body := f.cat(http.MethodGet, path, "").Body.String()
	require.Contains(t, body, "From someone with no name set")
	require.NotContains(t, body, other+"@example.test")

	f.scope.MustTeam(t, "default", "Default", "")
	admin := &editorCatAPI{pool: f.scope.Pool, membership: f.scope.Membership("admin")}
	adminBody := editorCatRequestScope(admin, f.scope, http.MethodGet, editorCatPathFor(f.scope, "/files/detail/cat"+path), "").Body.String()
	require.Contains(t, adminBody, other+"@example.test")
}

func TestPostEditVendorCannotRestoreAReviewDecision(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	f.mustTask(t, taskSeed{step: "edit"})
	translationID := mustEditorCatTranslation(t, f.scope, f.keyID, "fr", "Salut", "draft")
	revision := func(status string) string {
		var id string
		require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
            insert into project_translation_revisions (organization_id, project_id, translation_id, translation_key_id, target_locale, text, status, provenance, origin, actor_kind)
            values ($1, $2, $3, $4, 'fr', $5, $6::project_translation_status, 'manual', 'human', 'user') returning id`,
			f.scope.OrganizationID, f.scope.ProjectID, translationID, f.keyID, "Text "+status, status).Scan(&id))
		return id
	}
	restore := func(revisionID string) int {
		return f.cat(http.MethodPost, "/segments/"+f.keyID+"/revisions/"+revisionID+"/restore", `{"sourcePath":"`+f.path+`","targetLocale":"fr"}`).Code
	}
	require.Equal(t, http.StatusForbidden, restore(revision("rejected")))
	require.Equal(t, http.StatusForbidden, restore(revision("approved")))
	require.Equal(t, http.StatusOK, restore(revision("draft")))
}

func TestVendorIsToldWhenTheTaskIsNoLongerTheirs(t *testing.T) {
	f := newTaskFixture(t, organizationRoleVendor)
	task := f.mustTask(t, taskSeed{})
	_, err := f.scope.Pool.Exec(t.Context(), `update jobs set status='succeeded' where id=$1`, task)
	require.NoError(t, err)
	rec := f.save(f.path, "fr", f.keyID, false)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "task_not_open")

	// Someone else off the team still gets the answer they always got.
	other := newTaskFixture(t, "translator")
	require.Contains(t, other.queue(other.path, "fr", "").Body.String(), "project_not_found")
}

// A vendor is in no team, so no check that asks "is this person on the project's team" can
// take them for someone who may open the project.
func TestVendorIsInNoTeam(t *testing.T) {
	t.Run("an invite as Vendor joins no team, even when one is named", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		teamID := scope.MustTeam(t, "default", "Default", "")
		invited := mustOrgTeammate(t, scope, "invited_"+uuid.NewString(), uniqueTestEmail("vendor"), organizationRoleVendor)
		api := &memberAPI{pool: scope.Pool}
		for _, team := range []string{"", teamID} {
			created, err := api.ensureTeamAccessForInvitedMember(t.Context(), scope.Pool, scope.OrganizationID, invited, organizationRoleVendor, team)
			require.NoError(t, err)
			require.Nil(t, created)
		}
		var teams int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from team_memberships where user_id=$1`, invited).Scan(&teams))
		require.Zero(t, teams)

		// Any other role still joins the default team, as before.
		translator := mustOrgTeammate(t, scope, "invited_"+uuid.NewString(), uniqueTestEmail("translator"), "translator")
		created, err := api.ensureTeamAccessForInvitedMember(t.Context(), scope.Pool, scope.OrganizationID, translator, "translator", "")
		require.NoError(t, err)
		require.NotNil(t, created)
	})

	t.Run("changing a member to Vendor removes them from their teams", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		teamID := scope.MustTeam(t, "default", "Default", "")
		workosUserID := "member_" + uuid.NewString()
		memberID := mustOrgTeammate(t, scope, workosUserID, uniqueTestEmail("member"), "translator")
		stays := mustOrgTeammate(t, scope, "member_"+uuid.NewString(), uniqueTestEmail("stays"), "translator")
		_, err := scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')`, teamID, memberID, stays)
		require.NoError(t, err)
		actor := memberActor{userID: scope.UserID, organizationID: scope.OrganizationID, workosOrganizationID: scope.WorkOSOrganizationID, role: "admin", workosUserID: scope.WorkOSUserID}

		_, _, err = (&memberAPI{pool: scope.Pool}).updateMember(t.Context(), actor, workosUserID, memberUnitRequest(`{"role":"vendor"}`))
		require.NoError(t, err)

		var left []string
		rows, err := scope.Pool.Query(t.Context(), `select user_id::text from team_memberships where team_id=$1`, teamID)
		require.NoError(t, err)
		for rows.Next() {
			var id string
			require.NoError(t, rows.Scan(&id))
			left = append(left, id)
		}
		require.NoError(t, rows.Err())
		require.Equal(t, []string{stays}, left)
	})

	t.Run("a vendor cannot be added to a team", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		workosUserID := "vendor_" + uuid.NewString()
		vendorID := mustOrgTeammate(t, scope, workosUserID, uniqueTestEmail("vendor"), organizationRoleVendor)
		rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams/"+id+"/members"), `{"workosUserId":"`+workosUserID+`","role":"member"}`)
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "vendor_cannot_join_team")
		var teams int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from team_memberships where user_id=$1`, vendorID).Scan(&teams))
		require.Zero(t, teams)
	})

	t.Run("issue checks refuse a vendor even if a team membership slips through", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		teamID := scope.MustTeam(t, "default", "Default", "")
		vendorID := mustOrgTeammate(t, scope, "vendor_"+uuid.NewString(), uniqueTestEmail("vendor"), organizationRoleVendor)
		translatorID := mustOrgTeammate(t, scope, "translator_"+uuid.NewString(), uniqueTestEmail("translator"), "translator")
		_, err := scope.Pool.Exec(t.Context(), `insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')`, teamID, vendorID, translatorID)
		require.NoError(t, err)
		api := &issueSheetAPI{pool: scope.Pool}

		require.Error(t, api.assertAssignableAssignee(t.Context(), scope.OrganizationID, scope.ProjectID, vendorID))
		require.NoError(t, api.assertAssignableAssignee(t.Context(), scope.OrganizationID, scope.ProjectID, translatorID))

		tx, err := scope.Pool.Begin(t.Context())
		require.NoError(t, err)
		defer func() { _ = tx.Rollback(context.Background()) }()
		require.Error(t, api.assertAssignableAssigneeTx(t.Context(), tx, scope.OrganizationID, scope.ProjectID, vendorID))
		require.NoError(t, api.assertAssignableAssigneeTx(t.Context(), tx, scope.OrganizationID, scope.ProjectID, translatorID))

		notified, err := userHasIssueProjectAccess(t.Context(), scope.Pool, scope.OrganizationID, scope.ProjectID, vendorID)
		require.NoError(t, err)
		require.False(t, notified, "a vendor gets no issue notifications")
		notified, err = userHasIssueProjectAccess(t.Context(), scope.Pool, scope.OrganizationID, scope.ProjectID, translatorID)
		require.NoError(t, err)
		require.True(t, notified)
	})
}
