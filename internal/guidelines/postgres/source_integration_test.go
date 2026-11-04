package postgres

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

type guidelineFixture struct {
	pool *pgxpool.Pool
}

func newGuidelineFixture(t *testing.T) (guidelineFixture, string) {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run guideline database tests")
	}
	pool, err := pgxpool.New(t.Context(), url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(t.Context()))
	return guidelineFixture{pool: pool}, url
}

func (f guidelineFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func (f guidelineFixture) organization(t *testing.T) string {
	t.Helper()
	id := uuid.NewString()
	suffix := uuid.NewString()
	f.exec(t, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		id, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	t.Cleanup(func() {
		_, _ = f.pool.Exec(context.Background(), `delete from organizations where id = $1`, id)
	})
	return id
}

func (f guidelineFixture) project(t *testing.T, organizationID string) string {
	t.Helper()
	id := "project_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	f.exec(t, `insert into projects (id, organization_id, name, identifier, source) values ($1, $2, 'Project', $3, 'native')`,
		id, organizationID, "P"+strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:8]))
	return id
}

func (f guidelineFixture) document(t *testing.T, organizationID string, projectID, locale *string, status string, mandatory bool, content string) (string, string) {
	t.Helper()
	id, revisionID := uuid.NewString(), uuid.NewString()
	f.exec(t, `insert into guideline_documents (id, organization_id, project_id, locale, title, storage_location_id, storage_key, filename, content_type, byte_size, content, revision_id, version, mandatory, status)
		values ($1, $2, $3, $4, 'Guide', 'local', $5, 'guide.md', 'text/markdown', 10, $6, $7, 2, $8, $9)`,
		id, organizationID, projectID, locale, "guidelines/"+id, content, revisionID, mandatory, status)
	return id, revisionID
}

func TestCurrentReturnsScopedGuidelinesInOrder(t *testing.T) {
	f, _ := newGuidelineFixture(t)
	orgID := f.organization(t)
	otherOrgID := f.organization(t)
	projectID := f.project(t, orgID)
	siblingID := f.project(t, orgID)
	foreignProjectID := f.project(t, otherOrgID)
	fr, de := "fr-FR", "de-DE"

	workspaceRevision := uuid.NewString()
	f.exec(t, `insert into knowledge_memories (organization_id, revision_id, version, content) values ($1, $2, 3, 'Use sentence case.')`, orgID, workspaceRevision)
	projectRevision := uuid.NewString()
	f.exec(t, `insert into project_knowledge_memories (project_id, revision_id, version, content) values ($1, $2, 4, 'Say "cart", not "basket".')`, projectID, projectRevision)
	f.exec(t, `insert into project_knowledge_memories (project_id, content) values ($1, 'Sibling note')`, siblingID)
	f.exec(t, `insert into project_knowledge_memories (project_id, content) values ($1, 'Foreign note')`, foreignProjectID)
	f.exec(t, `insert into knowledge_memories (organization_id, content) values ($1, 'Foreign workspace')`, otherOrgID)

	orgDocID, orgDocRevision := f.document(t, orgID, nil, nil, "ready", false, "Org-wide doc")
	projectFrDocID, projectFrRevision := f.document(t, orgID, &projectID, &fr, "ready", true, "Project French doc")
	f.document(t, orgID, &projectID, &de, "ready", true, "German doc")
	f.document(t, orgID, &siblingID, nil, "ready", true, "Sibling doc")
	f.document(t, orgID, &projectID, nil, "processing", true, "Processing doc")
	f.document(t, orgID, nil, &fr, "failed", true, "Failed doc")
	f.document(t, otherOrgID, nil, nil, "ready", true, "Foreign doc")

	source := NewWithPool(f.pool)
	docs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: projectID, Locale: fr})
	require.NoError(t, err)
	require.Equal(t, []guidelines.Document{
		{ID: UploadedDocumentID(orgDocID), RevisionID: orgDocRevision, Version: 2, Content: "Org-wide doc", Scope: guidelines.Scope{OrganizationID: orgID}, Mandatory: false},
		{ID: "workspace:" + orgID, RevisionID: workspaceRevision, Version: 3, Content: "Use sentence case.", Scope: guidelines.Scope{OrganizationID: orgID}, Mandatory: true},
		{ID: UploadedDocumentID(projectFrDocID), RevisionID: projectFrRevision, Version: 2, Content: "Project French doc", Scope: guidelines.Scope{OrganizationID: orgID, ProjectID: projectID, Locale: fr}, Mandatory: true},
		{ID: "project:" + projectID, RevisionID: projectRevision, Version: 4, Content: `Say "cart", not "basket".`, Scope: guidelines.Scope{OrganizationID: orgID, ProjectID: projectID}, Mandatory: true},
	}, docs)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID})
	require.NoError(t, err)
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	require.Equal(t, []string{UploadedDocumentID(orgDocID), "workspace:" + orgID}, ids)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: otherOrgID, ProjectID: projectID, Locale: fr})
	require.NoError(t, err)
	for _, doc := range docs {
		require.NotEqual(t, "project:"+projectID, doc.ID)
		require.Equal(t, otherOrgID, doc.Scope.OrganizationID)
	}
	require.Len(t, docs, 2)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: uuid.NewString()})
	require.NoError(t, err)
	require.Empty(t, docs)
}

func TestNewConnectsAndCloses(t *testing.T) {
	_, url := newGuidelineFixture(t)
	source, err := New(t.Context(), url)
	require.NoError(t, err)
	docs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: uuid.NewString()})
	require.NoError(t, err)
	require.Empty(t, docs)
	source.Close()
	_, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: uuid.NewString()})
	require.ErrorContains(t, err, "query canonical guidelines")
}
