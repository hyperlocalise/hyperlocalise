package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestListAndGetGlossariesRespectTeamAndProjectAccess(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `UPDATE glossaries SET team_id = NULL WHERE organization_id = $1`, f.actor.OrganizationID)
		_, _ = f.pool.Exec(context.Background(), `UPDATE projects SET team_id = NULL WHERE organization_id = $1`, f.actor.OrganizationID)
	})

	defaultTeam := uuid.NewString()
	designTeam := uuid.NewString()
	f.exec(t, `INSERT INTO teams (id, organization_id, slug, name) VALUES
		($1, $2, 'default', 'Default'), ($3, $2, 'design', 'Design')`,
		defaultTeam, f.actor.OrganizationID, designTeam)

	orgGlossary := uuid.NewString()
	designGlossary := uuid.NewString()
	attachedDesignGlossary := uuid.NewString()
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level)
		VALUES ($1, $2, 'Org terms', 'en', 'native', 'org')`, orgGlossary, f.actor.OrganizationID)
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level, team_id)
		VALUES ($1, $2, 'Design terms', 'en', 'native', 'team', $3),
			($4, $2, 'Shared design terms', 'en', 'native', 'team', $3)`,
		designGlossary, f.actor.OrganizationID, designTeam, attachedDesignGlossary)
	f.exec(t, `INSERT INTO project_glossaries (organization_id, project_id, glossary_id) VALUES ($1, $2, $3)`,
		f.actor.OrganizationID, f.project, attachedDesignGlossary)

	adminGlossaries, adminTotal, err := f.store.listGlossaries(ctx, f.actor, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 3, adminTotal)
	require.ElementsMatch(t, []string{orgGlossary, designGlossary, attachedDesignGlossary}, glossaryIDs(adminGlossaries))

	outsider := f.member(t, "translator")
	hidden, hiddenTotal, err := f.store.listGlossaries(ctx, outsider, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 1, hiddenTotal)
	require.Equal(t, orgGlossary, hidden[0].ID)
	_, err = f.store.getGlossary(ctx, outsider, designGlossary)
	require.ErrorIs(t, err, errGlossaryNotFound)
	_, err = f.store.getGlossary(ctx, outsider, attachedDesignGlossary)
	require.ErrorIs(t, err, errGlossaryNotFound)

	onDefault := f.member(t, "translator")
	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		defaultTeam, onDefault.UserID)
	defaultVisible, defaultTotal, err := f.store.listGlossaries(ctx, onDefault, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, defaultTotal)
	require.ElementsMatch(t, []string{orgGlossary, attachedDesignGlossary}, glossaryIDs(defaultVisible))
	_, err = f.store.getGlossary(ctx, onDefault, attachedDesignGlossary)
	require.NoError(t, err)
	_, err = f.store.getGlossary(ctx, onDefault, designGlossary)
	require.ErrorIs(t, err, errGlossaryNotFound)

	onDesign := f.member(t, "translator")
	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		designTeam, onDesign.UserID)
	designVisible, designTotal, err := f.store.listGlossaries(ctx, onDesign, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 3, designTotal)
	require.ElementsMatch(t, []string{orgGlossary, designGlossary, attachedDesignGlossary}, glossaryIDs(designVisible))

	manager := f.member(t, "localization_manager")
	managed, managedTotal, err := f.store.listGlossaries(ctx, manager, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 3, managedTotal)
	require.Len(t, managed, 3)
}

func TestGetGlossaryRejectsInvalidID(t *testing.T) {
	f := newDBFixture(t)
	_, err := f.store.getGlossary(t.Context(), f.actor, "not-a-uuid")
	require.ErrorIs(t, err, errGlossaryNotFound)
}

func glossaryIDs(items []glossary) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = item.ID
	}
	return out
}
