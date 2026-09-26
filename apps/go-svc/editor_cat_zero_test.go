package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func catReq(method, target, body string) *http.Request {
	return httptest.NewRequest(method, target, strings.NewReader(body))
}

func TestEditorCatSkippedRoutes(t *testing.T) {
	api := &editorCatAPI{}
	actor := editorCatActor{role: "admin"}
	project := editorCatProject{ID: "p", Source: "native"}
	req := catReq(http.MethodPost, "/", "{}")
	cases := []struct {
		name string
		fn   func(*http.Request, editorCatActor, editorCatProject) (any, int, error)
		code string
	}{
		{"visual", api.skipVisualContext, "visual_context_deferred"},
		{"recommendation", api.skipRecommendation, "ai_recommendation_deferred"},
		{"regenerate", api.skipImageRegenerate, "image_regenerate_deferred"},
		{"upload", api.skipImageUpload, "image_upload_deferred"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := tc.fn(req, actor, project)
			require.EqualError(t, err, tc.code)
		})
	}
}

func TestStringContext(t *testing.T) {
	api := &editorCatAPI{}
	project := editorCatProject{ID: "p", Source: "native"}
	admin := editorCatActor{role: "admin", organizationID: "org"}
	member := editorCatActor{role: "member", organizationID: "org"}

	_, _, err := api.stringContext(catReq(http.MethodPost, "/", "{"), admin, project)
	require.EqualError(t, err, "invalid_project_payload")

	_, _, err = api.stringContext(catReq(http.MethodPost, "/", `{"cachedOnly":true}`), member, project)
	require.EqualError(t, err, "forbidden")

	_, _, err = api.stringContext(catReq(http.MethodPost, "/", `{"sourcePath":"a.json","key":"hello"}`), admin, project)
	require.EqualError(t, err, "string_context_deferred")

	_, _, err = api.stringContext(catReq(http.MethodPost, "/", `{"cachedOnly":true,"sourcePath":" ","key":"hello"}`), admin, project)
	require.EqualError(t, err, "invalid_project_payload")

	summary := "nearby copy"
	api.pool = &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{projectFileStringSourceTextHash(""), &summary}}}}
	body, status, err := api.stringContext(catReq(http.MethodPost, "/", `{"cachedOnly":true,"sourcePath":"a.json","key":"hello","repositoryFullName":"acme/app"}`), admin, project)
	require.NoError(t, err)
	require.Equal(t, 200, status)
	got := body.(map[string]any)["stringContext"].(map[string]any)
	require.Equal(t, &summary, got["summary"])
	require.Equal(t, true, got["cached"])

	api.pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	body, status, err = api.stringContext(catReq(http.MethodPost, "/", `{"cachedOnly":true,"sourcePath":"a.json","key":"hello","repositoryFullName":"  "}`), admin, project)
	require.NoError(t, err)
	require.Equal(t, 200, status)
	got = body.(map[string]any)["stringContext"].(map[string]any)
	require.Nil(t, got["summary"])

	api.pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: errors.New("db")}}}
	_, _, err = api.stringContext(catReq(http.MethodPost, "/", `{"cachedOnly":true,"sourcePath":"a.json","key":"hello"}`), admin, project)
	require.EqualError(t, err, "db")
}

func TestLoadConcordance(t *testing.T) {
	api := &editorCatAPI{}
	actor := editorCatActor{organizationID: "org", role: "admin"}
	provider := editorCatProject{ID: "p", Source: "crowdin"}
	native := editorCatProject{ID: "p", Source: "native"}

	_, _, err := api.loadConcordance(catReq(http.MethodPost, "/", `{}`), actor, provider)
	require.EqualError(t, err, "provider_cat_deferred")

	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", "{"), actor, native)
	require.EqualError(t, err, "invalid_project_payload")

	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":" "}`), actor, native)
	require.EqualError(t, err, "invalid_project_payload")

	long := strings.Repeat("a", 100_001)
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"`+long+`"}`), actor, native)
	require.EqualError(t, err, "invalid_project_payload")

	api.pool = &scriptPool{steps: []dbStep{{op: opQuery, err: errors.New("db")}}}
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.EqualError(t, err, "db")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQuery, table: [][]any{{"term-1", "hello", "bonjour", true}}},
		{op: opQuery, err: errors.New("db")},
	}}
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.EqualError(t, err, "db")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQuery, table: [][]any{{"term-1", "hello", "bonjour", false}}},
		{op: opQuery, table: [][]any{{"mem-1", "hello", "bonjour", 90}}},
	}}
	body, status, err := api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.NoError(t, err)
	require.Equal(t, 200, status)
	concordance := body.(map[string]any)["concordance"].(map[string]any)
	terms := concordance["glossaryTerms"].([]editorCatGlossaryTerm)
	require.True(t, terms[0].Approved)
	require.Equal(t, "bonjour", terms[0].Target)
	matches := concordance["translationMemoryMatches"].([]editorCatMemoryMatch)
	require.Equal(t, 90, matches[0].MatchPercent)

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQuery, table: [][]any{{"bad"}}},
	}}
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.Error(t, err)

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQuery},
		{op: opQuery, table: [][]any{{"bad"}}},
	}}
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.Error(t, err)

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQuery, rowsErr: errors.New("rows")},
	}}
	_, _, err = api.loadConcordance(catReq(http.MethodPost, "/", `{"sourceLocale":"en","targetLocale":"fr","sourceText":"hello"}`), actor, native)
	require.EqualError(t, err, "rows")
}

func TestListActivityLogsQuery(t *testing.T) {
	api := &editorCatAPI{pool: errorPool{err: errors.New("db")}}
	actor := editorCatActor{organizationID: "org", organizationSlug: "acme", role: "admin"}
	project := editorCatProject{ID: "project", Source: "native"}

	_, _, err := api.listActivityLogs(catReq(http.MethodGet, "/?limit=10", ""), actor, project)
	require.EqualError(t, err, "invalid_project_payload")

	_, _, err = api.listActivityLogs(catReq(http.MethodGet, "/?sourcePath=a.json&limit=0", ""), actor, project)
	require.EqualError(t, err, "invalid_project_payload")

	badCursor := encodeActivityLogCursor(activityLogCursor{createdAt: time.Now().UTC(), id: uuid.NewString()}, "other-fingerprint")
	_, _, err = api.listActivityLogs(catReq(http.MethodGet, "/?sourcePath=a.json&cursor="+badCursor, ""), actor, project)
	require.EqualError(t, err, "invalid_activity_log_cursor")

	_, _, err = api.listActivityLogs(catReq(http.MethodGet, "/?sourcePath=*", ""), actor, project)
	require.EqualError(t, err, "db")

	_, _, err = api.listActivityLogs(catReq(http.MethodGet, "/?sourcePath=a.json", ""), actor, project)
	require.EqualError(t, err, "db")

	fingerprint := "cat:" + project.ID + ":a.json"
	cursor := encodeActivityLogCursor(activityLogCursor{createdAt: time.Now().UTC(), id: uuid.NewString()}, fingerprint)
	req := catReq(http.MethodGet, "/?sourcePath=a.json&cursor="+cursor, "")
	_, _, err = api.listActivityLogs(req, actor, project)
	require.EqualError(t, err, "db")
}
