package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestProjectDeleteAndGlossaryDetachSerializeOnGlossaryLock(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	teamID := scope.MustTeam(t, "shared-team", "Shared Team", "")
	glossaryID := scope.MustTeamGlossary(t, "", "Shared Glossary", "en", teamID)

	projectA := scope.ProjectID
	scope.MustProject(t, projectA, "Project A")
	projectB := uniqueProjectID("detach_race_")
	scope.MustProject(t, projectB, "Project B")
	scope.MustAttachGlossaryToProject(t, projectA, glossaryID, 0)
	scope.MustAttachGlossaryToProject(t, projectB, glossaryID, 0)

	projAPI := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	glossAPI := &glossaryAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	detachDone := make(chan *httptest.ResponseRecorder, 1)

	projAPI.testAfterGlossaryLock = func() {
		go func() {
			detachDone <- glossaryRequest(glossAPI, scope, http.MethodDelete,
				scope.OrgPath("/glossaries/"+glossaryID+"/projects/"+projectB), "")
		}()

		require.Eventually(t, func() bool {
			var waiting int
			err := scope.Pool.QueryRow(context.Background(), `
				select count(*) from pg_stat_activity
				where wait_event_type = 'Lock'
				  and state = 'active'
				  and query ilike '%from glossaries%for update%'
				  and pid <> pg_backend_pid()`).Scan(&waiting)
			require.NoError(t, err)
			return waiting > 0
		}, 5*time.Second, 20*time.Millisecond,
			"expected the concurrent detach to be genuinely blocked on the glossary row lock, per pg_stat_activity")

		select {
		case resp := <-detachDone:
			t.Fatalf("detach completed before the delete transaction released the glossary lock (status %d, body %s)", resp.Code, resp.Body.String())
		default:
		}
	}

	rec := projectMutationRequest(projAPI, scope, http.MethodDelete, scope.OrgPath("/projects/"+projectA), nil)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	var detachResp *httptest.ResponseRecorder
	select {
	case detachResp = <-detachDone:
	case <-time.After(5 * time.Second):
		t.Fatal("detach never completed after the delete transaction committed")
	}
	require.Equal(t, http.StatusForbidden, detachResp.Code, detachResp.Body.String())
	require.Contains(t, detachResp.Body.String(), `"glossary_team_project_required"`)

	var nativeCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
		select count(*) from project_glossaries pg
		join projects p on p.id = pg.project_id
		where pg.glossary_id=$1 and p.source='native'`, glossaryID).Scan(&nativeCount))
	require.Equal(t, 1, nativeCount, "exactly one native project (B) must remain attached; it must never reach zero")
}
