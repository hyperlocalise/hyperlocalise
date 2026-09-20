package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testActivityLogBase   = "/api/go-svc/v1/orgs/acme/activity-logs"
	testActivityEventID   = "55555555-5555-4555-8555-555555555555"
	testActivityProjectID = "66666666-6666-4666-8666-666666666666"
	testActivityTargetID  = "77777777-7777-4777-8777-777777777777"
	testActivityActorUser = testDictionaryUserID
)

func activityLogAuthStep() dictionaryDBStep {
	return dictionaryAuthStep()
}

func activityLogTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) (*activityLogAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{activityLogAuthStep()}, steps...)...)
	api := &activityLogAPI{
		pool: db,
		membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
			require.Equal(t, "om_live", id)
			return &workos.UserOrganizationMembership{
				ID:             id,
				UserID:         "user_live",
				OrganizationID: "org_live",
				Status:         "active",
				Role:           &workos.SlimRole{Slug: role},
			}, nil
		},
	}
	return api, db
}

func activityLogRequestForTest(api *activityLogAPI, method, path string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
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
			api, _ := activityLogTestAPI(t, role)
			rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
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
			api, _ := activityLogTestAPI(t, "admin")
			rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase+raw)
			require.Equal(t, 400, rec.Code)
			require.Contains(t, rec.Body.String(), `"invalid_activity_log_query"`)
		})
	}
}

func TestActivityLogEmptyList(t *testing.T) {
	api, _ := activityLogTestAPI(t, "admin",
		dictionaryDBStep{kind: "query", sql: "from organization_activity_events e", values: [][]any{}},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Empty(t, body.ActivityLogs)
	require.Empty(t, body.Actors)
	require.Nil(t, body.NextCursor)
}

func TestActivityLogListSuccess(t *testing.T) {
	createdAt := testDictionaryTime
	payload := []byte(`{"name":"Acme App"}`)
	firstName := "Ada"
	lastName := "Lovelace"
	actorUserID := testActivityActorUser
	api, _ := activityLogTestAPI(t, "localization_manager",
		dictionaryDBStep{
			kind: "query",
			sql:  "from organization_activity_events e",
			values: [][]any{{
				nil, "user", &actorUserID, createdAt, "project_created", testActivityEventID,
				payload, testActivityProjectID, "project", &firstName, &lastName,
			}},
		},
		dictionaryDBStep{
			kind: "query",
			sql:  "e.actor_kind = 'user'",
			values: [][]any{{
				testActivityActorUser, &firstName, &lastName,
			}},
		},
		dictionaryDBStep{
			kind: "query",
			sql:  "select id, name from projects",
			values: [][]any{{
				testActivityProjectID, "Acme App",
			}},
		},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "project_created", body.ActivityLogs[0].EventType)
	require.Equal(t, "Ada Lovelace", body.ActivityLogs[0].Actor.DisplayName)
	require.Equal(t, "Acme App", *body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "/org/acme/projects/"+testActivityProjectID, *body.ActivityLogs[0].Target.Href)
	require.Len(t, body.Actors, 1)
	require.Equal(t, "Ada Lovelace", body.Actors[0].DisplayName)
	require.Nil(t, body.NextCursor)
}

func TestActivityLogInvalidCursorFingerprint(t *testing.T) {
	fingerprint, err := activityLogFilterFingerprint(activityLogQuery{eventTypes: []string{}, limit: 50, rangeKey: "all"})
	require.NoError(t, err)
	badCursor := encodeActivityLogCursor(activityLogCursor{
		createdAt: testDictionaryTime,
		id:        testActivityEventID,
	}, "not-"+fingerprint)

	api, _ := activityLogTestAPI(t, "admin")
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase+"?cursor="+url.QueryEscape(badCursor))
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
	createdAt := testDictionaryTime
	payload := []byte(`{"fileName":"locales/en.json","projectId":"` + testActivityProjectID + `","sourcePath":"locales/en.json"}`)
	api, _ := activityLogTestAPI(t, "admin",
		dictionaryDBStep{
			kind: "query",
			sql:  "from organization_activity_events e",
			values: [][]any{{
				nil, "system", nil, createdAt, "file_uploaded", testActivityEventID,
				payload, testActivityTargetID, "file", nil, nil,
			}},
		},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
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
	api := &activityLogAPI{pool: newDictionaryTestDB(t)}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, testActivityLogBase, nil)
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	require.Equal(t, 401, rec.Code)
}

func TestActivityLogRejectsNonGet(t *testing.T) {
	api := &activityLogAPI{pool: newDictionaryTestDB(t)}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodPost, testActivityLogBase, nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	require.Equal(t, 404, rec.Code)
}

func TestActivityLogAllowsAdmin(t *testing.T) {
	api, _ := activityLogTestAPI(t, "admin",
		dictionaryDBStep{kind: "query", sql: "from organization_activity_events e", values: [][]any{}},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
	require.Equal(t, 200, rec.Code, rec.Body.String())
}

func TestActivityLogPaginationCursor(t *testing.T) {
	createdAt := testDictionaryTime
	older := createdAt.Add(-time.Hour)
	firstID := testActivityEventID
	secondID := "88888888-8888-4888-8888-888888888888"
	payload := []byte(`{"name":"Gone"}`)
	api, _ := activityLogTestAPI(t, "admin",
		dictionaryDBStep{
			kind: "query",
			sql:  "from organization_activity_events e",
			values: [][]any{
				{nil, "system", nil, createdAt, "project_deleted", firstID, payload, testActivityProjectID, "project", nil, nil},
				{nil, "system", nil, older, "project_deleted", secondID, payload, testActivityProjectID, "project", nil, nil},
			},
		},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
		dictionaryDBStep{kind: "query", sql: "select id, name from projects", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase+"?limit=1")
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
	api, db := activityLogTestAPI(t, "admin",
		dictionaryDBStep{kind: "query", sql: "from organization_activity_events e", values: [][]any{}},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet,
		testActivityLogBase+"?actor=system&range=24h&eventTypes=project_created&eventTypes=project_deleted&limit=10")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Empty(t, db.steps)
}

func TestActivityLogUserActorFilter(t *testing.T) {
	api, db := activityLogTestAPI(t, "admin",
		dictionaryDBStep{kind: "query", sql: "from organization_activity_events e", values: [][]any{}},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
	)
	rec := activityLogRequestForTest(api, http.MethodGet,
		testActivityLogBase+"?actor=user:"+testActivityActorUser)
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Empty(t, db.steps)
}

func TestActivityLogMembershipPayloadFallback(t *testing.T) {
	createdAt := testDictionaryTime
	memberUserID := "99999999-9999-4999-8999-999999999999"
	payload := []byte(`{"memberUserId":"` + memberUserID + `"}`)
	firstName := "Grace"
	lastName := "Hopper"
	api, _ := activityLogTestAPI(t, "admin",
		dictionaryDBStep{
			kind: "query",
			sql:  "from organization_activity_events e",
			values: [][]any{{
				nil, "system", nil, createdAt, "member_removed", testActivityEventID,
				payload, testActivityTargetID, "membership", nil, nil,
			}},
		},
		dictionaryDBStep{kind: "query", sql: "e.actor_kind = 'user'", values: [][]any{}},
		dictionaryDBStep{
			kind:   "query",
			sql:    "from organization_memberships m",
			values: [][]any{},
		},
		dictionaryDBStep{
			kind: "query",
			sql:  "from users where id = any",
			values: [][]any{{
				memberUserID, &firstName, &lastName,
			}},
		},
	)
	rec := activityLogRequestForTest(api, http.MethodGet, testActivityLogBase)
	require.Equal(t, 200, rec.Code, rec.Body.String())

	var body activityLogListResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "Grace Hopper", *body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "/org/acme/settings/members", *body.ActivityLogs[0].Target.Href)
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
		encodeActivityLogCursor(activityLogCursor{createdAt: testDictionaryTime, id: "not-a-uuid"}, fingerprint),
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

func mustActivityLogFingerprint(t *testing.T, query activityLogQuery) string {
	t.Helper()
	fingerprint, err := activityLogFilterFingerprint(query)
	require.NoError(t, err)
	return fingerprint
}
