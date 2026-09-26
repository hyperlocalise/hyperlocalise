package main

import (
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestAssertAssignableAssignee(t *testing.T) {
	t.Run("rejects outsider", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		api := &issueSheetAPI{pool: scope.Pool}
		err := api.assertAssignableAssignee(t.Context(), scope.OrganizationID, scope.ProjectID, uuid.NewString())
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 400, failure.status)
		require.Equal(t, "assignee_not_assignable", failure.code)
	})

	t.Run("allows eligible member", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		api := &issueSheetAPI{pool: scope.Pool}
		require.NoError(t, api.assertAssignableAssignee(t.Context(), scope.OrganizationID, scope.ProjectID, scope.UserID))
	})
}

func TestAssertTranslationKeyInProject(t *testing.T) {
	t.Run("missing key", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		api := &issueSheetAPI{pool: scope.Pool}
		err := api.assertTranslationKeyInProject(t.Context(), scope.OrganizationID, scope.ProjectID, uuid.NewString())
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 400, failure.status)
		require.Equal(t, "translation_key_not_found", failure.code)
	})

	t.Run("key in project", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		keyID := uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into project_translation_keys (
                id, organization_id, project_id, key, source_text, normalized_source_text
            ) values ($1, $2, $3, 'hello', 'Hello', 'hello')`,
			keyID, scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)
		api := &issueSheetAPI{pool: scope.Pool}
		require.NoError(t, api.assertTranslationKeyInProject(t.Context(), scope.OrganizationID, scope.ProjectID, keyID))
	})
}

func TestLookupAccessibleRelatedIssue(t *testing.T) {
	t.Run("resolves by identifier after uuid miss", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		scope.MustTeam(t, "default", "Default", "member")
		id, identifier := mustIssueSheetIssue(t, scope, 42, "Broken copy")
		api := &issueSheetAPI{pool: scope.Pool}
		actor := issueSheetActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: "translator"}
		found, projectID, title, status, err := api.lookupAccessibleRelatedIssue(t.Context(), actor, identifier)
		require.NoError(t, err)
		require.Equal(t, id, found)
		require.Equal(t, scope.ProjectID, projectID)
		require.Equal(t, "Broken copy", title)
		require.Equal(t, "open", status)
	})

	t.Run("hides inaccessible issue", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		api := &issueSheetAPI{pool: scope.Pool}
		actor := issueSheetActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: "translator"}
		_, _, _, _, err := api.lookupAccessibleRelatedIssue(t.Context(), actor, "secret-issue")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 404, failure.status)
		require.Equal(t, "related_issue_not_found", failure.code)
	})
}

func TestWouldCreateCycle(t *testing.T) {
	mustRel := func(t *testing.T, scope *testenv.Scope, from, to, kind string) {
		t.Helper()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into issue_sheet_relationships (organization_id, project_id, issue_id, related_issue_id, kind)
            values ($1, $2, $3, $4, $5)`,
			scope.OrganizationID, scope.ProjectID, from, to, kind)
		require.NoError(t, err)
	}

	t.Run("detects direct cycle", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		a, _ := mustIssueSheetIssue(t, scope, 1, "A")
		b, _ := mustIssueSheetIssue(t, scope, 2, "B")
		mustRel(t, scope, b, a, "blocks")
		cycle, err := wouldCreateCycle(t.Context(), scope.Pool, scope.OrganizationID, "blocks", a, b)
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("detects transitive cycle", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		a, _ := mustIssueSheetIssue(t, scope, 1, "A")
		b, _ := mustIssueSheetIssue(t, scope, 2, "B")
		c, _ := mustIssueSheetIssue(t, scope, 3, "C")
		mustRel(t, scope, c, b, "blocks")
		mustRel(t, scope, b, a, "blocks")
		cycle, err := wouldCreateCycle(t.Context(), scope.Pool, scope.OrganizationID, "blocks", a, c)
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("allows acyclic diamond", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		a, _ := mustIssueSheetIssue(t, scope, 1, "A")
		d, _ := mustIssueSheetIssue(t, scope, 2, "D")
		e, _ := mustIssueSheetIssue(t, scope, 3, "E")
		mustRel(t, scope, d, e, "blocks")
		cycle, err := wouldCreateCycle(t.Context(), scope.Pool, scope.OrganizationID, "blocks", a, d)
		require.NoError(t, err)
		require.False(t, cycle)
	})

	t.Run("duplicate_of cycle uses same graph walk", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		x, _ := mustIssueSheetIssue(t, scope, 1, "X")
		y, _ := mustIssueSheetIssue(t, scope, 2, "Y")
		mustRel(t, scope, y, x, "duplicate_of")
		cycle, err := wouldCreateCycle(t.Context(), scope.Pool, scope.OrganizationID, "duplicate_of", x, y)
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("empty frontier is not a cycle", func(t *testing.T) {
		_, scope := issueSheetTestAPI(t, true)
		a, _ := mustIssueSheetIssue(t, scope, 1, "A")
		z, _ := mustIssueSheetIssue(t, scope, 2, "Z")
		cycle, err := wouldCreateCycle(t.Context(), scope.Pool, scope.OrganizationID, "blocks", a, z)
		require.NoError(t, err)
		require.False(t, cycle)
	})

	t.Run("propagates query errors", func(t *testing.T) {
		testenv.Require(t)
		closed, err := pgxpool.New(t.Context(), os.Getenv(testenv.EnvDatabaseURL))
		require.NoError(t, err)
		closed.Close()
		_, err = wouldCreateCycle(t.Context(), closed, uuid.NewString(), "blocks", uuid.NewString(), uuid.NewString())
		require.Error(t, err)
	})
}
