package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testGlossaryID     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testGlossaryOrgID  = "22222222-2222-4222-8222-222222222222"
	testGlossaryUserID = "33333333-3333-4333-8333-333333333333"
	testGlossaryBase   = "/api/go-svc/v1/orgs/acme/glossaries"
)

var testGlossaryTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func glossaryRecordValues() []any {
	userID := testGlossaryUserID
	coverage := []byte(`[]`)
	caps := []byte(`{}`)
	return []any{
		testGlossaryID, testGlossaryOrgID, &userID, "Product terms", "desc", "en-US", nil,
		"active", "native", "org", nil, nil, nil, nil, nil, coverage, nil, nil, caps, nil,
		nil, nil, nil, testGlossaryTime, testGlossaryTime,
	}
}

func glossaryAuthStep() dictionaryDBStep {
	step := dictionaryRowStep("m.workos_membership_id not in ('', 'replacing')", testGlossaryUserID, testGlossaryOrgID, "om_live", "org_live")
	step.args = []any{"user_live", "acme"}
	return step
}

func glossaryOwnedStep() dictionaryDBStep {
	step := dictionaryRowStep("g.id=$1 and", glossaryRecordValues()...)
	step.args = []any{testGlossaryID, testGlossaryOrgID, testGlossaryUserID, true}
	return step
}

func glossaryTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) (*glossaryAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{glossaryAuthStep()}, steps...)...)
	api := &glossaryAPI{pool: db, membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		require.Equal(t, "om_live", id)
		return &workos.UserOrganizationMembership{ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: role}}, nil
	}}
	return api, db
}

func glossaryRequestForTest(api *glossaryAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
}

func TestGlossaryCreateListGet(t *testing.T) {
	t.Run("create org glossary", func(t *testing.T) {
		var nilTeamID *string
		step := dictionaryRowStep("insert into glossaries", glossaryRecordValues()...)
		step.args = []any{testGlossaryOrgID, testGlossaryUserID, "Product terms", "", "en-US", "org", nilTeamID}
		api, db := glossaryTestAPI(t, "admin",
			dictionaryDBStep{kind: "begin"},
			step,
			dictionaryDBStep{kind: "commit"},
		)
		rec := glossaryRequestForTest(api, "POST", testGlossaryBase, `{"name":"Product terms","sourceLocale":"en-US"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary"`)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.True(t, db.committed)
	})
	t.Run("translator cannot create org glossary", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "translator")
		rec := glossaryRequestForTest(api, "POST", testGlossaryBase, `{"name":"Team terms","sourceLocale":"en-US","controlLevel":"org"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("list glossaries", func(t *testing.T) {
		listStep := dictionaryDBStep{kind: "query", sql: "from glossaries g where", values: [][]any{glossaryRecordValues()}}
		listStep.args = []any{testGlossaryOrgID, testGlossaryUserID, true, 50, 0}
		countStep := dictionaryRowStep("select count(*) from glossaries g where", 1)
		countStep.args = []any{testGlossaryOrgID, testGlossaryUserID, true}
		projectCount := dictionaryRowStep("from project_glossaries a join projects", 0)
		projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
		termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 2)
		termCount.args = []any{testGlossaryID}
		api, _ := glossaryTestAPI(t, "admin", listStep, countStep, projectCount, termCount)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossaries"`)
		require.Contains(t, rec.Body.String(), `"total":1`)
	})
	t.Run("get glossary", func(t *testing.T) {
		projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
		projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
		termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 3)
		termCount.args = []any{testGlossaryID}
		api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount, termCount)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"canContribute":true`)
		require.Contains(t, rec.Body.String(), `"termCount":3`)
	})
	t.Run("export returns 501", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "admin")
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+"/export", "")
		require.Equal(t, 501, rec.Code)
		require.Contains(t, rec.Body.String(), "not_implemented")
	})
	t.Run("malformed id never queries", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "member")
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/not-a-uuid", "")
		require.Equal(t, 404, rec.Code)
	})
}

func TestGlossaryRequestLogPath(t *testing.T) {
	path := publicPathPrefix + "/v1/orgs/acme/glossaries/" + testGlossaryID + "/concepts"
	require.Equal(t, publicPathPrefix+"/v1/orgs/{organizationSlug}/glossaries/{resource}", requestLogPath(path))
}

func TestNormalizeMemorySourceText(t *testing.T) {
	require.Equal(t, "hello world", normalizeMemorySourceText("  Hello   WORLD  "))
	require.Equal(t, "café", normalizeMemorySourceText("CAFÉ"))
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
