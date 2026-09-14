package main

import (
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestDictionaryProjectAccess(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager", "member", "translator"} {
		t.Run(role, func(t *testing.T) {
			actor := dictionaryActor{userID: testDictionaryUserID, organizationID: testDictionaryOrgID, role: role}
			step := dictionaryRowStep("t.organization_id=$2", "project_1")
			step.args = []any{"project_1", testDictionaryOrgID, actor.canWrite(), testDictionaryUserID}
			api := &dictionaryAPI{pool: newDictionaryTestDB(t, step)}
			id, err := api.ownedProject(t.Context(), actor, " project_1 ")
			require.NoError(t, err)
			require.Equal(t, "project_1", id)
		})
	}
	t.Run("other tenant or inaccessible team", func(t *testing.T) {
		step := dictionaryRowStep("p.organization_id=$2")
		step.err = pgx.ErrNoRows
		api := &dictionaryAPI{pool: newDictionaryTestDB(t, step)}
		_, err := api.ownedProject(t.Context(), dictionaryActor{organizationID: testDictionaryOrgID}, "project_other")
		require.EqualError(t, err, "project_not_found")
	})
	t.Run("encoded identifier", func(t *testing.T) {
		require.Equal(t, "ext:provider:project", normalizeDictionaryProjectID("ext%253Aprovider%253Aproject"))
	})
}

func TestDictionaryProjectAttachmentIdempotency(t *testing.T) {
	for _, inserted := range []bool{true, false} {
		t.Run(map[bool]string{true: "new", false: "existing"}[inserted], func(t *testing.T) {
			affected := int64(0)
			status := 200
			if inserted {
				affected = 1
				status = 201
			}
			steps := []dictionaryDBStep{
				dictionaryRowStep("from projects p", "project_1"), dictionaryOwnedStep(),
				{kind: "begin"},
				{kind: "exec", sql: "pg_advisory_xact_lock", args: []any{"project_spellcheck_word_libraries:project_1"}},
				dictionaryRowStep("coalesce(max(priority),-1)+1", 3),
				{kind: "exec", sql: "p.organization_id=$1 and d.id=$3 and d.organization_id=$1", args: []any{testDictionaryOrgID, "project_1", testDictionaryID, 3}, affected: affected},
				dictionaryRowStep("select priority", 1),
				{kind: "commit"},
			}
			api, db := dictionaryTestAPI(t, "admin", steps...)
			rec := dictionaryRequestForTest(api, "POST", "/v1/orgs/acme/projects/project_1/dictionaries", `{"dictionaryId":"`+testDictionaryID+`"}`)
			require.Equal(t, status, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"priority":1`)
			require.Contains(t, rec.Body.String(), `"dictionary":`)
			require.True(t, db.committed)
		})
	}
	t.Run("dictionary side explicit priority", func(t *testing.T) {
		steps := []dictionaryDBStep{
			dictionaryOwnedStep(), dictionaryRowStep("from projects p", "project_1"),
			{kind: "begin"},
			{kind: "exec", sql: "pg_advisory_xact_lock"},
			{kind: "exec", sql: "on conflict do nothing", args: []any{testDictionaryOrgID, "project_1", testDictionaryID, 9}, affected: 1},
			dictionaryRowStep("select priority", 9),
			{kind: "commit"},
			{kind: "query", sql: "p.organization_id=$2", values: [][]any{{"project_1", "Project", 9}}},
		}
		api, _ := dictionaryTestAPI(t, "localization_manager", steps...)
		rec := dictionaryRequestForTest(api, "POST", testDictionaryBase+"/"+testDictionaryID+"/projects", `{"projectId":"project_1","priority":9}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"projects":[{"projectId":"project_1","projectName":"Project","priority":9}]}`, rec.Body.String())
	})
}

func TestDictionaryProjectListAndDetach(t *testing.T) {
	t.Run("list project dictionaries", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member", dictionaryRowStep("from projects p", "project_1"),
			dictionaryDBStep{kind: "query", sql: "order by a.priority,a.created_at,a.library_id", values: [][]any{append(dictionaryRecordValues(), 7)}},
		)
		rec := dictionaryRequestForTest(api, "GET", "/v1/orgs/acme/projects/project_1/dictionaries", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"priority":7`)
	})
	t.Run("detach via project", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "admin", dictionaryRowStep("from projects p", "project_1"), dictionaryDBStep{kind: "exec", sql: "project_id=$1 and library_id=$2 and organization_id=$3", args: []any{"project_1", testDictionaryID, testDictionaryOrgID}})
		rec := dictionaryRequestForTest(api, "DELETE", "/v1/orgs/acme/projects/project_1/dictionaries/"+testDictionaryID, "")
		require.Equal(t, 204, rec.Code)
		require.Empty(t, rec.Body.String())
	})
	t.Run("detach via dictionary", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "admin", dictionaryOwnedStep(), dictionaryDBStep{kind: "exec", sql: "library_id=$1 and project_id=$2 and organization_id=$3", args: []any{testDictionaryID, "project_1", testDictionaryOrgID}})
		rec := dictionaryRequestForTest(api, "DELETE", testDictionaryBase+"/"+testDictionaryID+"/projects/project_1", "")
		require.Equal(t, 204, rec.Code)
	})
}

func TestDictionaryProjectResolvedWords(t *testing.T) {
	t.Run("priority merge and version", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member", dictionaryRowStep("from projects p", "project_1"),
			dictionaryDBStep{kind: "query", sql: "d.status='active'", values: [][]any{append(dictionaryRecordValues(), 0)}},
			dictionaryDBStep{kind: "query", sql: "d.organization_id=$2 and d.status='active' and w.locale=$3", values: [][]any{{"AuthKit", "authkit", 0, testDictionaryTime, testDictionaryID}, {"authkit", "authkit", 10, testDictionaryTime, "other"}}},
		)
		rec := dictionaryRequestForTest(api, "GET", "/v1/orgs/acme/projects/project_1/dictionaries/resolved?locale=en_us", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"locale":"en-US","words":["AuthKit"],"dictionaryIds":["`+testDictionaryID+`"],"wordsVersion":"`+testDictionaryID+`:1,en-US"}`, rec.Body.String())
	})
	t.Run("no dictionaries yields arrays", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member", dictionaryRowStep("from projects p", "project_1"), dictionaryDBStep{kind: "query", sql: "d.status='active'"}, dictionaryDBStep{kind: "query", sql: "w.locale=$3"})
		rec := dictionaryRequestForTest(api, "GET", "/v1/orgs/acme/projects/project_1/dictionaries/resolved?locale=en", "")
		require.Equal(t, 200, rec.Code)
		require.JSONEq(t, `{"locale":"en","words":[],"dictionaryIds":[],"wordsVersion":"en"}`, rec.Body.String())
	})
}
