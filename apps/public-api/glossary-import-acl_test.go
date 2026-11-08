package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRequireGlossaryWrite(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `UPDATE glossaries SET team_id = NULL WHERE organization_id = $1`, f.actor.OrganizationID)
	})

	teamID := uuid.NewString()
	f.exec(t, `INSERT INTO teams (id, organization_id, slug, name) VALUES ($1, $2, 'loc', 'Localization')`,
		teamID, f.actor.OrganizationID)

	nativeOrg := glossary{ID: uuid.NewString(), Source: "native", ControlLevel: "org"}
	nativeTeam := glossary{ID: uuid.NewString(), Source: "native", ControlLevel: "team", TeamID: &teamID}
	external := glossary{ID: uuid.NewString(), Source: "external_tms", ControlLevel: "org"}
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level)
		VALUES ($1, $2, 'Org terms', 'en', 'native', 'org')`, nativeOrg.ID, f.actor.OrganizationID)
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level, team_id)
		VALUES ($1, $2, 'Team terms', 'en', 'native', 'team', $3)`, nativeTeam.ID, f.actor.OrganizationID, teamID)
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale, source, control_level)
		VALUES ($1, $2, 'Crowdin terms', 'en', 'external_tms', 'org')`, external.ID, f.actor.OrganizationID)

	admin := f.actor
	admin.Role = "admin"
	translator := f.member(t, "translator")
	outsider := f.member(t, "translator")
	manager := f.member(t, "localization_manager")
	reviewer := f.member(t, "reviewer")
	f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, 'member')`, teamID, translator.UserID)

	require.NoError(t, requireGlossaryWrite(ctx, f.pool, admin, nativeOrg))
	require.NoError(t, requireGlossaryWrite(ctx, f.pool, admin, nativeTeam))
	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, admin, external), errGlossaryNotNative)

	require.NoError(t, requireGlossaryWrite(ctx, f.pool, manager, nativeOrg))
	require.NoError(t, requireGlossaryWrite(ctx, f.pool, manager, nativeTeam))
	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, manager, external), errGlossaryNotNative)

	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, translator, nativeOrg), errGlossaryWriteForbidden)
	require.NoError(t, requireGlossaryWrite(ctx, f.pool, translator, nativeTeam))
	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, outsider, nativeTeam), errGlossaryWriteForbidden)
	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, translator, external), errGlossaryNotNative)

	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, reviewer, nativeOrg), errGlossaryWriteForbidden)
	require.ErrorIs(t, requireGlossaryWrite(ctx, f.pool, reviewer, nativeTeam), errGlossaryWriteForbidden)
}

func (f dbFixture) member(t *testing.T, role string) principal {
	t.Helper()
	suffix := uuid.NewString()
	actor := principal{
		TokenID:        "token-" + suffix,
		UserID:         uuid.NewString(),
		OrganizationID: f.actor.OrganizationID,
		Role:           role,
	}
	f.exec(t, `INSERT INTO users (id, workos_user_id, email) VALUES ($1, $2, $3)`,
		actor.UserID, "user_"+suffix, suffix+"@example.com")
	f.exec(t, `INSERT INTO organization_memberships (organization_id, user_id, workos_membership_id, role)
		VALUES ($1, $2, $3, $4)`, f.actor.OrganizationID, actor.UserID, "om_"+suffix, role)
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, actor.UserID)
	})
	return actor
}
