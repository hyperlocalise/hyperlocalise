package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestProjectQaReportRejectsProviderProject(t *testing.T) {
	api := &qaReportAPI{
		pool: newDictionaryTestDB(t,
			qaReportAuthStep(),
			dictionaryDBStep{
				kind:   "row",
				sql:    "p.source",
				values: [][]any{{"project_native", "external_tms", "off", nil}},
			},
		),
		membership: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{
				ID: "om_live", UserID: "user_live", OrganizationID: "org_live",
				Status: "active", Role: &workos.SlimRole{Slug: "admin"},
			}, nil
		},
	}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/projects/project_native/qa-reports", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "qa_scan_not_supported")
}
