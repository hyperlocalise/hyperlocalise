package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// dbFixture is a workspace, an admin user, and a native project in a migrated database.
type dbFixture struct {
	store   *postgresStore
	pool    *pgxpool.Pool
	actor   principal
	project string
}

// newDBFixture seeds a workspace when DATABASE_URL points at a migrated database, and skips
// the test otherwise so `go test` without Docker still runs the unit tests.
func newDBFixture(t *testing.T) dbFixture {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run public-api database tests")
	}
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))

	suffix := uuid.NewString()
	f := dbFixture{
		store: &postgresStore{pool: pool},
		pool:  pool,
		actor: principal{
			TokenID:        "token-" + suffix,
			UserID:         uuid.NewString(),
			OrganizationID: uuid.NewString(),
		},
		project: "project_" + strings.ReplaceAll(suffix[:8], "-", ""),
	}
	f.exec(t, `INSERT INTO users (id, workos_user_id, email) VALUES ($1, $2, $3)`,
		f.actor.UserID, "user_"+suffix, suffix+"@example.com")
	f.exec(t, `INSERT INTO organizations (id, workos_organization_id, name, slug, lifecycle_status)
		VALUES ($1, $2, $3, $4, 'active')`,
		f.actor.OrganizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	f.exec(t, `INSERT INTO organization_memberships (organization_id, user_id, workos_membership_id, role)
		VALUES ($1, $2, $3, 'admin')`, f.actor.OrganizationID, f.actor.UserID, "om_"+suffix)
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales)
		VALUES ($1, $2, $3, 'Project', $4, 'native', 'en', '["fr","de"]'::jsonb)`,
		f.project, f.actor.OrganizationID, f.actor.UserID, "P"+strings.ToUpper(strings.ReplaceAll(suffix, "-", "")[:8]))
	t.Cleanup(func() {
		cleanup := context.Background()
		_, _ = pool.Exec(cleanup, `DELETE FROM organizations WHERE id = $1`, f.actor.OrganizationID)
		_, _ = pool.Exec(cleanup, `DELETE FROM users WHERE id = $1`, f.actor.UserID)
	})
	return f
}

func (f dbFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

// sourceFile inserts a project source file and returns its id.
func (f dbFixture) sourceFile(t *testing.T, path string) string {
	t.Helper()
	var id string
	require.NoError(t, f.pool.QueryRow(t.Context(), `INSERT INTO repository_source_files (organization_id, project_id, source_path)
		VALUES ($1, $2, $3) RETURNING id`, f.actor.OrganizationID, f.project, path).Scan(&id))
	return id
}

// createString adds a string through the store, in the file at filePath when it is not empty.
func (f dbFixture) createString(t *testing.T, filePath, key, sourceText string, maxLength *int) translationString {
	t.Helper()
	input := stringCreate{Key: key, SourceText: sourceText, MaxLength: maxLength}
	if filePath != "" {
		input.FilePath = &filePath
	}
	item, err := f.store.createString(t.Context(), f.actor, f.project, input)
	require.NoError(t, err)
	return item
}
