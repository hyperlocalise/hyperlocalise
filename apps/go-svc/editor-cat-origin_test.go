package main

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// newEditorCatOriginFixture seeds a workspace, a native project and one string in a migrated
// database named by DATABASE_URL, and skips the test without one.
func newEditorCatOriginFixture(t *testing.T) (*editorCatAPI, editorCatActor, editorCatProject, string) {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run go-svc database tests")
	}
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	suffix := uuid.NewString()
	actor := editorCatActor{userID: uuid.NewString(), organizationID: uuid.NewString(), organizationSlug: "org-" + suffix[:8], role: "admin"}
	project := editorCatProject{ID: "project_" + strings.ReplaceAll(suffix[:8], "-", ""), Source: "native", SourceLocale: "en"}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	exec(`INSERT INTO users (id, workos_user_id, email) VALUES ($1, $2, $3)`, actor.userID, "user_"+suffix, suffix+"@example.com")
	exec(`INSERT INTO organizations (id, workos_organization_id, name, slug, lifecycle_status) VALUES ($1, $2, $3, $4, 'active')`,
		actor.organizationID, "org_"+suffix, "Acme "+suffix, actor.organizationSlug)
	exec(`INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales)
		VALUES ($1, $2, $3, 'Project', $4, 'native', 'en', '["fr"]'::jsonb)`,
		project.ID, actor.organizationID, actor.userID, "P"+strings.ToUpper(strings.ReplaceAll(suffix, "-", "")[:8]))
	var fileID, keyID string
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO repository_source_files (organization_id, project_id, source_path)
		VALUES ($1, $2, 'en.json') RETURNING id`, actor.organizationID, project.ID).Scan(&fileID))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO project_translation_keys (organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text)
		VALUES ($1, $2, $3, 'save', 'Save', 'save') RETURNING id`, actor.organizationID, project.ID, fileID).Scan(&keyID))
	exec(`INSERT INTO project_translations (organization_id, project_id, translation_key_id, target_locale, text, status, provenance, origin)
		VALUES ($1, $2, $3, 'fr', 'Enregistrer', 'needs_review', 'translation_job', 'machine')`, actor.organizationID, project.ID, keyID)
	t.Cleanup(func() {
		cleanup := t.Context()
		_, _ = pool.Exec(cleanup, `DELETE FROM organizations WHERE id = $1`, actor.organizationID)
		_, _ = pool.Exec(cleanup, `DELETE FROM users WHERE id = $1`, actor.userID)
	})
	return &editorCatAPI{pool: pool}, actor, project, keyID
}

func TestEditorCatSaveTranslationOriginDatabase(t *testing.T) {
	api, actor, project, keyID := newEditorCatOriginFixture(t)
	save := func(text string, approve bool) {
		t.Helper()
		body := `{"sourcePath":"en.json","targetLocale":"fr","externalStringId":"` + keyID + `","text":"` + text + `","approve":` + map[bool]string{true: "true", false: "false"}[approve] + `}`
		_, status, err := api.saveTranslation(httptest.NewRequest("POST", "/", strings.NewReader(body)), actor, project)
		require.NoError(t, err)
		require.Equal(t, 200, status)
	}
	origin := func() (current, revision, provenance string) {
		t.Helper()
		pool := api.pool
		require.NoError(t, pool.QueryRow(t.Context(), `SELECT t.origin::text, t.provenance::text,
			(SELECT r.origin::text FROM project_translation_revisions r WHERE r.translation_id = t.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1)
			FROM project_translations t WHERE t.translation_key_id = $1 AND t.target_locale = 'fr'`, keyID).Scan(&current, &provenance, &revision))
		return current, revision, provenance
	}

	// Approving machine text unchanged: provenance becomes manual, origin stays machine.
	save("Enregistrer", true)
	current, revision, provenance := origin()
	require.Equal(t, "manual", provenance)
	require.Equal(t, "machine", current)
	require.Equal(t, "machine", revision)

	// Changing it post-edits it.
	save("Sauvegarder", false)
	current, revision, _ = origin()
	require.Equal(t, "machine_post_edited", current)
	require.Equal(t, "machine_post_edited", revision)

	// The baseline revision kept the job's machine label.
	var baseline string
	require.NoError(t, api.pool.QueryRow(t.Context(), `SELECT r.origin::text FROM project_translation_revisions r
		WHERE r.translation_key_id = $1 ORDER BY r.created_at, r.id LIMIT 1`, keyID).Scan(&baseline))
	require.Equal(t, "machine", baseline)
}

func TestRestoreOrigin(t *testing.T) {
	require.Equal(t, "machine", restoreOrigin(editorCatRestoreTarget{origin: "machine"}))
	require.Equal(t, "unknown", restoreOrigin(editorCatRestoreTarget{text: ""}))
}
