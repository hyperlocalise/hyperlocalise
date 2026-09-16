package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const testTeamID = testDictionaryID

func teamAuthStep() dictionaryDBStep {
	return dictionaryAuthStep()
}

func teamRecordValues() []any {
	return []any{testTeamID, testDictionaryOrgID, "platform", "Platform", testDictionaryTime, testDictionaryTime}
}

func teamOwnedRowStep() dictionaryDBStep {
	step := dictionaryRowStep("from teams where id=$1 and organization_id=$2", teamRecordValues()...)
	step.args = []any{testTeamID, testDictionaryOrgID}
	return step
}

func teamCreateSteps() []dictionaryDBStep {
	return []dictionaryDBStep{
		{kind: "begin"},
		{
			kind:   "row",
			sql:    "insert into teams",
			values: [][]any{teamRecordValues()},
		},
		{kind: "exec", sql: "insert into team_memberships"},
		{kind: "commit"},
	}
}

func teamListIDSteps(ids ...string) []dictionaryDBStep {
	rows := make([][]any, len(ids))
	for i, id := range ids {
		rows[i] = []any{id}
	}
	return []dictionaryDBStep{
		{kind: "query", sql: "select id from teams where organization_id", values: rows},
		{
			kind: "query",
			sql:  "member_count",
			values: [][]any{{
				testTeamID, "platform", "Platform", testDictionaryTime, testDictionaryTime, 1, ptrString("manager"),
			}},
		},
	}
}

func ptrString(value string) *string {
	return &value
}

func teamTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) (*teamAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{teamAuthStep()}, steps...)...)
	api := &teamAPI{
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
