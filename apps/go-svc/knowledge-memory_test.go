package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type knowledgeMemoryFlagsStub struct {
	enabled bool
	err     error
}

func (s knowledgeMemoryFlagsStub) Enabled(context.Context, string, string, string) (bool, error) {
	return s.enabled, s.err
}

func knowledgeMemoryHandler(scope *testenv.Scope, role string, flags workspaceFlagChecker) *handler {
	h := newHandler()
	h.workspace = &workspaceAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		flags:      flags,
	}
	h.knowledgeMemories = &knowledgeMemoryAPI{workspace: h.workspace}
	return h
}

func knowledgeMemoryRequest(t *testing.T, h *handler, scope *testenv.Scope, method, path, body, ifMatch string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://127.0.0.1")
	if ifMatch != "" {
		req.Header.Set("If-Match", ifMatch)
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func decodeKnowledgeMemoryRecord(t *testing.T, recorder *httptest.ResponseRecorder) knowledgeMemoryRecord {
	t.Helper()
	var body struct {
		KnowledgeMemory knowledgeMemoryRecord `json:"knowledgeMemory"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body.KnowledgeMemory
}

func TestKnowledgeMemoryWorkspaceRoutesVersionHistoryAndRestore(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := knowledgeMemoryHandler(scope, "admin", knowledgeMemoryFlagsStub{enabled: true})
	path := scope.OrgPath("/knowledge-memory")

	loaded := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path, "", "")
	require.Equal(t, http.StatusOK, loaded.Code)
	require.Equal(t, `"0"`, loaded.Header().Get("ETag"))
	empty := decodeKnowledgeMemoryRecord(t, loaded)
	require.Equal(t, 0, empty.Version)
	require.Empty(t, empty.Content)

	initialContent := "## General\nBe concise and direct.  \n"
	created := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"## General\nBe concise and direct.  \n"}`, `"0"`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	first := decodeKnowledgeMemoryRecord(t, created)
	require.Equal(t, 1, first.Version)
	require.Equal(t, "## General\nBe concise and direct.", first.Content)
	require.Equal(t, `"`+*first.RevisionID+`"`, created.Header().Get("ETag"))
	firstETag := created.Header().Get("ETag")

	noOp := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"## General\nBe concise and direct.","summary":"ignored"}`, firstETag)
	require.Equal(t, http.StatusOK, noOp.Code, noOp.Body.String())
	noOpRecord := decodeKnowledgeMemoryRecord(t, noOp)
	require.Equal(t, first.RevisionID, noOpRecord.RevisionID)
	require.Equal(t, first.Summary, noOpRecord.Summary)

	updated := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"## General\nUse plain language.","summary":"Second version"}`, firstETag)
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())
	second := decodeKnowledgeMemoryRecord(t, updated)
	require.Equal(t, 2, second.Version)
	require.NotEqual(t, first.RevisionID, second.RevisionID)

	page := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions?limit=1", "", "")
	require.Equal(t, http.StatusOK, page.Code)
	var pageBody struct {
		KnowledgeMemoryRevisions []knowledgeMemoryRevisionMetadata `json:"knowledgeMemoryRevisions"`
		NextCursor               *int                              `json:"nextCursor"`
	}
	require.NoError(t, json.Unmarshal(page.Body.Bytes(), &pageBody))
	require.Len(t, pageBody.KnowledgeMemoryRevisions, 1)
	require.Equal(t, 2, pageBody.KnowledgeMemoryRevisions[0].Version)
	require.NotNil(t, pageBody.NextCursor)
	require.Equal(t, 2, *pageBody.NextCursor)

	older := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions?limit=1&cursor=2", "", "")
	require.Equal(t, http.StatusOK, older.Code, older.Body.String())
	var olderBody struct {
		KnowledgeMemoryRevisions []knowledgeMemoryRevisionMetadata `json:"knowledgeMemoryRevisions"`
		NextCursor               *int                              `json:"nextCursor"`
	}
	require.NoError(t, json.Unmarshal(older.Body.Bytes(), &olderBody))
	require.Len(t, olderBody.KnowledgeMemoryRevisions, 1)
	require.Equal(t, 1, olderBody.KnowledgeMemoryRevisions[0].Version)
	require.Nil(t, olderBody.NextCursor)

	firstRevision := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions/"+*first.RevisionID, "", "")
	require.Equal(t, http.StatusOK, firstRevision.Code, firstRevision.Body.String())
	var firstRevisionBody struct {
		KnowledgeMemoryRevision         knowledgeMemoryRevisionWithContent  `json:"knowledgeMemoryRevision"`
		PreviousKnowledgeMemoryRevision *knowledgeMemoryRevisionWithContent `json:"previousKnowledgeMemoryRevision"`
	}
	require.NoError(t, json.Unmarshal(firstRevision.Body.Bytes(), &firstRevisionBody))
	require.Equal(t, initialContent[:len(initialContent)-3], firstRevisionBody.KnowledgeMemoryRevision.Content)
	require.Nil(t, firstRevisionBody.PreviousKnowledgeMemoryRevision)

	restored := knowledgeMemoryRequest(t, h, scope, http.MethodPost, path+"/revisions/"+*first.RevisionID+"/restore", "{}", updated.Header().Get("ETag"))
	require.Equal(t, http.StatusOK, restored.Code, restored.Body.String())
	third := decodeKnowledgeMemoryRecord(t, restored)
	require.Equal(t, 3, third.Version)
	require.Equal(t, first.Content, third.Content)
	require.Equal(t, "Restored version 1", *third.Summary)

	conflict := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"stale"}`, firstETag)
	require.Equal(t, http.StatusPreconditionFailed, conflict.Code)
	require.Equal(t, `"`+*third.RevisionID+`"`, conflict.Header().Get("ETag"))
	var conflictBody struct {
		Error   string `json:"error"`
		Details struct {
			KnowledgeMemory knowledgeMemoryRecord `json:"knowledgeMemory"`
		} `json:"details"`
	}
	require.NoError(t, json.Unmarshal(conflict.Body.Bytes(), &conflictBody))
	require.Equal(t, "knowledge_memory_precondition_failed", conflictBody.Error)
	require.Equal(t, 3, conflictBody.Details.KnowledgeMemory.Version)

	missingPrecondition := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"no token"}`, "")
	require.Equal(t, 428, missingPrecondition.Code)
	invalidPrecondition := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"bad token"}`, "W/\"0\"")
	require.Equal(t, http.StatusBadRequest, invalidPrecondition.Code)
}

func TestKnowledgeMemoryFeatureGateFailsClosedAndWritesRequireWorkspaceUpdate(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "member"})
	path := scope.OrgPath("/knowledge-memory")

	for _, flags := range []workspaceFlagChecker{
		knowledgeMemoryFlagsStub{enabled: false},
		knowledgeMemoryFlagsStub{err: errors.New("flag service unavailable")},
	} {
		h := knowledgeMemoryHandler(scope, "member", flags)
		response := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path, "", "")
		require.Equal(t, http.StatusForbidden, response.Code)
		require.Contains(t, response.Body.String(), `"feature_unavailable"`)
	}

	h := knowledgeMemoryHandler(scope, "member", knowledgeMemoryFlagsStub{enabled: true})
	response := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"no"}`, `"0"`)
	require.Equal(t, http.StatusForbidden, response.Code)
	require.Contains(t, response.Body.String(), `"forbidden"`)
}

func TestKnowledgeMemoryProjectRoutesUsePersistedTeamAccessibleProjects(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "member", WithProject: true})
	defaultTeamID := scope.MustTeam(t, "default", "Default", "member")
	otherTeamID := scope.MustTeam(t, "other", "Other", "")
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, otherTeamID, scope.ProjectID)
	require.NoError(t, err)

	h := knowledgeMemoryHandler(scope, "member", knowledgeMemoryFlagsStub{enabled: true})
	unavailable := knowledgeMemoryRequest(t, h, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/knowledge-memory"), "", "")
	require.Equal(t, http.StatusNotFound, unavailable.Code)
	require.Contains(t, unavailable.Body.String(), `"project_not_found"`)

	_, err = scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, defaultTeamID, scope.ProjectID)
	require.NoError(t, err)
	accessible := knowledgeMemoryRequest(t, h, scope, http.MethodGet, scope.OrgPath("/projects/"+scope.ProjectID+"/knowledge-memory"), "", "")
	require.Equal(t, http.StatusOK, accessible.Code, accessible.Body.String())
	require.Equal(t, `"0"`, accessible.Header().Get("ETag"))

	// A provider project is usable only when already materialized in this org. This route never
	// resolves a live TMS project or decrypts provider credentials.
	materializedID := "ext:crowdin:42"
	_, err = scope.Pool.Exec(t.Context(), `insert into projects (id, organization_id, team_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
		values ($1, $2, $3, $4, 'Materialized project', 'EXT42', 'external_tms', 'crowdin', '42')`, materializedID, scope.OrganizationID, defaultTeamID, scope.UserID)
	require.NoError(t, err)
	materialized := knowledgeMemoryRequest(t, h, scope, http.MethodGet, scope.OrgPath("/projects/"+materializedID+"/knowledge-memory"), "", "")
	require.Equal(t, http.StatusOK, materialized.Code, materialized.Body.String())
	liveOnly := knowledgeMemoryRequest(t, h, scope, http.MethodGet, scope.OrgPath("/projects/ext:crowdin:missing/knowledge-memory"), "", "")
	require.Equal(t, http.StatusNotFound, liveOnly.Code)
}

func TestKnowledgeMemoryRouteRejectsInvalidPayloadAndRevisionQuery(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := knowledgeMemoryHandler(scope, "admin", knowledgeMemoryFlagsStub{enabled: true})
	path := scope.OrgPath("/knowledge-memory")
	for _, body := range []string{`{}`, `{"content":null}`, `{"content":"ok","summary":"   "}`} {
		response := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, body, `"0"`)
		require.Equal(t, http.StatusBadRequest, response.Code, body)
		require.Contains(t, response.Body.String(), `"invalid_knowledge_memory_payload"`)
	}
	badQuery := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions?limit=51", "", "")
	require.Equal(t, http.StatusBadRequest, badQuery.Code)
	badRevision := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions/not-a-uuid", "", "")
	require.Equal(t, http.StatusBadRequest, badRevision.Code)
}

func TestKnowledgeMemoryWorkspacePreviewRouteSelectsCurrentMemory(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := knowledgeMemoryHandler(scope, "admin", knowledgeMemoryFlagsStub{enabled: true})
	path := scope.OrgPath("/knowledge-memory")
	lines := []string{
		"# Memory.md",
		"",
		"## Locale notes",
		"",
		"### fr-FR",
		"",
		"Use idiomatic French for checkout confirmation messages.",
		"",
		"## General",
		"",
		"Keep all customer-facing language concise.",
	}
	for i := 0; i < 100; i++ {
		lines = append(lines, "## Operations note", "", strings.Repeat("Archive this internal process note. ", 2), "")
	}
	updated := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"`+strings.ReplaceAll(strings.Join(lines, "\n"), "\n", `\n`)+`"}`, `"0"`)
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())

	preview := knowledgeMemoryRequest(t, h, scope, http.MethodPost, path+"/preview", `{"targetLocale":"fr-FR","sourceText":"checkout confirmation","maxChars":700}`, "")
	require.Equal(t, http.StatusOK, preview.Code, preview.Body.String())
	var body struct {
		MemoryPreview knowledgeMemoryPreview `json:"memoryPreview"`
	}
	require.NoError(t, json.Unmarshal(preview.Body.Bytes(), &body))
	require.Equal(t, "selective", body.MemoryPreview.Metrics.FallbackMode)
	require.Contains(t, body.MemoryPreview.CompactText, "idiomatic French")
	require.LessOrEqual(t, body.MemoryPreview.Metrics.SelectedMemoryChars, 700)
}

func TestKnowledgeMemoryProjectRoutesSupportWritesAndHistory(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "localization_manager", WithProject: true})
	h := knowledgeMemoryHandler(scope, "localization_manager", knowledgeMemoryFlagsStub{enabled: true})
	path := scope.OrgPath("/projects/" + scope.ProjectID + "/knowledge-memory")

	created := knowledgeMemoryRequest(t, h, scope, http.MethodPut, path, `{"content":"## General\nUse project terminology consistently."}`, `"0"`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	first := decodeKnowledgeMemoryRecord(t, created)
	require.Equal(t, 1, first.Version)

	preview := knowledgeMemoryRequest(t, h, scope, http.MethodPost, path+"/preview", `{}`, "")
	require.Equal(t, http.StatusOK, preview.Code, preview.Body.String())
	require.Contains(t, preview.Body.String(), "Use project terminology consistently.")

	page := knowledgeMemoryRequest(t, h, scope, http.MethodGet, path+"/revisions", "", "")
	require.Equal(t, http.StatusOK, page.Code, page.Body.String())
	require.Contains(t, page.Body.String(), *first.RevisionID)
}
