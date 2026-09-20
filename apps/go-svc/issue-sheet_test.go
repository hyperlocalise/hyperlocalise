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

type stubAutumnChecker struct {
	allowed bool
}

func (s stubAutumnChecker) BooleanFeatureEnabled(context.Context, string, string) bool {
	return s.allowed
}

func issueSheetTestAPI(t *testing.T, autumnAllow bool, steps ...dictionaryDBStep) (*issueSheetAPI, *dictionaryTestDB) {
	t.Helper()
	return issueSheetTestAPIRole(t, autumnAllow, "admin", steps...)
}

func issueSheetTestAPIRole(t *testing.T, autumnAllow bool, role string, steps ...dictionaryDBStep) (*issueSheetAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{
		{kind: "row", sql: "from users u join organization_memberships", values: [][]any{{
			testDictionaryUserID, testDictionaryOrgID, "acme", "mem_1", "org_workos",
		}}},
	}, steps...)...)
	api := &issueSheetAPI{
		pool: db,
		membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{
				ID:             id,
				UserID:         "user_123",
				OrganizationID: "org_workos",
				Status:         "active",
				Role:           &workos.SlimRole{Slug: role},
			}, nil
		},
		autumn: stubAutumnChecker{allowed: autumnAllow},
	}
	return api, db
}

func issueSheetAuthedRequest(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.SetPathValue("organizationSlug", "acme")
	req.SetPathValue("projectId", "proj_1")
	const marker = "/issue-sheet"
	if idx := strings.Index(path, marker); idx >= 0 {
		rest := strings.TrimPrefix(path[idx+len(marker):], "/")
		if q := strings.Index(rest, "?"); q >= 0 {
			rest = rest[:q]
		}
		if rest != "" {
			req.SetPathValue("rest", rest)
		}
	}
	return req.WithContext(context.WithValue(req.Context(), authContextKey{}, AuthClaims{UserID: "user_123"}))
}

func TestIssueSheetAutumnDeny(t *testing.T) {
	api, _ := issueSheetTestAPI(t, false)
	req := issueSheetAuthedRequest(http.MethodGet, "/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", "")
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestIssueSheetAutumnNilChecker(t *testing.T) {
	api, _ := issueSheetTestAPI(t, true)
	api.autumn = nil
	req := issueSheetAuthedRequest(http.MethodGet, "/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", "")
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestIssueSheetUnavailableWithoutPool(t *testing.T) {
	api := &issueSheetAPI{autumn: stubAutumnChecker{allowed: true}}
	req := issueSheetAuthedRequest(http.MethodGet, "/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", "")
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "issue_sheet_unavailable")
}

func TestIssueSheetUnauthorized(t *testing.T) {
	api := &issueSheetAPI{pool: newDictionaryTestDB(t), autumn: stubAutumnChecker{allowed: true}}
	req := httptest.NewRequest(http.MethodGet, "/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", nil)
	req.SetPathValue("organizationSlug", "acme")
	req.SetPathValue("projectId", "proj_1")
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "unauthorized")
}

func TestIssueSheetOriginGuard(t *testing.T) {
	api := &issueSheetAPI{pool: newDictionaryTestDB(t), autumn: stubAutumnChecker{allowed: true}}
	req := httptest.NewRequest(http.MethodPost, "http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", strings.NewReader(`{}`))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("organizationSlug", "acme")
	req.SetPathValue("projectId", "proj_1")
	req = req.WithContext(context.WithValue(req.Context(), authContextKey{}, AuthClaims{UserID: "user_123"}))
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestIssueSheetCrossSiteFetchGuard(t *testing.T) {
	api := &issueSheetAPI{pool: newDictionaryTestDB(t), autumn: stubAutumnChecker{allowed: true}}
	req := httptest.NewRequest(http.MethodPost, "http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", strings.NewReader(`{}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("organizationSlug", "acme")
	req.SetPathValue("projectId", "proj_1")
	req = req.WithContext(context.WithValue(req.Context(), authContextKey{}, AuthClaims{UserID: "user_123"}))
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestIssueSheetMemberCannotCreate(t *testing.T) {
	api, _ := issueSheetTestAPIRole(t, true, "member",
		dictionaryRowStep("from projects p", "proj_1", "HL"),
	)
	req := issueSheetAuthedRequest(http.MethodPost, "http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet", `{"title":"x"}`)
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestIssueSheetMemberCannotManageColumns(t *testing.T) {
	api, _ := issueSheetTestAPIRole(t, true, "member",
		dictionaryRowStep("from projects p", "proj_1", "HL"),
	)
	req := issueSheetAuthedRequest(http.MethodPost, "http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet/columns", `{"key":"note","label":"Note","type":"text"}`)
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestIssueSheetUnknownRoute(t *testing.T) {
	api, _ := issueSheetTestAPI(t, true,
		dictionaryRowStep("from projects p", "proj_1", "HL"),
	)
	req := issueSheetAuthedRequest(http.MethodGet, "/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/unknown", "")
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "not_found")
}

func TestIssueSheetInvalidRelationshipKind(t *testing.T) {
	api, _ := issueSheetTestAPI(t, true,
		dictionaryRowStep("from projects p", "proj_1", "HL"),
	)
	req := issueSheetAuthedRequest(
		http.MethodPost,
		"http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/relationships",
		`{"relatedIssueId":"HL-2","kind":"depends_on"}`,
	)
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_issue_relationship_payload")
}

func TestIssueSheetProtectedColumnDelete(t *testing.T) {
	cases := []struct {
		key, layer string
		want       bool
	}{
		{"priority", "custom", false},
		{"owner_note", "custom", false},
		{"context", "enrichment", false},
		{"context", "custom", false},
		{"custom_note", "custom", true},
		{"custom_note", "enrichment", false},
		{"priority", "system", false},
	}
	for _, tc := range cases {
		require.Equal(t, tc.want, canDeleteIssueSheetColumn(tc.key, tc.layer), "%s/%s", tc.key, tc.layer)
	}
}

func TestIssueSheetSelfRelationshipRejected(t *testing.T) {
	api, _ := issueSheetTestAPI(t, true,
		dictionaryRowStep("from projects p", "proj_1", "HL"),
		dictionaryRowStep("from issue_sheet_issues", "issue-1"),
	)
	req := issueSheetAuthedRequest(
		http.MethodPost,
		"http://localhost/api/go-svc/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/relationships",
		`{"relatedIssueId":"HL-1","kind":"related"}`,
	)
	rec := httptest.NewRecorder()
	api.serveHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "relationship_target_is_self")
}

func TestRequestLogPathIssueSheet(t *testing.T) {
	cases := []struct {
		path, want string
	}{
		{
			publicPathPrefix + "/v1/orgs/acme/projects/proj_1/issue-sheet",
			publicPathPrefix + "/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}",
		},
		{
			publicPathPrefix + "/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/comments",
			publicPathPrefix + "/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}",
		},
		{
			"/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/relationships/rel_1",
			"/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}",
		},
	}
	for _, tc := range cases {
		require.Equal(t, tc.want, requestLogPath(tc.path), tc.path)
	}
}

func TestIssueSheetActorCapabilities(t *testing.T) {
	cases := []struct {
		role                          string
		read, mutate, columns, teamOK bool
	}{
		{"admin", true, true, true, true},
		{"localization_manager", true, true, true, true},
		{"developer", true, true, true, false},
		{"translator", true, true, false, false},
		{"reviewer", true, true, false, false},
		{"member", true, false, false, false},
		{"guest", false, false, false, false},
		{"", false, false, false, false},
	}
	for _, tc := range cases {
		actor := issueSheetActor{role: tc.role}
		require.Equal(t, tc.read, actor.canRead(), "canRead %s", tc.role)
		require.Equal(t, tc.mutate, actor.canMutateIssues(), "canMutate %s", tc.role)
		require.Equal(t, tc.columns, actor.canManageColumns(), "columns %s", tc.role)
		require.Equal(t, tc.teamOK, actor.canWriteProjectTeam(), "team %s", tc.role)
	}
}

func TestIsLegacyIssueUUID(t *testing.T) {
	require.True(t, isLegacyIssueUUID("11111111-1111-4111-8111-111111111111"))
	require.True(t, isLegacyIssueUUID("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))
	require.False(t, isLegacyIssueUUID("HL-1"))
	require.False(t, isLegacyIssueUUID("11111111-1111-9111-8111-111111111111"))
	require.False(t, isLegacyIssueUUID(""))
	require.False(t, isLegacyIssueUUID("not-a-uuid"))
}

func TestIssueIDMatchSQL(t *testing.T) {
	sql, arg := issueIDMatchSQL("HL-12", 3)
	require.Equal(t, "identifier = $3", sql)
	require.Equal(t, "HL-12", arg)

	sql, arg = issueIDMatchSQL("11111111-1111-4111-8111-111111111111", 4)
	require.Equal(t, "id = $4", sql)
	require.Equal(t, "11111111-1111-4111-8111-111111111111", arg)
}

func TestPresentRelationshipKind(t *testing.T) {
	require.Equal(t, "related", presentRelationshipKind("related", "outgoing"))
	require.Equal(t, "related", presentRelationshipKind("related", "incoming"))
	require.Equal(t, "blocks", presentRelationshipKind("blocks", "outgoing"))
	require.Equal(t, "blocked_by", presentRelationshipKind("blocks", "incoming"))
	require.Equal(t, "duplicate_of", presentRelationshipKind("duplicate_of", "outgoing"))
	require.Equal(t, "duplicate", presentRelationshipKind("duplicate_of", "incoming"))
	require.Equal(t, "custom", presentRelationshipKind("custom", "outgoing"))
}

func TestCanMutateIssueComment(t *testing.T) {
	require.True(t, canMutateIssueComment("u1", "u1", "member"))
	require.True(t, canMutateIssueComment("u1", "u2", "admin"))
	require.False(t, canMutateIssueComment("u1", "u2", "member"))
	require.False(t, canMutateIssueComment("u1", "u2", "localization_manager"))
}

func TestUniqueStrings(t *testing.T) {
	require.Equal(t, []string{"a", "b"}, uniqueStrings([]string{" a ", "", "a", "b", " a"}))
	require.Equal(t, []string{}, uniqueStrings(nil))
	require.Equal(t, []string{}, uniqueStrings([]string{"", "  "}))
}

func TestFormatIssueUser(t *testing.T) {
	first, last, email := "Ada", "Lovelace", "ada@example.com"
	require.Equal(t, "Ada Lovelace", *formatIssueUser(&first, &last, &email))
	require.Equal(t, "ada@example.com", *formatIssueUser(nil, nil, &email))
	require.Nil(t, formatIssueUser(nil, nil, nil))
}

func TestIsProtectedIssueSheetColumnKey(t *testing.T) {
	require.True(t, isProtectedIssueSheetColumnKey("priority"))
	require.True(t, isProtectedIssueSheetColumnKey("owner_note"))
	require.True(t, isProtectedIssueSheetColumnKey("context"))
	require.False(t, isProtectedIssueSheetColumnKey("severity"))
}

func TestOptionalNullableStringUnmarshal(t *testing.T) {
	var omitted struct {
		Assignee optionalNullableString `json:"assigneeUserId"`
	}
	require.NoError(t, json.Unmarshal([]byte(`{}`), &omitted))
	require.False(t, omitted.Assignee.Present)

	var cleared struct {
		Assignee optionalNullableString `json:"assigneeUserId"`
	}
	require.NoError(t, json.Unmarshal([]byte(`{"assigneeUserId":null}`), &cleared))
	require.True(t, cleared.Assignee.Present)
	require.Nil(t, cleared.Assignee.Value)

	var set struct {
		Assignee optionalNullableString `json:"assigneeUserId"`
	}
	require.NoError(t, json.Unmarshal([]byte(`{"assigneeUserId":"user-1"}`), &set))
	require.True(t, set.Assignee.Present)
	require.Equal(t, "user-1", *set.Assignee.Value)
}

func TestParseFeedCursor(t *testing.T) {
	cursor, ok := parseFeedCursor("2026-09-20 12:00:00.123456+00|1|11111111-1111-4111-8111-111111111111")
	require.True(t, ok)
	require.Equal(t, 1, cursor.sortRank)
	require.Equal(t, "11111111-1111-4111-8111-111111111111", cursor.id)

	_, ok = parseFeedCursor("bad")
	require.False(t, ok)

	encoded := encodeFeedCursor(feedCursor{
		createdAt: "2026-09-20T12:00:00Z",
		sortRank:  0,
		id:        "11111111-1111-4111-8111-111111111111",
		issueID:   "22222222-2222-4222-8222-222222222222",
	})
	require.Equal(t, "2026-09-20T12:00:00Z|0|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222", encoded)
}

func TestBuildIssueListWhere(t *testing.T) {
	sql, args, needsPriority := buildIssueListWhere("org", "proj", "actor", issueListQuery{
		view:   "my_work",
		status: "open",
		search: "login",
	})
	require.Contains(t, sql, "i.assignee_user_id")
	require.Contains(t, sql, "i.status =")
	require.Contains(t, sql, "ilike")
	require.False(t, needsPriority)
	require.Equal(t, "org", args[0])
	require.Equal(t, "proj", args[1])

	sql, args, needsPriority = buildIssueListWhere("org", "proj", "actor", issueListQuery{
		priority:    "P0",
		sort:        "priority",
		qaCheckType: "placeholder_mismatch",
	})
	require.True(t, needsPriority)
	require.Contains(t, sql, "qaFinding,checkType")
	require.Contains(t, args, "placeholder_mismatch")
}

func TestParseIssueListQueryQACheckType(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?qaCheckType=placeholder_mismatch", nil)
	query, err := parseIssueListQuery(req, "actor")
	require.NoError(t, err)
	require.Equal(t, "placeholder_mismatch", query.qaCheckType)

	req = httptest.NewRequest(http.MethodGet, "/?qaCheckType=nope", nil)
	_, err = parseIssueListQuery(req, "actor")
	require.Error(t, err)
}
