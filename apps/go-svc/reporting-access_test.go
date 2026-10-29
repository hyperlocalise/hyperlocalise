package main

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestReportingProjectIDsMatchHonoTeamAccess(t *testing.T) {
	t.Run("team member with default team membership", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "translator"})
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		scope.MustTeam(t, "default", "Default", "member")
		mine := scope.MustTeam(t, "mine", "Mine", "member")
		theirs := scope.MustTeam(t, "theirs", "Theirs", "")
		foreign := other.MustTeam(t, "mine", "Mine", "")

		visible := mustReportingProject(t, scope, "rp_mine", &mine)
		mustReportingProject(t, scope, "rp_theirs", &theirs)
		legacy := mustReportingProject(t, scope, "rp_legacy", nil)
		mustReportingProject(t, scope, "rp_foreign", &foreign)

		ids, err := reportingProjectIDs(t.Context(), scope.Pool, reportingActorFor(scope, "translator"))
		require.NoError(t, err)
		require.ElementsMatch(t, []string{visible, legacy}, ids)
	})

	t.Run("default team without membership hides null-team projects", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "translator"})
		scope.MustTeam(t, "default", "Default", "")
		mustReportingProject(t, scope, "rp_legacy", nil)

		ids, err := reportingProjectIDs(t.Context(), scope.Pool, reportingActorFor(scope, "translator"))
		require.NoError(t, err)
		require.Empty(t, ids)
		require.NotNil(t, ids)
	})

	t.Run("no default team yet hides null-team projects without writing", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "translator"})
		legacy := mustReportingProject(t, scope, "rp_legacy", nil)

		ids, err := reportingProjectIDs(t.Context(), scope.Pool, reportingActorFor(scope, "translator"))
		require.NoError(t, err)
		require.Empty(t, ids)

		var teams int
		var teamID *string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from teams where organization_id=$1`, scope.OrganizationID).Scan(&teams))
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select team_id from projects where id=$1`, legacy).Scan(&teamID))
		require.Zero(t, teams)
		require.Nil(t, teamID)
	})

	t.Run("org-wide roles see every project", func(t *testing.T) {
		for _, role := range []string{"admin", "localization_manager"} {
			scope := testenv.Seed(t, testenv.Options{Role: role})
			theirs := scope.MustTeam(t, "theirs", "Theirs", "")
			a := mustReportingProject(t, scope, "rp_theirs", &theirs)
			b := mustReportingProject(t, scope, "rp_legacy", nil)

			ids, err := reportingProjectIDs(t.Context(), scope.Pool, reportingActorFor(scope, role))
			require.NoError(t, err)
			require.ElementsMatch(t, []string{a, b}, ids, role)
		}
	})
}
