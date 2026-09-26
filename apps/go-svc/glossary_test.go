package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testGlossaryID     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testGlossaryOrgID  = "22222222-2222-4222-8222-222222222222"
	testGlossaryUserID = "33333333-3333-4333-8333-333333333333"
	testGlossaryBase   = "/v1/orgs/acme/glossaries"
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
	mux.ServeHTTP(rec, req)
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
		secondID := "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
		externalID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
		second := glossaryRecordValues()
		second[0] = secondID
		external := glossaryRecordValues()
		external[0] = externalID
		external[8] = "external_tms"
		listStep := dictionaryDBStep{kind: "query", sql: "from glossaries g where", values: [][]any{glossaryRecordValues(), second, external}}
		listStep.args = []any{testGlossaryOrgID, testGlossaryUserID, true, 50, 0}
		countStep := dictionaryRowStep("select count(*) from glossaries g where", 3)
		countStep.args = []any{testGlossaryOrgID, testGlossaryUserID, true}
		projectCount := dictionaryDBStep{kind: "query", sql: "from project_glossaries a join projects", values: [][]any{
			{testGlossaryID, 0},
			{secondID, 1},
			{externalID, 2},
		}}
		projectCount.args = []any{[]string{testGlossaryID, secondID, externalID}, testGlossaryOrgID, true, testGlossaryUserID}
		termCount := dictionaryDBStep{kind: "query", sql: "from glossary_terms where glossary_id=any", values: [][]any{
			{testGlossaryID, 2},
			{secondID, 4},
		}}
		termCount.args = []any{[]string{testGlossaryID, secondID}}
		api, _ := glossaryTestAPI(t, "admin", listStep, countStep, projectCount, termCount)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase, "")
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
	t.Run("export returns csv", func(t *testing.T) {
		conceptID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
		termID := "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
		concepts := dictionaryDBStep{kind: "query", sql: "from glossary_concepts c where c.glossary_id=$1", values: [][]any{{
			conceptID, "Checkout", "Commerce", "Payment step", true, "", nil, nil, testGlossaryTime, testGlossaryTime,
		}}}
		concepts.args = []any{testGlossaryID}
		terms := dictionaryDBStep{kind: "query", sql: "from glossary_terms t where t.glossary_id=$1", values: [][]any{{
			termID, conceptID, "en-US", "Checkout", "", "", "", nil, nil, nil, nil, "preferred", false, false, "manual", "approved", testGlossaryTime, testGlossaryTime,
		}}}
		terms.args = []any{testGlossaryID, []string{conceptID}}
		api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), concepts, terms)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+"/export?format=csv", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Header().Get("Content-Type"), "text/csv")
		require.Contains(t, rec.Body.String(), "Checkout")
		require.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
	})
	t.Run("import backup still 501", func(t *testing.T) {
		reportID := "ffffffff-ffff-4fff-8fff-ffffffffffff"
		api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep())
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+"/import-reports/"+reportID+"/backup", "")
		require.Equal(t, 501, rec.Code)
		require.Contains(t, rec.Body.String(), "not_implemented")
	})
	t.Run("concepts page returns envelope", func(t *testing.T) {
		conceptID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
		list := dictionaryDBStep{kind: "query", sql: "from glossary_concepts c where", values: [][]any{{
			conceptID, testGlossaryID, "Checkout", "Commerce", "Payment", "approved", testGlossaryTime, testGlossaryTime,
		}}}
		list.args = []any{testGlossaryID, 51}
		counts := dictionaryDBStep{kind: "query", sql: "from glossary_terms where concept_id = any", values: [][]any{{conceptID, 1, 1}}}
		counts.args = []any{[]string{conceptID}}
		total := dictionaryRowStep("select count(*) from glossary_concepts c where", 1)
		total.args = []any{testGlossaryID}
		api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), list, counts, total)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+"/concepts/page", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"concepts"`)
		require.Contains(t, rec.Body.String(), `"pagination"`)
	})
	t.Run("import dry preview", func(t *testing.T) {
		insertRun := dictionaryRowStep("insert into glossary_import_runs", "ffffffff-ffff-4fff-8fff-ffffffffffff")
		api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), insertRun)
		body := `{"format":"csv","content":"conceptId,locale,term\nc1,en-US,Hello","mode":"preview"}`
		rec := glossaryRequestForTest(api, "POST", testGlossaryBase+"/"+testGlossaryID+"/concepts/import", body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"planned"`)
		require.Contains(t, rec.Body.String(), `"reportId"`)
	})
	t.Run("malformed id never queries", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "member")
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/not-a-uuid", "")
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
	// Translators without team/project membership must not learn that a
	// team-private glossary exists via GET or history (same class as #2378).
	denied := dictionaryDBStep{
		kind: "row",
		sql:  "g.id=$1 and",
		args: []any{testGlossaryID, testGlossaryOrgID, testGlossaryUserID, false},
		err:  pgx.ErrNoRows,
	}

	t.Run("get glossary", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "translator", denied)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary_not_found"`)
	})

	t.Run("concepts history", func(t *testing.T) {
		api, _ := glossaryTestAPI(t, "translator", denied)
		rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+"/concepts/history", "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary_not_found"`)
	})
}

// Model a pool whose last connection is held by the transaction. A pool-level
// query would wait until its context expires; fail immediately to keep this
// regression test deterministic. Transaction queries use the underlying DB.
type glossarySingleConnectionPool struct {
	dictionaryPool
	inTransaction bool
	extraAcquires int
}

func (p *glossarySingleConnectionPool) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := p.dictionaryPool.Begin(ctx)
	if err == nil {
		p.inTransaction = true
	}
	return tx, err
}

func (p *glossarySingleConnectionPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if p.inTransaction {
		p.extraAcquires++
		return dictionaryTestRow{err: context.DeadlineExceeded}
	}
	return p.dictionaryPool.QueryRow(ctx, sql, args...)
}

func TestGlossaryCreateUsesTransactionConnection(t *testing.T) {
	const projectID = "project-one"
	const teamID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
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
			project := dictionaryRowStep("select p.id from projects p where", projectID)
			project.args = []any{projectID, testGlossaryOrgID, tc.role == "admin", testGlossaryUserID}
			lock := dictionaryRowStep("for update", projectID, "native", strPtr("en-US"), strPtr(teamID))
			lock.args = []any{projectID, testGlossaryOrgID}
			team := dictionaryRowStep("select id from teams where", teamID)
			team.args = []any{teamID, testGlossaryOrgID}
			steps := []dictionaryDBStep{{kind: "begin"}, project, lock, team}
			if tc.role == "translator" {
				membership := dictionaryRowStep("select t.id from teams t join team_memberships", teamID)
				membership.args = []any{teamID, testGlossaryOrgID, testGlossaryUserID}
				if !tc.member {
					membership.err = pgx.ErrNoRows
				}
				steps = append(steps, membership)
			}
			if tc.wantStatus == 201 {
				values := glossaryRecordValues()
				values[9], values[10] = "team", strPtr(teamID)
				insert := dictionaryRowStep("insert into glossaries", values...)
				insert.args = []any{testGlossaryOrgID, testGlossaryUserID, "Team terms", "", "en-US", "team", strPtr(teamID)}
				steps = append(steps, insert,
					dictionaryDBStep{kind: "exec", sql: "insert into project_glossaries", args: []any{testGlossaryOrgID, projectID, testGlossaryID}, affected: 1},
					dictionaryDBStep{kind: "commit"})
			}
			api, db := glossaryTestAPI(t, tc.role, steps...)
			pool := &glossarySingleConnectionPool{dictionaryPool: db}
			api.pool = pool
			rec := glossaryRequestForTest(api, "POST", testGlossaryBase,
				`{"name":"Team terms","sourceLocale":"en-US","controlLevel":"team","projectIds":["project-one"]}`)
			require.Equal(t, tc.wantStatus, rec.Code, rec.Body.String())
			require.Zero(t, pool.extraAcquires, "creation must not acquire another connection while holding a transaction")
			require.Equal(t, tc.wantStatus == 201, db.committed)
			require.Equal(t, 1, db.rollbacks, "transaction cleanup must run on success and failure")
			if tc.wantStatus == 201 {
				require.Contains(t, rec.Body.String(), `"projectCount":1`)
			} else {
				require.Contains(t, rec.Body.String(), `"error":"forbidden"`)
			}
		})
	}
}
