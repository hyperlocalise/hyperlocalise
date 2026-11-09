package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestListProjectsRespectsWorkspaceAndTeamAccess(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `UPDATE projects SET team_id = NULL WHERE organization_id = $1`, f.actor.OrganizationID)
	})

	defaultTeam := uuid.NewString()
	otherTeam := uuid.NewString()
	f.exec(t, `INSERT INTO teams (id, organization_id, slug, name) VALUES
		($1, $2, 'default', 'Default'), ($3, $2, 'design', 'Design')`,
		defaultTeam, f.actor.OrganizationID, otherTeam)

	teamedProject := "project_" + uuid.NewString()[:8]
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales, team_id)
		VALUES ($1, $2, $3, 'Design', 'DESIGN01', 'native', 'en', '["fr"]'::jsonb, $4)`,
		teamedProject, f.actor.OrganizationID, f.actor.UserID, otherTeam)

	adminProjects, total, err := f.store.listProjects(ctx, f.actor, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, adminProjects, 2)

	translator := f.member(t, "translator")
	hidden, hiddenTotal, err := f.store.listProjects(ctx, translator, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 0, hiddenTotal)
	require.Empty(t, hidden)

	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		defaultTeam, translator.UserID)
	visible, visibleTotal, err := f.store.listProjects(ctx, translator, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 1, visibleTotal)
	require.Len(t, visible, 1)
	require.Equal(t, f.project, visible[0].ID)

	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		otherTeam, translator.UserID)
	both, bothTotal, err := f.store.listProjects(ctx, translator, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, bothTotal)
	require.Len(t, both, 2)

	manager := f.member(t, "localization_manager")
	managed, managedTotal, err := f.store.listProjects(ctx, manager, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, managedTotal)
	require.Len(t, managed, 2)

	_, err = f.store.getProject(ctx, translator, teamedProject)
	require.NoError(t, err)
	outsider := f.member(t, "translator")
	_, err = f.store.getProject(ctx, outsider, f.project)
	require.ErrorIs(t, err, errResourceNotFound)
}
