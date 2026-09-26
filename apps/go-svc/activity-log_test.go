package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const (
	testActivityLogBase   = "/v1/orgs/acme/activity-logs"
	testActivityEventID   = "55555555-5555-4555-8555-555555555555"
	testActivityProjectID = "66666666-6666-4666-8666-666666666666"
	testActivityTargetID  = "77777777-7777-4777-8777-777777777777"
	testActivityActorUser = "33333333-3333-4333-8333-333333333333"
)

var testActivityTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func activityLogTestAPI(t *testing.T, role string) (*activityLogAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	_, err := scope.Pool.Exec(t.Context(), `update users set first_name='Ada', last_name='Lovelace' where id=$1`, scope.UserID)
	require.NoError(t, err)
	return &activityLogAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
	}, scope
}

func activityLogRequest(api *activityLogAPI, scope *testenv.Scope, method, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func activityLogRequestForTest(api *activityLogAPI, method, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustActivityEvent(t *testing.T, scope *testenv.Scope, actorKind, eventType, targetKind, targetID string, payload []byte, createdAt time.Time, actorUserID *string) string {
	t.Helper()
	id := uuid.NewString()
	if payload == nil {
		payload = []byte(`{}`)
	}
	_, err := scope.Pool.Exec(t.Context(), `
        insert into organization_activity_events (
            id, organization_id, actor_kind, actor_user_id, event_type, target_kind, target_id, payload, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
		id, scope.OrganizationID, actorKind, actorUserID, eventType, targetKind, targetID, payload, createdAt)
	require.NoError(t, err)
	return id
}

func TestActivityLogRoutesRequireDatabase(t *testing.T) {
	api := &activityLogAPI{}
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
	require.Equal(t, 503, rec.Code)
	require.Contains(t, rec.Body.String(), `"activity_log_unavailable"`)
}

func TestActivityLogReadForbiddenForNonOperators(t *testing.T) {
	for _, role := range []string{"member", "developer", "translator", "reviewer"} {
		t.Run(role, func(t *testing.T) {
			api, scope := activityLogTestAPI(t, role)
			rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
			require.Equal(t, 403, rec.Code)
			require.Contains(t, rec.Body.String(), `"activity_logs_read_forbidden"`)
		})
	}
}

func TestActivityLogInvalidQuery(t *testing.T) {
	for _, raw := range []string{
		"?actor=user:",
		"?actor=user:not-a-uuid",
		"?range=90d",
		"?limit=0",
		"?limit=101",
		"?eventTypes=not_a_real_event",
	} {
		t.Run(raw, func(t *testing.T) {
			api, scope := activityLogTestAPI(t, "admin")
			rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs")+raw)
			require.Equal(t, 400, rec.Code)
			require.Contains(t, rec.Body.String(), `"invalid_activity_log_query"`)
		})
	}
}

func TestActivityLogEmptyList(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Empty(t, body.ActivityLogs)
	require.Empty(t, body.Actors)
	require.Nil(t, body.NextCursor)
}

func TestActivityLogListSuccess(t *testing.T) {
	api, scope := activityLogTestAPI(t, "localization_manager")
	payload := []byte(`{"name":"Acme App"}`)
	mustActivityEvent(t, scope, "user", "project_created", "project", scope.ProjectID, payload, testActivityTime, &scope.UserID)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "project_created", body.ActivityLogs[0].EventType)
	require.Equal(t, "Ada Lovelace", body.ActivityLogs[0].Actor.DisplayName)
	require.Equal(t, "Project", *body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "/org/"+scope.Slug+"/projects/"+scope.ProjectID, *body.ActivityLogs[0].Target.Href)
	require.Len(t, body.Actors, 1)
	require.Equal(t, "Ada Lovelace", body.Actors[0].DisplayName)
	require.Nil(t, body.NextCursor)
}

func TestActivityLogJobTargetUsesTextIDs(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	jobID := "job_abc123"
	_, err := scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload)
        values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb)`,
		jobID, scope.OrganizationID, scope.ProjectID)
	require.NoError(t, err)
	mustActivityEvent(t, scope, "system", "job_created", "job", jobID, []byte(`{}`), testActivityTime, nil)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "translation", *body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "/org/"+scope.Slug+"/projects/"+scope.ProjectID+"/jobs/"+jobID, *body.ActivityLogs[0].Target.Href)
}

func TestActivityLogInvalidCursorFingerprint(t *testing.T) {
	fingerprint, err := activityLogFilterFingerprint(activityLogQuery{eventTypes: []string{}, limit: 50, rangeKey: "all"})
	require.NoError(t, err)
	badCursor := encodeActivityLogCursor(activityLogCursor{
		createdAt: testActivityTime,
		id:        testActivityEventID,
	}, "not-"+fingerprint)

	api, scope := activityLogTestAPI(t, "admin")
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs")+"?cursor="+url.QueryEscape(badCursor))
	require.Equal(t, 400, rec.Code)
	require.Contains(t, rec.Body.String(), `"invalid_activity_log_cursor"`)
}

func TestActivityLogCursorRoundTrip(t *testing.T) {
	query := activityLogQuery{eventTypes: []string{"project_created"}, limit: 50, rangeKey: "7d"}
	fingerprint, err := activityLogFilterFingerprint(query)
	require.NoError(t, err)
	encoded := encodeActivityLogCursor(activityLogCursor{
		createdAt: time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC),
		id:        testActivityEventID,
	}, fingerprint)
	decoded, err := decodeActivityLogCursor(encoded, fingerprint)
	require.NoError(t, err)
	require.Equal(t, testActivityEventID, decoded.id)
	require.True(t, decoded.createdAt.Equal(time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)))
}

func TestActivityLogPayloadFallbackTarget(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	payload := []byte(`{"fileName":"locales/en.json","projectId":"` + scope.ProjectID + `","sourcePath":"locales/en.json"}`)
	mustActivityEvent(t, scope, "system", "file_uploaded", "file", testActivityTargetID, payload, testActivityTime, nil)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "System", body.ActivityLogs[0].Actor.DisplayName)
	require.Equal(t, "locales/en.json", *body.ActivityLogs[0].Target.DisplayName)
	require.Contains(t, *body.ActivityLogs[0].Target.Href, "content-editor?sourcePath=")
}

func TestParseActivityLogQueryDefaults(t *testing.T) {
	query, err := parseActivityLogQuery(url.Values{})
	require.NoError(t, err)
	require.Nil(t, query.actor)
	require.Empty(t, query.eventTypes)
	require.Equal(t, 50, query.limit)
	require.Equal(t, "all", query.rangeKey)
}

func TestActivityLogFilterFingerprintStable(t *testing.T) {
	left, err := activityLogFilterFingerprint(activityLogQuery{
		actor:      &activityLogActorFilter{kind: "user", userID: testActivityActorUser},
		eventTypes: []string{"project_deleted", "project_created"},
		rangeKey:   "24h",
	})
	require.NoError(t, err)
	right, err := activityLogFilterFingerprint(activityLogQuery{
		actor:      &activityLogActorFilter{kind: "user", userID: testActivityActorUser},
		eventTypes: []string{"project_created", "project_deleted"},
		rangeKey:   "24h",
	})
	require.NoError(t, err)
	require.Equal(t, left, right)
}

func TestActivityLogRequiresSession(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, scope.OrgPath("/activity-logs"), nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, 401, rec.Code)
}

func TestActivityLogRejectsNonGet(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodPost, scope.OrgPath("/activity-logs"), nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestActivityLogAllowsAdmin(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())
}

func TestActivityLogPaginationCursor(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	payload := []byte(`{"name":"Gone"}`)
	firstID := mustActivityEvent(t, scope, "system", "project_deleted", "project", testActivityProjectID, payload, testActivityTime, nil)
	mustActivityEvent(t, scope, "system", "project_deleted", "project", testActivityProjectID, payload, testActivityTime.Add(-time.Hour), nil)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs")+"?limit=1")
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, firstID, body.ActivityLogs[0].ID)
	require.NotNil(t, body.NextCursor)
	require.Equal(t, "Gone", *body.ActivityLogs[0].Target.DisplayName)
	require.Nil(t, body.ActivityLogs[0].Target.Href)

	decoded, err := decodeActivityLogCursor(*body.NextCursor, mustActivityLogFingerprint(t, activityLogQuery{
		eventTypes: []string{},
		limit:      1,
		rangeKey:   "all",
	}))
	require.NoError(t, err)
	require.Equal(t, firstID, decoded.id)
}

func TestActivityLogActorAndRangeFilters(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	rec := activityLogRequest(api, scope, http.MethodGet,
		scope.OrgPath("/activity-logs")+"?actor=system&range=24h&eventTypes=project_created&eventTypes=project_deleted&limit=10")
	require.Equal(t, 200, rec.Code, rec.Body.String())
}

func TestActivityLogUserActorFilter(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	rec := activityLogRequest(api, scope, http.MethodGet,
		scope.OrgPath("/activity-logs")+"?actor=user:"+scope.UserID)
	require.Equal(t, 200, rec.Code, rec.Body.String())
}

func TestActivityLogMembershipPayloadFallback(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	memberUserID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email, first_name, last_name)
        values ($1, $2, $3, 'Grace', 'Hopper')`,
		memberUserID, "user_"+memberUserID, memberUserID+"@example.com")
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(t.Context(), `delete from users where id=$1`, memberUserID)
	})
	payload := []byte(`{"memberUserId":"` + memberUserID + `"}`)
	mustActivityEvent(t, scope, "system", "member_removed", "membership", testActivityTargetID, payload, testActivityTime, nil)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "Grace Hopper", *body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "/org/"+scope.Slug+"/settings/members", *body.ActivityLogs[0].Target.Href)
}

func TestActivityLogActorDisplayNames(t *testing.T) {
	require.Equal(t, "System", activityLogActorDisplayName("system", nil, nil))
	require.Equal(t, "Agent", activityLogActorDisplayName("agent", nil, nil))
	require.Equal(t, "API credential", activityLogActorDisplayName("api_key", nil, nil))
	require.Equal(t, "Deleted user", activityLogActorDisplayName("user", nil, nil))
	first := "Ada"
	require.Equal(t, "Ada", activityLogActorDisplayName("user", &first, nil))
}

func TestPayloadTargetDisplayName(t *testing.T) {
	require.Equal(t, "Website", *payloadTargetDisplayName(map[string]any{
		"name": "Website", "integrationKind": "crowdin",
	}))
	require.Equal(t, "phrase", *payloadTargetDisplayName(map[string]any{"integrationKind": "phrase"}))
	require.Equal(t, "hl_AbCd", *payloadTargetDisplayName(map[string]any{"keyPrefix": "hl_AbCd"}))
	require.Equal(t, "en.json", *payloadTargetDisplayName(map[string]any{"fileName": "en.json"}))
	require.Nil(t, payloadTargetDisplayName(map[string]any{"resourceId": "resource_123"}))
}

func TestDecodeActivityLogCursorRejectsBadInput(t *testing.T) {
	fingerprint := mustActivityLogFingerprint(t, activityLogQuery{eventTypes: []string{}, limit: 50, rangeKey: "all"})
	for _, raw := range []string{
		"not-base64",
		encodeActivityLogCursor(activityLogCursor{createdAt: testActivityTime, id: "not-a-uuid"}, fingerprint),
	} {
		_, err := decodeActivityLogCursor(raw, fingerprint)
		require.Error(t, err)
		require.EqualError(t, err, "invalid_activity_log_cursor")
	}
}

func TestParseActivityLogQueryFull(t *testing.T) {
	query, err := parseActivityLogQuery(url.Values{
		"actor":      []string{"agent"},
		"eventTypes": []string{"job_created", "job_failed"},
		"limit":      []string{"25"},
		"range":      []string{"30d"},
	})
	require.NoError(t, err)
	require.Equal(t, &activityLogActorFilter{kind: "agent"}, query.actor)
	require.Equal(t, []string{"job_created", "job_failed"}, query.eventTypes)
	require.Equal(t, 25, query.limit)
	require.Equal(t, "30d", query.rangeKey)
}

func TestContentEditorAllFilesSourcePath(t *testing.T) {
	require.True(t, isContentEditorAllFilesSourcePath(""))
	require.True(t, isContentEditorAllFilesSourcePath("   "))
	require.True(t, isContentEditorAllFilesSourcePath("*"))
	require.True(t, isContentEditorAllFilesSourcePath(" * "))
	require.False(t, isContentEditorAllFilesSourcePath("locales/en.json"))
	require.False(t, isContentEditorAllFilesSourcePath("*/partial"))
}

func TestActivityLogPayloadUUID(t *testing.T) {
	valid := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	require.Equal(t, valid, activityLogPayloadUUID(map[string]any{"memberUserId": valid}, "memberUserId"))
	require.Equal(t, "", activityLogPayloadUUID(map[string]any{"memberUserId": "not-a-uuid"}, "memberUserId"))
	require.Equal(t, "", activityLogPayloadUUID(map[string]any{"memberUserId": 42}, "memberUserId"))
	require.Equal(t, "", activityLogPayloadUUID(map[string]any{}, "memberUserId"))
}

func TestActivityLogAllFilesSourcePathOmitsHref(t *testing.T) {
	for _, sourcePath := range []string{"*", "  "} {
		t.Run(sourcePath, func(t *testing.T) {
			api, scope := activityLogTestAPI(t, "admin")
			payload := []byte(`{"fileName":"all files","projectId":"` + scope.ProjectID + `","sourcePath":"` + sourcePath + `"}`)
			mustActivityEvent(t, scope, "system", "file_uploaded", "file", testActivityTargetID, payload, testActivityTime, nil)
			rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
			require.Equal(t, 200, rec.Code, rec.Body.String())

			var body activityLogListResult
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			require.Len(t, body.ActivityLogs, 1)
			require.Equal(t, "all files", *body.ActivityLogs[0].Target.DisplayName)
			require.Nil(t, body.ActivityLogs[0].Target.Href)
		})
	}
}

func TestActivityLogGlossaryMemoryAutomationAndOrgJobTargets(t *testing.T) {
	cases := []struct {
		name       string
		targetKind string
		eventType  string
		seed       func(*testing.T, *testenv.Scope) (targetID, wantName, wantHref string)
	}{
		{
			name:       "glossary",
			targetKind: "glossary",
			eventType:  "glossary_created",
			seed: func(t *testing.T, scope *testenv.Scope) (string, string, string) {
				id := scope.MustGlossary(t, "", "Product terms", "en-US")
				return id, "Product terms", "/org/" + scope.Slug + "/glossaries/" + id
			},
		},
		{
			name:       "translation_memory",
			targetKind: "translation_memory",
			eventType:  "translation_memory_created",
			seed: func(t *testing.T, scope *testenv.Scope) (string, string, string) {
				id := scope.MustMemory(t, "", "Brand TM")
				return id, "Brand TM", "/org/" + scope.Slug + "/translation-memories/" + id
			},
		},
		{
			name:       "automation",
			targetKind: "automation",
			eventType:  "automation_enabled",
			seed: func(t *testing.T, scope *testenv.Scope) (string, string, string) {
				id := uuid.NewString()
				_, err := scope.Pool.Exec(t.Context(), `
                    insert into workspace_automations (id, organization_id, name, instructions)
                    values ($1, $2, 'Nightly sync', 'sync')`,
					id, scope.OrganizationID)
				require.NoError(t, err)
				return id, "Nightly sync", "/org/" + scope.Slug + "/automations/" + id
			},
		},
		{
			name:       "org-scoped job",
			targetKind: "job",
			eventType:  "job_created",
			seed: func(t *testing.T, scope *testenv.Scope) (string, string, string) {
				id := "job_org_only"
				_, err := scope.Pool.Exec(t.Context(), `
                    insert into jobs (id, organization_id, kind, status, input_payload)
                    values ($1, $2, 'sync', 'queued', '{}'::jsonb)`,
					id, scope.OrganizationID)
				require.NoError(t, err)
				return id, "sync", "/org/" + scope.Slug + "/jobs"
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := activityLogTestAPI(t, "admin")
			targetID, wantName, wantHref := tc.seed(t, scope)
			mustActivityEvent(t, scope, "system", tc.eventType, tc.targetKind, targetID, []byte(`{}`), testActivityTime, nil)
			rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
			require.Equal(t, 200, rec.Code, rec.Body.String())

			var body activityLogListResult
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			require.Len(t, body.ActivityLogs, 1)
			require.Equal(t, wantName, *body.ActivityLogs[0].Target.DisplayName)
			require.Equal(t, wantHref, *body.ActivityLogs[0].Target.Href)
		})
	}
}

func TestActivityLogStringSegmentAllFilesSourcePathOmitsHref(t *testing.T) {
	api, scope := activityLogTestAPI(t, "admin")
	payload := []byte(`{"fileName":"batch","projectId":"` + scope.ProjectID + `","sourcePath":"*"}`)
	mustActivityEvent(t, scope, "system", "string_segment_status_changed", "string_segment", testActivityTargetID, payload, testActivityTime, nil)
	rec := activityLogRequest(api, scope, http.MethodGet, scope.OrgPath("/activity-logs"))
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "batch", *body.ActivityLogs[0].Target.DisplayName)
	require.Nil(t, body.ActivityLogs[0].Target.Href)
}

func mustActivityLogFingerprint(t *testing.T, query activityLogQuery) string {
	t.Helper()
	fingerprint, err := activityLogFilterFingerprint(query)
	require.NoError(t, err)
	return fingerprint
}
