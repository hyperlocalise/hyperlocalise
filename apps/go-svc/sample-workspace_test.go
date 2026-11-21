package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type sampleWorkspaceFixture struct {
	api   *sampleWorkspaceAPI
	scope *testenv.Scope
}

func newSampleWorkspaceFixture(t *testing.T, role string) *sampleWorkspaceFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	registry, err := objectstore.NewRegistry("mem", map[string]objectstore.Store{"mem": memory.New()})
	require.NoError(t, err)
	return &sampleWorkspaceFixture{
		scope: scope,
		api: &sampleWorkspaceAPI{
			pool:       scope.Pool,
			membership: scope.Membership(role),
			objects:    registry,
		},
	}
}

func (f *sampleWorkspaceFixture) do(method, path string) *httptest.ResponseRecorder {
	if path == "" {
		path = f.scope.OrgPath("/sample-workspace")
	}
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func requireSampleWorkspaceError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, code, body["error"])
	if message != "" {
		require.Equal(t, message, body["message"])
	}
}

func TestSampleTranslationStatus(t *testing.T) {
	require.Equal(t, "approved", sampleTranslationStatus(sampleProgressApproved, 9, 10))
	require.Equal(t, "approved", sampleTranslationStatus(sampleProgressInReview, 0, 3))
	require.Equal(t, "needs_review", sampleTranslationStatus(sampleProgressInReview, 2, 3))
	require.Equal(t, "approved", sampleTranslationStatus(sampleProgressPartial, 0, 3))
	require.Equal(t, "draft", sampleTranslationStatus(sampleProgressPartial, 1, 3))
	require.Equal(t, "", sampleTranslationStatus(sampleProgressPartial, 2, 3))
	require.Equal(t, "", sampleTranslationStatus(sampleProgressUntranslated, 0, 3))
}

func TestSampleWorkspaceUnavailableWithoutDatabase(t *testing.T) {
	api := &sampleWorkspaceAPI{}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_1"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/sample-workspace", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	requireSampleWorkspaceError(t, rec, http.StatusServiceUnavailable, "sample_workspace_unavailable", "Sample data is unavailable")
}

func TestSampleWorkspaceRequiresAuthentication(t *testing.T) {
	f := newSampleWorkspaceFixture(t, "admin")
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, f.scope.OrgPath("/sample-workspace"), nil))
		require.Equal(t, http.StatusUnauthorized, rec.Code, method)
	}
}

func TestSampleWorkspaceAuthorization(t *testing.T) {
	for role, allowed := range map[string]bool{
		"admin": true, "localization_manager": true,
		"developer": false, "reviewer": false, "translator": false, "member": false,
	} {
		t.Run(role, func(t *testing.T) {
			f := newSampleWorkspaceFixture(t, role)
			rec := f.do(http.MethodGet, "")
			if allowed {
				require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
				return
			}
			requireSampleWorkspaceError(t, rec, http.StatusForbidden, "forbidden", "Insufficient permissions")
		})
	}
}

func TestSampleWorkspaceOrganizationScoping(t *testing.T) {
	f := newSampleWorkspaceFixture(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		rec := f.do(method, other.OrgPath("/sample-workspace"))
		requireSampleWorkspaceError(t, rec, http.StatusForbidden, "organization_access_denied", "Organization access denied")
	}
}

func TestSampleWorkspaceSeedGetAndRemove(t *testing.T) {
	f := newSampleWorkspaceFixture(t, "admin")

	empty := f.do(http.MethodGet, "")
	require.Equal(t, http.StatusOK, empty.Code, empty.Body.String())
	require.JSONEq(t, `{"sampleWorkspace":{"loaded":false,"projects":[]}}`, empty.Body.String())

	created := f.do(http.MethodPost, "")
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var seeded struct {
		SampleWorkspace sampleWorkspaceSeedResult `json:"sampleWorkspace"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &seeded))
	require.Len(t, seeded.SampleWorkspace.Projects, 2)
	require.Equal(t, 1, seeded.SampleWorkspace.GlossaryCount)
	require.Equal(t, 1, seeded.SampleWorkspace.MemoryCount)
	require.Equal(t, 1, seeded.SampleWorkspace.DictionaryCount)
	require.Greater(t, seeded.SampleWorkspace.FileCount, 0)
	require.Greater(t, seeded.SampleWorkspace.StringCount, 0)

	var projectCount, glossaryCount, memoryCount, dictionaryCount, keyCount, translationCount int
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from projects where organization_id=$1 and (provider_metadata -> 'sampleWorkspace') is not null`,
		f.scope.OrganizationID).Scan(&projectCount))
	require.Equal(t, 2, projectCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from glossaries where organization_id=$1`, f.scope.OrganizationID).Scan(&glossaryCount))
	require.Equal(t, 1, glossaryCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from memories where organization_id=$1`, f.scope.OrganizationID).Scan(&memoryCount))
	require.Equal(t, 1, memoryCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from spellcheck_word_libraries where organization_id=$1`, f.scope.OrganizationID).Scan(&dictionaryCount))
	require.Equal(t, 1, dictionaryCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from project_translation_keys where organization_id=$1`, f.scope.OrganizationID).Scan(&keyCount))
	require.Equal(t, seeded.SampleWorkspace.StringCount, keyCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from project_translations where organization_id=$1`, f.scope.OrganizationID).Scan(&translationCount))
	require.Greater(t, translationCount, 0)

	loaded := f.do(http.MethodGet, "")
	require.Equal(t, http.StatusOK, loaded.Code, loaded.Body.String())
	var status struct {
		SampleWorkspace sampleWorkspaceStatus `json:"sampleWorkspace"`
	}
	require.NoError(t, json.Unmarshal(loaded.Body.Bytes(), &status))
	require.True(t, status.SampleWorkspace.Loaded)
	require.Len(t, status.SampleWorkspace.Projects, 2)

	conflict := f.do(http.MethodPost, "")
	requireSampleWorkspaceError(t, conflict, http.StatusConflict, "sample_workspace_exists", "Sample data is already loaded in this workspace.")

	removed := f.do(http.MethodDelete, "")
	require.Equal(t, http.StatusNoContent, removed.Code, removed.Body.String())
	require.Empty(t, removed.Body.Bytes())

	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from projects where organization_id=$1`, f.scope.OrganizationID).Scan(&projectCount))
	require.Equal(t, 0, projectCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from glossaries where organization_id=$1`, f.scope.OrganizationID).Scan(&glossaryCount))
	require.Equal(t, 0, glossaryCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from memories where organization_id=$1`, f.scope.OrganizationID).Scan(&memoryCount))
	require.Equal(t, 0, memoryCount)
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select count(*) from spellcheck_word_libraries where organization_id=$1`, f.scope.OrganizationID).Scan(&dictionaryCount))
	require.Equal(t, 0, dictionaryCount)

	after := f.do(http.MethodGet, "")
	require.JSONEq(t, `{"sampleWorkspace":{"loaded":false,"projects":[]}}`, after.Body.String())
}
