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

type documentFixture struct {
	pool           *pgxpool.Pool
	store          postgresDocumentStore
	organizationID string
	projectID      string
}

func newDocumentFixture(t *testing.T) documentFixture {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run guideline ingest database tests")
	}
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	suffix := uuid.NewString()
	f := documentFixture{
		pool:           pool,
		store:          postgresDocumentStore{pool: pool},
		organizationID: uuid.NewString(),
		projectID:      "project_" + strings.ReplaceAll(suffix[:8], "-", ""),
	}
	_, err = pool.Exec(ctx, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		f.organizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into projects (id, organization_id, name, identifier, source) values ($1, $2, 'Project', $3, 'native')`,
		f.projectID, f.organizationID, "P"+strings.ToUpper(strings.ReplaceAll(suffix, "-", "")[:8]))
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `delete from organizations where id = $1`, f.organizationID)
	})
	return f
}

func (f documentFixture) insert(t *testing.T, status string, projectID, locale *string) (string, string) {
	t.Helper()
	id, revisionID := uuid.NewString(), uuid.NewString()
	_, err := f.pool.Exec(t.Context(), `
        insert into guideline_documents (id, organization_id, project_id, locale, title, storage_location_id, storage_key, filename, content_type, byte_size, content, revision_id, version, mandatory, status)
        values ($1, $2, $3, $4, 'Style guide', 'local', 'guidelines/style.txt', 'style.txt', 'text/plain', 12, '', $5, 2, true, $6)`,
		id, f.organizationID, projectID, locale, revisionID, status)
	require.NoError(t, err)
	return id, revisionID
}

func (f documentFixture) row(t *testing.T, id string) (status, content string, errorCode, indexed *string, truncated bool) {
	t.Helper()
	require.NoError(t, f.pool.QueryRow(t.Context(), `select status, coalesce(content, ''), error_code, indexed_revision_id::text, coalesce(truncated, false) from guideline_documents where id=$1`, id).
		Scan(&status, &content, &errorCode, &indexed, &truncated))
	return status, content, errorCode, indexed, truncated
}

func TestPostgresDocumentStoreLoad(t *testing.T) {
	f := newDocumentFixture(t)
	locale := "fr-FR"
	id, revisionID := f.insert(t, statusProcessing, &f.projectID, &locale)

	doc, found, err := f.store.Load(t.Context(), f.organizationID, id)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, storedDocument{
		ID: id, OrganizationID: f.organizationID, ProjectID: f.projectID, Locale: "fr-FR", Filename: "style.txt", ContentType: "text/plain",
		StorageLocationID: "local", StorageKey: "guidelines/style.txt", RevisionID: revisionID, Version: 2, Mandatory: true, Status: statusProcessing,
	}, doc)

	_, found, err = f.store.Load(t.Context(), uuid.NewString(), id)
	require.NoError(t, err)
	require.False(t, found)

	workspaceID, _ := f.insert(t, statusReady, nil, nil)
	doc, found, err = f.store.Load(t.Context(), f.organizationID, workspaceID)
	require.NoError(t, err)
	require.True(t, found)
	require.Empty(t, doc.ProjectID)
	require.Empty(t, doc.Locale)

	_, _, err = f.store.Load(t.Context(), f.organizationID, "not-a-uuid")
	require.ErrorContains(t, err, "load guideline document")
}

func TestPostgresDocumentStoreTransitionsOnlyCurrentProcessingRevision(t *testing.T) {
	f := newDocumentFixture(t)
	id, revisionID := f.insert(t, statusProcessing, nil, nil)

	updated, err := f.store.MarkReady(t.Context(), id, uuid.NewString(), "stale", false)
	require.NoError(t, err)
	require.False(t, updated)

	updated, err = f.store.MarkReady(t.Context(), id, revisionID, "Use formal tone.", true)
	require.NoError(t, err)
	require.True(t, updated)
	status, content, errorCode, indexed, truncated := f.row(t, id)
	require.Equal(t, statusReady, status)
	require.Equal(t, "Use formal tone.", content)
	require.Nil(t, errorCode)
	require.Nil(t, indexed)
	require.True(t, truncated)

	updated, err = f.store.MarkReady(t.Context(), id, revisionID, "again", false)
	require.NoError(t, err)
	require.False(t, updated)

	require.NoError(t, f.store.MarkFailed(t.Context(), id, revisionID, "no_text"))
	status, _, errorCode, _, _ = f.row(t, id)
	require.Equal(t, statusReady, status)
	require.Nil(t, errorCode)

	require.NoError(t, f.store.MarkIndexed(t.Context(), id, revisionID))
	_, _, _, indexed, _ = f.row(t, id)
	require.NotNil(t, indexed)
	require.Equal(t, revisionID, *indexed)
}

func TestPostgresDocumentStoreMarkFailed(t *testing.T) {
	f := newDocumentFixture(t)
	id, revisionID := f.insert(t, statusProcessing, nil, nil)

	require.NoError(t, f.store.MarkFailed(t.Context(), id, revisionID, "unsupported_format"))
	status, _, errorCode, _, _ := f.row(t, id)
	require.Equal(t, "failed", status)
	require.NotNil(t, errorCode)
	require.Equal(t, "unsupported_format", *errorCode)

	require.NoError(t, f.store.MarkIndexed(t.Context(), id, uuid.NewString()))
	_, _, _, indexed, _ := f.row(t, id)
	require.Nil(t, indexed)
}

func TestPostgresDocumentStoreWrapsQueryErrors(t *testing.T) {
	f := newDocumentFixture(t)
	_, err := f.store.MarkReady(t.Context(), "not-a-uuid", uuid.NewString(), "", false)
	require.ErrorContains(t, err, "mark guideline document ready")
	err = f.store.MarkFailed(t.Context(), "not-a-uuid", uuid.NewString(), "no_text")
	require.ErrorContains(t, err, "mark guideline document failed")
	err = f.store.MarkIndexed(t.Context(), "not-a-uuid", uuid.NewString())
	require.ErrorContains(t, err, "mark guideline document indexed")
}
