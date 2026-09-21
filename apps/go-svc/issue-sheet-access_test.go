package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestAssertAssignableAssignee(t *testing.T) {
	t.Parallel()

	t.Run("rejects outsider", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "row",
			sql:    "select exists",
			args:   []any{"org_1", "user_outsider", "proj_1"},
			values: [][]any{{false}},
		})
		api := &issueSheetAPI{pool: db}
		err := api.assertAssignableAssignee(context.Background(), "org_1", "proj_1", "user_outsider")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 400, failure.status)
		require.Equal(t, "assignee_not_assignable", failure.code)
	})

	t.Run("allows eligible member", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "row",
			sql:    "select exists",
			args:   []any{"org_1", "user_admin", "proj_1"},
			values: [][]any{{true}},
		})
		api := &issueSheetAPI{pool: db}
		require.NoError(t, api.assertAssignableAssignee(context.Background(), "org_1", "proj_1", "user_admin"))
	})
}

func TestAssertTranslationKeyInProject(t *testing.T) {
	t.Parallel()

	t.Run("missing key", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind: "row",
			sql:  "from project_translation_keys",
			args: []any{"key_missing", "org_1", "proj_1"},
			err:  pgx.ErrNoRows,
		})
		api := &issueSheetAPI{pool: db}
		err := api.assertTranslationKeyInProject(context.Background(), "org_1", "proj_1", "key_missing")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 400, failure.status)
		require.Equal(t, "translation_key_not_found", failure.code)
	})

	t.Run("key in project", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "row",
			sql:    "from project_translation_keys",
			args:   []any{"key_ok", "org_1", "proj_1"},
			values: [][]any{{"key_ok"}},
		})
		api := &issueSheetAPI{pool: db}
		require.NoError(t, api.assertTranslationKeyInProject(context.Background(), "org_1", "proj_1", "key_ok"))
	})
}

func TestLookupAccessibleRelatedIssue(t *testing.T) {
	t.Parallel()
	actor := issueSheetActor{userID: "user_1", organizationID: "org_1", role: "translator"}

	t.Run("resolves by identifier after uuid miss", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t,
			dictionaryDBStep{
				kind: "row",
				sql:  "and i.id = $2",
				args: []any{"org_1", "HL-42", false, "user_1"},
				err:  pgx.ErrNoRows,
			},
			dictionaryDBStep{
				kind:   "row",
				sql:    "and i.identifier = $2",
				args:   []any{"org_1", "HL-42", false, "user_1"},
				values: [][]any{{"issue-uuid", "proj_1", "Broken copy", "open"}},
			},
		)
		api := &issueSheetAPI{pool: db}
		id, projectID, title, status, err := api.lookupAccessibleRelatedIssue(context.Background(), actor, "HL-42")
		require.NoError(t, err)
		require.Equal(t, "issue-uuid", id)
		require.Equal(t, "proj_1", projectID)
		require.Equal(t, "Broken copy", title)
		require.Equal(t, "open", status)
	})

	t.Run("hides inaccessible issue", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t,
			dictionaryDBStep{
				kind: "row",
				sql:  "and i.id = $2",
				args: []any{"org_1", "secret-issue", false, "user_1"},
				err:  pgx.ErrNoRows,
			},
			dictionaryDBStep{
				kind: "row",
				sql:  "and i.identifier = $2",
				args: []any{"org_1", "secret-issue", false, "user_1"},
				err:  pgx.ErrNoRows,
			},
		)
		api := &issueSheetAPI{pool: db}
		_, _, _, _, err := api.lookupAccessibleRelatedIssue(context.Background(), actor, "secret-issue")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, 404, failure.status)
		require.Equal(t, "related_issue_not_found", failure.code)
	})
}

func TestWouldCreateCycle(t *testing.T) {
	t.Parallel()

	t.Run("detects direct cycle", func(t *testing.T) {
		t.Parallel()
		// Adding A -> B while B -> A already exists.
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "query",
			sql:    "from issue_sheet_relationships",
			args:   []any{"org_1", "blocks", []string{"B"}},
			values: [][]any{{"A"}},
		})
		cycle, err := wouldCreateCycle(context.Background(), db, "org_1", "blocks", "A", "B")
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("detects transitive cycle", func(t *testing.T) {
		t.Parallel()
		// Adding A -> C while C -> B -> A exists.
		db := newDictionaryTestDB(t,
			dictionaryDBStep{
				kind:   "query",
				sql:    "from issue_sheet_relationships",
				args:   []any{"org_1", "blocks", []string{"C"}},
				values: [][]any{{"B"}},
			},
			dictionaryDBStep{
				kind:   "query",
				sql:    "from issue_sheet_relationships",
				args:   []any{"org_1", "blocks", []string{"B"}},
				values: [][]any{{"A"}},
			},
		)
		cycle, err := wouldCreateCycle(context.Background(), db, "org_1", "blocks", "A", "C")
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("allows acyclic diamond", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t,
			dictionaryDBStep{
				kind:   "query",
				sql:    "from issue_sheet_relationships",
				args:   []any{"org_1", "blocks", []string{"D"}},
				values: [][]any{{"E"}},
			},
			dictionaryDBStep{
				kind:   "query",
				sql:    "from issue_sheet_relationships",
				args:   []any{"org_1", "blocks", []string{"E"}},
				values: [][]any{},
			},
		)
		cycle, err := wouldCreateCycle(context.Background(), db, "org_1", "blocks", "A", "D")
		require.NoError(t, err)
		require.False(t, cycle)
	})

	t.Run("duplicate_of cycle uses same graph walk", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "query",
			sql:    "from issue_sheet_relationships",
			args:   []any{"org_1", "duplicate_of", []string{"Y"}},
			values: [][]any{{"X"}},
		})
		cycle, err := wouldCreateCycle(context.Background(), db, "org_1", "duplicate_of", "X", "Y")
		require.NoError(t, err)
		require.True(t, cycle)
	})

	t.Run("empty frontier is not a cycle", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind:   "query",
			sql:    "from issue_sheet_relationships",
			args:   []any{"org_1", "blocks", []string{"Z"}},
			values: [][]any{},
		})
		cycle, err := wouldCreateCycle(context.Background(), db, "org_1", "blocks", "A", "Z")
		require.NoError(t, err)
		require.False(t, cycle)
	})

	t.Run("propagates query errors", func(t *testing.T) {
		t.Parallel()
		db := newDictionaryTestDB(t, dictionaryDBStep{
			kind: "query",
			sql:  "from issue_sheet_relationships",
			err:  errors.New("db down"),
		})
		_, err := wouldCreateCycle(context.Background(), db, "org_1", "blocks", "A", "B")
		require.EqualError(t, err, "db down")
	})
}
