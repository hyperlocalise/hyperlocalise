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
	isGlobal := projectID == nil && locale == nil
	locales := []string{}
	if locale != nil {
		locales = []string{*locale}
	}
	f.exec(t, `insert into guideline_documents (id, organization_id, project_id, locale, locales, is_global, title, storage_location_id, storage_key, filename, content_type, byte_size, content, revision_id, version, mandatory, status)
		values ($1, $2, NULL, $3, $4, $5, 'Guide', 'local', $6, 'guide.md', 'text/markdown', 10, $7, $8, 2, $9, $10)`,
		id, organizationID, locale, locales, isGlobal, "guidelines/"+id, content, revisionID, mandatory, status)
	return id, revisionID
}

func TestCurrentReturnsScopedGuidelinesInOrder(t *testing.T) {
	f, _ := newGuidelineFixture(t)
	orgID := f.organization(t)
	otherOrgID := f.organization(t)
	projectID := f.project(t, orgID)
	siblingID := f.project(t, orgID)
	fr, de := "fr-FR", "de-DE"

	orgDocID, orgDocRevision := f.document(t, orgID, nil, nil, "ready", false, "Org-wide doc")
	// is_global docs apply to every project; assigned docs apply only to
	// listed projects; unassigned non-global docs apply to no project.
	globalDocID, globalDocRevision := f.document(t, orgID, nil, nil, "ready", false, "Global doc")
	f.exec(t, `update guideline_documents set is_global = false where id = $1`, orgDocID)
	f.exec(t, `insert into guideline_document_projects (organization_id, document_id, project_id) values ($1, $2, $3)`, orgID, orgDocID, projectID)
	projectFrDocID, projectFrRevision := f.document(t, orgID, &projectID, &fr, "ready", true, "Project French doc")
	f.exec(t, `update guideline_documents set is_global = false where id = $1`, projectFrDocID)
	f.exec(t, `insert into guideline_document_projects (organization_id, document_id, project_id) values ($1, $2, $3) on conflict do nothing`, orgID, projectFrDocID, projectID)
	f.document(t, orgID, &projectID, &de, "ready", true, "German doc")
	f.document(t, orgID, &siblingID, nil, "ready", true, "Sibling doc")
	f.document(t, orgID, &projectID, nil, "processing", true, "Processing doc")
	f.document(t, orgID, nil, &fr, "failed", true, "Failed doc")
	f.document(t, otherOrgID, nil, nil, "ready", true, "Foreign doc")

	source := NewWithPool(f.pool)
	docs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: projectID, Locale: fr})
	require.NoError(t, err)
	require.Len(t, docs, 3)
	byID := map[string]guidelines.Document{}
	for _, doc := range docs {
		byID[doc.ID] = doc
	}
	require.Equal(t, guidelines.Document{ID: UploadedDocumentID(orgDocID), RevisionID: orgDocRevision, Version: 2, Content: "Org-wide doc", Scope: guidelines.Scope{OrganizationID: orgID}, Mandatory: false}, byID[UploadedDocumentID(orgDocID)])
	require.Equal(t, guidelines.Document{ID: UploadedDocumentID(globalDocID), RevisionID: globalDocRevision, Version: 2, Content: "Global doc", Scope: guidelines.Scope{OrganizationID: orgID}, Mandatory: false}, byID[UploadedDocumentID(globalDocID)])
	require.Equal(t, guidelines.Document{ID: UploadedDocumentID(projectFrDocID), RevisionID: projectFrRevision, Version: 2, Content: "Project French doc", Scope: guidelines.Scope{OrganizationID: orgID, Locale: fr}, Mandatory: true}, byID[UploadedDocumentID(projectFrDocID)])

	// Sibling sees the unassigned global doc but not the assigned scoped doc.
	siblingDocs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: siblingID, Locale: fr})
	require.NoError(t, err)
	siblingIDs := make([]string, 0, len(siblingDocs))
	for _, doc := range siblingDocs {
		siblingIDs = append(siblingIDs, doc.ID)
	}
	require.Contains(t, siblingIDs, UploadedDocumentID(globalDocID))
	require.NotContains(t, siblingIDs, UploadedDocumentID(orgDocID))

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID})
	require.NoError(t, err)
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	siblingDocID := ""
	for _, doc := range docs {
		if doc.Content == "Sibling doc" {
			siblingDocID = doc.ID
		}
	}
	require.NotEmpty(t, siblingDocID)
	require.ElementsMatch(t, []string{UploadedDocumentID(orgDocID), UploadedDocumentID(globalDocID), siblingDocID}, ids)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: otherOrgID, ProjectID: projectID, Locale: fr})
	require.NoError(t, err)
	for _, doc := range docs {
		require.Equal(t, otherOrgID, doc.Scope.OrganizationID)
	}
	require.Len(t, docs, 1)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: uuid.NewString()})
	require.NoError(t, err)
	require.Empty(t, docs)
}

func TestCurrentRespectsProjectAssignment(t *testing.T) {
	f, _ := newGuidelineFixture(t)
	orgID := f.organization(t)
	projectID := f.project(t, orgID)
	siblingID := f.project(t, orgID)

	orgDocID, _ := f.document(t, orgID, nil, nil, "ready", false, "Org-wide doc")
	f.exec(t, `update guideline_documents set is_global = true where id = $1`, orgDocID)

	source := NewWithPool(f.pool)

	// Global docs apply to every project.
	docs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: projectID})
	require.NoError(t, err)
	require.Len(t, docs, 1)

	siblingDocs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: siblingID})
	require.NoError(t, err)
	require.Len(t, siblingDocs, 1)

	// Clearing is_global and assigning the document to one project scopes it
	// to listed projects only; unassigned non-global docs apply to no project.
	f.exec(t, `update guideline_documents set is_global = false where id = $1`, orgDocID)
	f.exec(t, `insert into guideline_document_projects (organization_id, document_id, project_id) values ($1, $2, $3)`, orgID, orgDocID, projectID)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: projectID})
	require.NoError(t, err)
	require.Len(t, docs, 1)

	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: siblingID})
	require.NoError(t, err)
	require.Empty(t, docs)

	// Org-only scope keeps all org-scoped content regardless of assignment.
	docs, err = source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID})
	require.NoError(t, err)
	require.Len(t, docs, 1)
}

func TestCurrentHonorsLegacyLocaleAndProject(t *testing.T) {
	f, _ := newGuidelineFixture(t)
	orgID := f.organization(t)
	projectID := f.project(t, orgID)
	otherID := f.project(t, orgID)
	fr := "fr-FR"

	ownedID, _ := f.document(t, orgID, nil, nil, "ready", false, "Owned")
	frenchID, _ := f.document(t, orgID, nil, &fr, "ready", true, "French")
	f.exec(t, `update guideline_documents set project_id = $2, is_global = false, locales = '{}' where id = $1`, ownedID, projectID)
	f.exec(t, `update guideline_documents set locales = '{}', locale = 'fr-FR', is_global = true where id = $1`, frenchID)

	source := NewWithPool(f.pool)
	ids := func(projectID, locale string) []string {
		t.Helper()
		docs, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: orgID, ProjectID: projectID, Locale: locale})
		require.NoError(t, err)
		got := make([]string, 0, len(docs))
		for _, doc := range docs {
			got = append(got, doc.ID)
		}
		return got
	}

	require.ElementsMatch(t, []string{UploadedDocumentID(ownedID), UploadedDocumentID(frenchID)}, ids(projectID, fr))
	require.ElementsMatch(t, []string{UploadedDocumentID(frenchID)}, ids(otherID, fr))
	require.ElementsMatch(t, []string{UploadedDocumentID(ownedID)}, ids(projectID, "de-DE"))
	require.Empty(t, ids("", ""))
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
	require.ErrorContains(t, err, "query guideline documents")
}
