package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const (
	testGlossaryID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testGlossaryBase = "/v1/orgs/acme/glossaries"
)

var testGlossaryTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func glossaryTestAPI(t *testing.T, role string) (*glossaryAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	return &glossaryAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		readCache:  scope.Valkey,
	}, scope
}

func glossaryRequest(api *glossaryAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func glossaryRequestForTest(api *glossaryAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustAttachGlossary(t *testing.T, scope *testenv.Scope, projectID, glossaryID string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_glossaries (organization_id, project_id, glossary_id, priority)
        values ($1, $2, $3, 0)`,
		scope.OrganizationID, projectID, glossaryID)
	require.NoError(t, err)
}

func mustGlossaryConcept(t *testing.T, scope *testenv.Scope, glossaryID, primary, subject, definition string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into glossary_concepts (id, glossary_id, primary_term, subject, definition, translatable, note, created_by_user_id)
        values ($1, $2, $3, $4, $5, true, '', $6)`,
		id, glossaryID, primary, subject, definition, scope.UserID)
	require.NoError(t, err)
	return id
}

func mustGlossaryTerm(t *testing.T, scope *testenv.Scope, glossaryID, conceptID, locale, term string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into glossary_terms (
            id, glossary_id, concept_id, locale, term, source_term, target_term, status, provenance, review_status
        ) values ($1, $2, $3, $4, $5, $5, $5, 'preferred', 'manual', 'approved')`,
		id, glossaryID, conceptID, locale, term)
	require.NoError(t, err)
	return id
}

func TestGlossaryUnavailableWithoutPool(t *testing.T) {
	rec := glossaryRequestForTest(&glossaryAPI{}, http.MethodGet, testGlossaryBase, "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "glossary_unavailable")
}

func TestGlossaryCreateListGet(t *testing.T) {
	t.Run("create org glossary", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries"), `{"name":"Product terms","sourceLocale":"en-US"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary"`)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
	t.Run("translator cannot create org glossary", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "translator")
		rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries"), `{"name":"Team terms","sourceLocale":"en-US","controlLevel":"org"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("list glossaries", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		first := scope.MustGlossary(t, "", "Product terms", "en-US")
		second := scope.MustGlossary(t, "", "Second", "en-US")
		external := scope.MustGlossary(t, "", "External", "en-US")
		_, err := scope.Pool.Exec(t.Context(), `update glossaries set source='external_tms' where id=$1`, external)
		require.NoError(t, err)
		scope.MustProject(t, scope.ProjectID, "Project")
		secondProject := "proj2_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
		scope.MustProject(t, secondProject, "Second")
		mustAttachGlossary(t, scope, scope.ProjectID, second)
		mustAttachGlossary(t, scope, scope.ProjectID, external)
		mustAttachGlossary(t, scope, secondProject, external)
		concept := mustGlossaryConcept(t, scope, first, "A", "", "")
		mustGlossaryTerm(t, scope, first, concept, "en-US", "One")
		mustGlossaryTerm(t, scope, first, concept, "fr-FR", "Deux")
		c2 := mustGlossaryConcept(t, scope, second, "B", "", "")
		mustGlossaryTerm(t, scope, second, c2, "en-US", "Alpha")
		mustGlossaryTerm(t, scope, second, c2, "fr-FR", "Beta")
		mustGlossaryTerm(t, scope, second, c2, "de-DE", "Gamma")
		mustGlossaryTerm(t, scope, second, c2, "es-ES", "Delta")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossaries"`)
		require.Contains(t, rec.Body.String(), `"total":3`)
		require.Contains(t, rec.Body.String(), `"projectCount":0`)
		require.Contains(t, rec.Body.String(), `"projectCount":1`)
		require.Contains(t, rec.Body.String(), `"projectCount":2`)
		require.Contains(t, rec.Body.String(), `"termCount":2`)
		require.Contains(t, rec.Body.String(), `"termCount":4`)
	})
	t.Run("get glossary", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		scope.MustProject(t, scope.ProjectID, "Project")
		mustAttachGlossary(t, scope, scope.ProjectID, id)
		concept := mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment")
		mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
		mustGlossaryTerm(t, scope, id, concept, "fr-FR", "Paiement")
		mustGlossaryTerm(t, scope, id, concept, "de-DE", "Kasse")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"canContribute":true`)
		require.Contains(t, rec.Body.String(), `"termCount":3`)
	})
	t.Run("export returns csv", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		concept := mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment step")
		mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/export?format=csv"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Header().Get("Content-Type"), "text/csv")
		require.Contains(t, rec.Body.String(), "Checkout")
		require.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
	})
	t.Run("import backup still 501", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/import-reports/"+uuid.NewString()+"/backup"), "")
		require.Equal(t, 501, rec.Code)
		require.Contains(t, rec.Body.String(), "not_implemented")
	})
	t.Run("concepts page returns envelope", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/concepts/page"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"concepts"`)
		require.Contains(t, rec.Body.String(), `"pagination"`)
	})
	t.Run("import dry preview", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		body := `{"format":"csv","content":"conceptId,locale,term\nc1,en-US,Hello","mode":"preview"}`
		rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries/"+id+"/concepts/import"), body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"planned"`)
		require.Contains(t, rec.Body.String(), `"reportId"`)
	})
	t.Run("malformed id never queries", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "member")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/not-a-uuid"), "")
		require.Equal(t, 404, rec.Code)
	})
}

func TestGlossaryRequestLogPath(t *testing.T) {
	path := "/v1/orgs/acme/glossaries/" + testGlossaryID + "/concepts"
	require.Equal(t, "/v1/orgs/{organizationSlug}/glossaries/{resource}", requestLogPath(path))
}

func TestGlossaryCreateBodyRoundTrip(t *testing.T) {
	payload := glossaryPayload{Name: strPtr("  Brand  "), SourceLocale: strPtr("en_US")}
	require.NoError(t, payload.validateCreate())
	require.Equal(t, "Brand", *payload.Name)
	require.Equal(t, "en-US", *payload.SourceLocale)
	body, err := json.Marshal(map[string]any{"glossary": map[string]string{"id": testGlossaryID}})
	require.NoError(t, err)
	require.Contains(t, string(body), testGlossaryID)
}

func strPtr(v string) *string { return &v }

func TestGlossaryActorCanContribute(t *testing.T) {
	teamID := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	teamGlossary := glossaryRecord{ControlLevel: "team", Source: "native", TeamID: &teamID}
	orgGlossary := glossaryRecord{ControlLevel: "org", Source: "native", TeamID: &teamID}
	externalTeam := glossaryRecord{ControlLevel: "team", Source: "phrase", TeamID: &teamID}
	teamWithoutID := glossaryRecord{ControlLevel: "team", Source: "native", TeamID: nil}

	require.True(t, glossaryActor{role: "admin"}.canContribute(orgGlossary))
	require.True(t, glossaryActor{role: "localization_manager"}.canContribute(orgGlossary))
	require.True(t, glossaryActor{role: "translator"}.canContribute(teamGlossary))
	require.False(t, glossaryActor{role: "translator"}.canContribute(orgGlossary))
	require.False(t, glossaryActor{role: "translator"}.canContribute(externalTeam))
	require.False(t, glossaryActor{role: "translator"}.canContribute(teamWithoutID))
	require.False(t, glossaryActor{role: "member"}.canContribute(teamGlossary))
	require.False(t, glossaryActor{role: "reviewer"}.canContribute(teamGlossary))
}

func TestGlossaryTeamPrivateAccessDenied(t *testing.T) {
	t.Run("get glossary", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "translator")
		teamID := scope.MustTeam(t, "platform", "Platform", "")
		id := uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into glossaries (
                id, organization_id, created_by_user_id, name, source_locale, status, source, control_level, team_id
            ) values ($1, $2, $3, 'Private', 'en-US', 'active', 'native', 'team', $4)`,
			id, scope.OrganizationID, scope.UserID, teamID)
		require.NoError(t, err)
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary_not_found"`)
	})

	t.Run("concepts history", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "translator")
		teamID := scope.MustTeam(t, "platform", "Platform", "")
		id := uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into glossaries (
                id, organization_id, created_by_user_id, name, source_locale, status, source, control_level, team_id
            ) values ($1, $2, $3, 'Private', 'en-US', 'active', 'native', 'team', $4)`,
			id, scope.OrganizationID, scope.UserID, teamID)
		require.NoError(t, err)
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/concepts/history"), "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary_not_found"`)
	})
}

type glossarySingleConnectionPool struct {
	*pgxpool.Pool
	inTransaction bool
	extraAcquires int
}

func (p *glossarySingleConnectionPool) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := p.Pool.Begin(ctx)
	if err == nil {
		p.inTransaction = true
	}
	return tx, err
}

type deadlineRow struct{}

func (deadlineRow) Scan(...any) error { return context.DeadlineExceeded }

func (p *glossarySingleConnectionPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if p.inTransaction {
		p.extraAcquires++
		return deadlineRow{}
	}
	return p.Pool.QueryRow(ctx, sql, args...)
}

func TestGlossaryCreateUsesTransactionConnection(t *testing.T) {
	for _, tc := range []struct {
		name, role string
		member     bool
		wantStatus int
	}{
		{name: "manager attaches project", role: "admin", member: true, wantStatus: 201},
		{name: "translator checks team membership", role: "translator", member: true, wantStatus: 201},
		{name: "translator outside team remains forbidden", role: "translator", member: false, wantStatus: 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := glossaryTestAPI(t, tc.role)
			teamRole := ""
			if tc.member {
				teamRole = "member"
			}
			teamID := scope.MustTeam(t, "platform", "Platform", teamRole)
			scope.MustProject(t, scope.ProjectID, "Project")
			_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1, source_locale='en-US' where id=$2`, teamID, scope.ProjectID)
			require.NoError(t, err)
			pool := &glossarySingleConnectionPool{Pool: scope.Pool}
			api.pool = pool
			rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries"),
				`{"name":"Team terms","sourceLocale":"en-US","controlLevel":"team","projectIds":["`+scope.ProjectID+`"]}`)
			require.Equal(t, tc.wantStatus, rec.Code, rec.Body.String())
			require.Zero(t, pool.extraAcquires, "creation must not acquire another connection while holding a transaction")
			if tc.wantStatus == 201 {
				require.Contains(t, rec.Body.String(), `"projectCount":1`)
			} else {
				require.Contains(t, rec.Body.String(), `"error":"forbidden"`)
			}
		})
	}
}
