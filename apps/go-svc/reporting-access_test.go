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

func TestLoadReportingJobMatchesHonoJobAccess(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "translator"})
	mine := scope.MustTeam(t, "mine", "Mine", "member")
	theirs := scope.MustTeam(t, "theirs", "Theirs", "")
	visible := mustReportingProject(t, scope, "rp_mine", &mine)
	hidden := mustReportingProject(t, scope, "rp_theirs", &theirs)
	visibleJob := mustReportingJob(t, scope, "job_visible", &visible)
	hiddenJob := mustReportingJob(t, scope, "job_hidden", &hidden)
	unscopedJob := mustReportingJob(t, scope, "job_unscoped", nil)

	translator := reportingActorFor(scope, "translator")
	job, err := loadReportingJob(t.Context(), scope.Pool, translator, visibleJob)
	require.NoError(t, err)
	require.Equal(t, visibleJob, job.ID)
	require.Equal(t, visible, *job.ProjectID)
	for _, id := range []string{hiddenJob, unscopedJob, "job_missing"} {
		_, err := loadReportingJob(t.Context(), scope.Pool, translator, id)
		require.True(t, isNoRows(err), id)
	}

	admin := reportingActorFor(scope, "admin")
	for _, id := range []string{visibleJob, hiddenJob, unscopedJob} {
		job, err := loadReportingJob(t.Context(), scope.Pool, admin, id)
		require.NoError(t, err, id)
		require.Equal(t, id, job.ID)
	}
	unscoped, err := loadReportingJob(t.Context(), scope.Pool, admin, unscopedJob)
	require.NoError(t, err)
	require.Nil(t, unscoped.ProjectID)

	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	_, err = loadReportingJob(t.Context(), other.Pool, reportingActorFor(other, "admin"), visibleJob)
	require.True(t, isNoRows(err))
}
