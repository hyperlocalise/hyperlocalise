package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const testProjectBase = "/api/go-svc/v1/orgs/acme/projects"

func projectTestAPI(t *testing.T, steps ...dictionaryDBStep) *projectAPI {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{dictionaryAuthStep()}, steps...)...)
	return &projectAPI{
		pool: db,
		membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
			require.Equal(t, "om_live", id)
			return &workos.UserOrganizationMembership{
				ID:             id,
				UserID:         "user_live",
				OrganizationID: "org_live",
				Status:         "active",
				Role:           &workos.SlimRole{Slug: "admin"},
			}, nil
		},
	}
}

func projectRequestForTest(api *projectAPI, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
}

func TestProjectRoutes(t *testing.T) {
	t.Run("lists accessible native projects with open job counts", func(t *testing.T) {
		projects := json.RawMessage(`[{"id":"project_1","name":"Project","openJobCount":2}]`)
		step := dictionaryRowStep("order by p.updated_at desc", projects)
		step.args = []any{testDictionaryOrgID, true, testDictionaryUserID}

		rec := projectRequestForTest(projectTestAPI(t, step), testProjectBase)

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"projects":[{"id":"project_1","name":"Project","openJobCount":2}]}`, rec.Body.String())
	})

	t.Run("returns a dedicated open job count", func(t *testing.T) {
		step := dictionaryRowStep("select count(*)::int", true, 3)
		step.args = []any{"project_1", testDictionaryOrgID, true, testDictionaryUserID}

		rec := projectRequestForTest(projectTestAPI(t, step), testProjectBase+"/project_1/open-job-count")

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"openJobCount":3}`, rec.Body.String())
	})

	t.Run("returns content editor behavior and capability", func(t *testing.T) {
		step := dictionaryRowStep("cat_grouping_revision", true, 4)
		step.args = []any{"project_1", testDictionaryOrgID, true, testDictionaryUserID}

		rec := projectRequestForTest(projectTestAPI(t, step), testProjectBase+"/project_1/content-editor-behavior")

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"contentEditorBehavior":{"automaticallyGroupIdenticalStrings":true,"groupingRevision":4,"canManage":true}}`, rec.Body.String())
	})

	t.Run("lists the latest native repository files", func(t *testing.T) {
		files := json.RawMessage(`[{"origin":"repository","sourcePath":"locales/en.json","sourceHash":"hash","commitSha":"sha","workflowRunId":null,"uploadedAt":"2026-09-22T12:00:00Z","storedFileId":"file_1","metadata":{},"filename":"en.json","byteSize":42,"provider":null,"latestJob":null,"localeReadiness":{"fr":"missing"}}]`)
		step := dictionaryRowStep("latest_locale_jobs as", true, files)
		step.args = []any{"project_1", testDictionaryOrgID, true, testDictionaryUserID, 500, 0}

		rec := projectRequestForTest(projectTestAPI(t, step), testProjectBase+"/project_1/files")

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[{"origin":"repository","sourcePath":"locales/en.json","sourceHash":"hash","commitSha":"sha","workflowRunId":null,"uploadedAt":"2026-09-22T12:00:00Z","storedFileId":"file_1","metadata":{},"filename":"en.json","byteSize":42,"provider":null,"latestJob":null,"localeReadiness":{"fr":"missing"}}]}`, rec.Body.String())
	})

	t.Run("applies native file filters and pagination in SQL", func(t *testing.T) {
		step := dictionaryRowStep("ranked.source_path ilike", true, json.RawMessage(`[]`))
		step.args = []any{"project_1", testDictionaryOrgID, true, testDictionaryUserID, "%messages%", "fr", 25, 10}

		rec := projectRequestForTest(
			projectTestAPI(t, step),
			testProjectBase+"/project_1/files?search=messages&locale=fr&limit=25&offset=10",
		)

		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"files":[]}`, rec.Body.String())
	})

	t.Run("rejects invalid file query parameters", func(t *testing.T) {
		rec := projectRequestForTest(projectTestAPI(t), testProjectBase+"/project_1/files?limit=1001")

		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.JSONEq(t, `{"error":"invalid_project_files_query","message":"Invalid project files query parameters"}`, rec.Body.String())
	})

	t.Run("does not serve external project ids", func(t *testing.T) {
		rec := projectRequestForTest(
			projectTestAPI(t),
			strings.Replace(testProjectBase+"/project_1/open-job-count", "project_1", "ext:crowdin:1", 1),
		)

		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})
}
