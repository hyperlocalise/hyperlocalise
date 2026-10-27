package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseConversationListQuery(t *testing.T) {
	query, err := parseConversationListQuery(url.Values{})
	require.NoError(t, err)
	require.Equal(t, conversationListQuery{limit: 50}, query)

	valid := []struct {
		raw  string
		want conversationListQuery
	}{
		{"limit=1", conversationListQuery{limit: 1}},
		{"limit=100", conversationListQuery{limit: 100}},
		{"limit=%207%20", conversationListQuery{limit: 7}},
		{"limit=0x10", conversationListQuery{limit: 16}},
		{"limit=1e1", conversationListQuery{limit: 10}},
		{"status=archived", conversationListQuery{status: "archived", limit: 50}},
		{"status=active&unknown=1&unknown=2", conversationListQuery{status: "active", limit: 50}},
		{"projectId=%20project_1%20", conversationListQuery{projectID: "project_1", limit: 50}},
		{"projectId=ext%253Acrowdin%253A42", conversationListQuery{projectID: "ext:crowdin:42", limit: 50}},
		{"projectId=" + strings.Repeat("p", 128), conversationListQuery{projectID: strings.Repeat("p", 128), limit: 50}},
		{"cursor=garbage", conversationListQuery{limit: 50}},
	}
	for _, tt := range valid {
		values, err := url.ParseQuery(tt.raw)
		require.NoError(t, err)
		got, err := parseConversationListQuery(values)
		require.NoError(t, err, tt.raw)
		require.Equal(t, tt.want, got, tt.raw)
	}

	invalid := []string{
		"limit=0", "limit=101", "limit=", "limit=5.5", "limit=abc", "limit=Infinity", "limit=1&limit=2",
		"status=open", "status=", "status=active&status=archived",
		"projectId=", "projectId=%20", "projectId=" + strings.Repeat("p", 129), "projectId=a&projectId=b",
		"cursor=a&cursor=b",
	}
	for _, raw := range invalid {
		values, err := url.ParseQuery(raw)
		require.NoError(t, err)
		_, err = parseConversationListQuery(values)
		var failure *conversationError
		require.ErrorAs(t, err, &failure, raw)
		require.Equal(t, http.StatusBadRequest, failure.status, raw)
		require.Equal(t, "invalid_query", failure.code, raw)
	}
}

func TestParseConversationCursor(t *testing.T) {
	cases := map[string]string{
		"2026-10-09T10:00:00.123456Z":   "2026-10-09T10:00:00.123Z",
		"2026-10-09T10:00:00.5Z":        "2026-10-09T10:00:00.5Z",
		"2026-10-09T10:00:00+02:00":     "2026-10-09T08:00:00Z",
		"2026-10-09T10:00:00.999-01:30": "2026-10-09T11:30:00.999Z",
		"2026-10-09T10:00":              "2026-10-09T10:00:00Z",
		"2026-10-09":                    "2026-10-09T00:00:00Z",
		"2026-10":                       "2026-10-01T00:00:00Z",
		"2026":                          "2026-01-01T00:00:00Z",
		"2019-02-31":                    "2019-03-03T00:00:00Z",
		"2026-10-09T24:00:00Z":          "2026-10-10T00:00:00Z",
		" 2026-10-09T10:00:00Z ":        "2026-10-09T10:00:00Z",
	}
	for raw, want := range cases {
		got := parseConversationCursor(raw)
		require.NotNil(t, got, raw)
		require.Equal(t, want, got.Format(time.RFC3339Nano), raw)
	}

	for _, raw := range []string{"", "garbage", "1700000000000", "2026-13-01", "2026-10-32", "2026-10-09T24:00:01Z", "2026-10-09T10:00:00+25:00", "2026-10-09T10:60"} {
		require.Nil(t, parseConversationCursor(raw), raw)
	}
}

func TestConversationIDParam(t *testing.T) {
	cases := map[string]bool{
		"3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e": true,
		"3F2B8C1E-4D5A-4B6C-8D7E-9F0A1B2C3D4E": true,
		"00000000-0000-0000-0000-000000000000": true,
		"ffffffff-ffff-ffff-ffff-ffffffffffff": true,
		"3f2b8c1e-4d5a-9b6c-8d7e-9f0a1b2c3d4e": false,
		"3f2b8c1e-4d5a-4b6c-cd7e-9f0a1b2c3d4e": false,
		"3f2b8c1e4d5a4b6c8d7e9f0a1b2c3d4e":     false,
		"not-a-uuid":                           false,
	}
	for id, ok := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.SetPathValue("conversationId", id)
		got, err := conversationIDParam(req)
		if ok {
			require.NoError(t, err, id)
			require.Equal(t, id, got)
			continue
		}
		var failure *conversationError
		require.ErrorAs(t, err, &failure, id)
		require.Equal(t, http.StatusNotFound, failure.status)
		require.Equal(t, "not_found", failure.code)
	}
}

func TestConversationActorCapabilities(t *testing.T) {
	cases := map[string][2]bool{
		"admin":                {true, true},
		"localization_manager": {true, true},
		"developer":            {false, true},
		"reviewer":             {false, true},
		"translator":           {false, true},
		"member":               {false, false},
		"unknown":              {false, false},
	}
	for role, want := range cases {
		actor := conversationActor{role: role}
		require.Equal(t, want[0], actor.canReadAllTeams(), role)
		require.Equal(t, want[1], actor.canRunAIActions(), role)
	}
}

func TestWriteConversationErrorOmitsEmptyMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	writeConversationError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "test", conversationNotFound())
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.JSONEq(t, `{"error":"not_found"}`, rec.Body.String())

	rec = httptest.NewRecorder()
	writeConversationError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "test", invalidConversationQuery())
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"invalid_query"}`, rec.Body.String())
}

func TestConversationRequestLogPath(t *testing.T) {
	require.Equal(t, "/v1/orgs/{organizationSlug}/conversations/{resource}", requestLogPath("/v1/orgs/acme/conversations"))
	require.Equal(t, "/v1/orgs/{organizationSlug}/conversations/{resource}", requestLogPath("/v1/orgs/acme/conversations/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/messages"))
}
