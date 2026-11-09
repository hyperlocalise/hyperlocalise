package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestListAndGetMemoriesRespectAttachmentAccess(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `UPDATE projects SET team_id = NULL WHERE organization_id = $1`, f.actor.OrganizationID)
	})

	defaultTeam := uuid.NewString()
	designTeam := uuid.NewString()
	f.exec(t, `INSERT INTO teams (id, organization_id, slug, name) VALUES
		($1, $2, 'default', 'Default'), ($3, $2, 'design', 'Design')`,
		defaultTeam, f.actor.OrganizationID, designTeam)

	designProject := "project_" + uuid.NewString()[:8]
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales, team_id)
		VALUES ($1, $2, $3, 'Design', 'DESIGN01', 'native', 'en', '["fr"]'::jsonb, $4)`,
		designProject, f.actor.OrganizationID, f.actor.UserID, designTeam)

	unattached := uuid.NewString()
	defaultAttached := uuid.NewString()
	designAttached := uuid.NewString()
	external := uuid.NewString()
	f.exec(t, `INSERT INTO memories (id, organization_id, name, source, status) VALUES
		($1, $2, 'Org library', 'native', 'active'),
		($3, $2, 'Default project TM', 'native', 'active'),
		($4, $2, 'Design project TM', 'native', 'active'),
		($5, $2, 'Crowdin TM', 'external_tms', 'active')`,
		unattached, f.actor.OrganizationID, defaultAttached, designAttached, external)
	f.exec(t, `INSERT INTO project_memories (organization_id, project_id, memory_id) VALUES
		($1, $2, $3), ($1, $4, $5)`,
		f.actor.OrganizationID, f.project, defaultAttached, designProject, designAttached)

	adminMemories, adminTotal, err := f.store.listMemories(ctx, f.actor, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 4, adminTotal)
	require.ElementsMatch(t, []string{unattached, defaultAttached, designAttached, external}, memoryIDs(adminMemories))

	outsider := f.member(t, "translator")
	hidden, hiddenTotal, err := f.store.listMemories(ctx, outsider, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, hiddenTotal)
	require.ElementsMatch(t, []string{unattached, external}, memoryIDs(hidden))
	_, err = f.store.getMemory(ctx, outsider, defaultAttached)
	require.ErrorIs(t, err, errMemoryNotFound)
	_, err = f.store.getMemory(ctx, outsider, designAttached)
	require.ErrorIs(t, err, errMemoryNotFound)
	_, err = f.store.importMemoryEntries(ctx, outsider, designAttached, memoryImportInput{Format: "tmx", Content: "<tmx/>"})
	require.ErrorIs(t, err, errMemoryNotFound)

	visible, err := f.store.getMemory(ctx, outsider, unattached)
	require.NoError(t, err)
	require.Equal(t, unattached, visible.ID)
	_, err = f.store.importMemoryEntries(ctx, outsider, external, memoryImportInput{Format: "tmx", Content: "<tmx/>"})
	require.ErrorIs(t, err, errMemoryNotNative)

	onDefault := f.member(t, "translator")
	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		defaultTeam, onDefault.UserID)
	defaultVisible, defaultTotal, err := f.store.listMemories(ctx, onDefault, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 3, defaultTotal)
	require.ElementsMatch(t, []string{unattached, defaultAttached, external}, memoryIDs(defaultVisible))
	_, err = f.store.getMemory(ctx, onDefault, defaultAttached)
	require.NoError(t, err)
	_, err = f.store.getMemory(ctx, onDefault, designAttached)
	require.ErrorIs(t, err, errMemoryNotFound)

	onDesign := f.member(t, "translator")
	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`,
		designTeam, onDesign.UserID)
	designVisible, designTotal, err := f.store.listMemories(ctx, onDesign, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 3, designTotal)
	require.ElementsMatch(t, []string{unattached, designAttached, external}, memoryIDs(designVisible))

	manager := f.member(t, "localization_manager")
	managed, managedTotal, err := f.store.listMemories(ctx, manager, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 4, managedTotal)
	require.Len(t, managed, 4)
	_, err = f.store.getMemory(ctx, manager, designAttached)
	require.NoError(t, err)
}

func TestGetMemoryRejectsInvalidID(t *testing.T) {
	f := newDBFixture(t)
	_, err := f.store.getMemory(t.Context(), f.actor, "not-a-uuid")
	require.ErrorIs(t, err, errMemoryNotFound)
}

func memoryIDs(items []translationMemory) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = item.ID
	}
	return out
}
