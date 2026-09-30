package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type stubAutumnChecker struct {
	allowed bool
}

func (s stubAutumnChecker) BooleanFeatureEnabled(context.Context, string, string) bool {
	return s.allowed
}

func issueSheetTestAPI(t *testing.T, autumnAllow bool) (*issueSheetAPI, *testenv.Scope) {
	t.Helper()
	return issueSheetTestAPIRole(t, autumnAllow, "admin")
}

func issueSheetTestAPIRole(t *testing.T, autumnAllow bool, role string) (*issueSheetAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	api := &issueSheetAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		autumn:     stubAutumnChecker{allowed: autumnAllow},
	}
	return api, scope
}

func issueSheetAuthedRequest(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	return req
}

func issueSheetServe(api *issueSheetAPI, userID string, req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: userID}})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func issueSheetPath(scope *testenv.Scope, suffix string) string {
	base := scope.OrgPath("/projects/" + scope.ProjectID + "/issue-sheet")
	if suffix == "" {
		return base
	}
	if !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}
	return base + suffix
}

func mustIssueSheetIssue(t *testing.T, scope *testenv.Scope, number int, title string) (id, identifier string) {
	t.Helper()
	id = uuid.NewString()
	var prefix string
	err := scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`, scope.ProjectID).Scan(&prefix)
	require.NoError(t, err)
	identifier = fmt.Sprintf("%s-%d", prefix, number)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into issue_sheet_issues (
            id, organization_id, project_id, number, identifier, title, reporter_user_id
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
		id, scope.OrganizationID, scope.ProjectID, number, identifier, title, scope.UserID)
	require.NoError(t, err)
	return id, identifier
}

func TestIssueSheetAutumnDeny(t *testing.T) {
	api, scope := issueSheetTestAPI(t, false)
	req := issueSheetAuthedRequest(http.MethodGet, issueSheetPath(scope, ""), "")
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestIssueSheetAutumnNilChecker(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	api.autumn = nil
	req := issueSheetAuthedRequest(http.MethodGet, issueSheetPath(scope, ""), "")
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestIssueSheetUnavailableWithoutPool(t *testing.T) {
	api := &issueSheetAPI{autumn: stubAutumnChecker{allowed: true}}
	req := issueSheetAuthedRequest(http.MethodGet, "/v1/orgs/acme/projects/proj_1/issue-sheet", "")
	rec := issueSheetServe(api, "user_live", req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "issue_sheet_unavailable")
}

func TestIssueSheetUnauthorized(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	req := httptest.NewRequest(http.MethodGet, issueSheetPath(scope, ""), nil)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "unauthorized")
}

func TestIssueSheetOriginGuard(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	req := httptest.NewRequest(http.MethodPost, "http://localhost"+issueSheetPath(scope, ""), strings.NewReader(`{}`))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestIssueSheetCrossSiteFetchGuard(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	req := httptest.NewRequest(http.MethodPost, "http://localhost"+issueSheetPath(scope, ""), strings.NewReader(`{}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestIssueSheetMemberCannotDelete(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	scope.MustTeam(t, "default", "Default", "member")
	_, identifier := mustIssueSheetIssue(t, scope, 1, "Broken")
	req := issueSheetAuthedRequest(http.MethodDelete, "http://localhost"+issueSheetPath(scope, identifier), "")
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestIssueSheetDeleteIssue(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	_, identifier := mustIssueSheetIssue(t, scope, 1, "Broken")
	req := issueSheetAuthedRequest(http.MethodDelete, "http://localhost"+issueSheetPath(scope, identifier), "")
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Empty(t, rec.Body.String())
}

func TestIssueSheetDeleteIssueMissing(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	req := issueSheetAuthedRequest(http.MethodDelete, "http://localhost"+issueSheetPath(scope, "HL-999"), "")
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "issue_not_found")
}

func TestIssueSheetMemberCannotCreate(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	scope.MustTeam(t, "default", "Default", "member")
	req := issueSheetAuthedRequest(http.MethodPost, "http://localhost"+issueSheetPath(scope, ""), `{"title":"x"}`)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestIssueSheetMemberCannotManageColumns(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	scope.MustTeam(t, "default", "Default", "member")
	req := issueSheetAuthedRequest(http.MethodPost, "http://localhost"+issueSheetPath(scope, "columns"), `{"key":"note","label":"Note","type":"text"}`)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestIssueSheetUnknownRoute(t *testing.T) {
	api := &issueSheetAPI{autumn: stubAutumnChecker{allowed: true}}
	req := issueSheetAuthedRequest(http.MethodGet, "/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/unknown", "")
	rec := issueSheetServe(api, "user_live", req)
	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestIssueSheetInvalidRelationshipKind(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	_, identifier := mustIssueSheetIssue(t, scope, 1, "Broken")
	req := issueSheetAuthedRequest(
		http.MethodPost,
		"http://localhost"+issueSheetPath(scope, identifier+"/relationships"),
		`{"relatedIssueId":"HL-2","kind":"depends_on"}`,
	)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
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
	api, scope := issueSheetTestAPI(t, true)
	_, identifier := mustIssueSheetIssue(t, scope, 1, "Broken")
	req := issueSheetAuthedRequest(
		http.MethodPost,
		"http://localhost"+issueSheetPath(scope, identifier+"/relationships"),
		`{"relatedIssueId":"`+identifier+`","kind":"related"}`,
	)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "relationship_target_is_self")
}

func TestRequestLogPathIssueSheet(t *testing.T) {
	cases := []struct {
		path, want string
	}{
		{
			"/v1/orgs/acme/projects/proj_1/issue-sheet",
			"/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}",
		},
		{
			"/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/comments",
			"/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{resource}",
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

	// Fast path (len <= 32) and map path (len > 32) must trim, drop empties,
	// preserve first-seen order, and stay consistent across the Bolt boundary.
	small := make([]string, 0, 32)
	for i := 0; i < 32; i++ {
		small = append(small, fmt.Sprintf(" v%d ", i%16))
	}
	require.Equal(t, []string{
		"v0", "v1", "v2", "v3", "v4", "v5", "v6", "v7",
		"v8", "v9", "v10", "v11", "v12", "v13", "v14", "v15",
	}, uniqueStrings(small))

	large := make([]string, 0, 40)
	for i := 0; i < 40; i++ {
		large = append(large, fmt.Sprintf(" id-%d ", i%10), "", "  ")
	}
	require.Equal(t, []string{
		"id-0", "id-1", "id-2", "id-3", "id-4",
		"id-5", "id-6", "id-7", "id-8", "id-9",
	}, uniqueStrings(large))
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
