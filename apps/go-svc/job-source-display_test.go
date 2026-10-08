package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

const jobSourceStoredFileID = "file_3b017712-ec57-448f-8015-ca282a5a103a"

func displayValues(display jobSourceFileDisplay) (filename, sourcePath any) {
	if display.SourceFilename != nil {
		filename = *display.SourceFilename
	}
	if display.SourcePath != nil {
		sourcePath = *display.SourcePath
	}
	return filename, sourcePath
}

func TestOriginalFilenameFromStoredName(t *testing.T) {
	for input, want := range map[string]string{
		"messages.json": "messages.json",
		"organizations/org_1/projects/project_1/files/file_abc/messages.json":                              "messages.json",
		"https://abc.blob.vercel-storage.com/organizations/org_1/workspace/files/file_abc/brief.docx":      "brief.docx",
		"https://abc.blob.vercel-storage.com/organizations/org_1/workspace/files/file_abc/my%20brief.docx": "my brief.docx",
		"https://abc.blob.vercel-storage.com/bad%zz/brief.docx":                                            "brief.docx",
		jobSourceStoredFileID: "file",
		"   ":                 "file",
		`.\locales\\fr.json`:  "fr.json",
		"./././a//b.json":     "b.json",
		"/":                   "/",
	} {
		require.Equal(t, want, originalFilenameFromStoredName(input), "%q", input)
	}
}

func TestIsInternalStorageFilename(t *testing.T) {
	require.True(t, isInternalStorageFilename(jobSourceStoredFileID))
	require.True(t, isInternalStorageFilename("organizations/org_1/workspace/files/file_abc/messages.json"))
	require.True(t, isInternalStorageFilename("https://x.blob.vercel-storage.com/a"))
	require.True(t, isInternalStorageFilename("organizations/x/files/y"))
	require.False(t, isInternalStorageFilename("messages.json"))
	require.False(t, isInternalStorageFilename("locales/en.json"))
	require.False(t, isInternalStorageFilename("  "))
}

func TestNativeFileJobSourceDisplayFields(t *testing.T) {
	filename, sourcePath := displayValues(nativeFileJobSourceDisplayFields("home.json", " marketing/home.json "))
	require.Equal(t, "home.json", filename)
	require.Equal(t, "marketing/home.json", sourcePath)

	filename, sourcePath = displayValues(nativeFileJobSourceDisplayFields(jobSourceStoredFileID, "organizations/o/projects/p/files/f/x.json"))
	require.Equal(t, "file", filename)
	require.Equal(t, "file", sourcePath)
}

func TestParseJobInputPayloadSource(t *testing.T) {
	for raw, want := range map[string]jobInputPayloadSource{
		`{"sourceFileId":" f ","metadata":{"sourceFilename":"a.json","sourcePath":" x/a.json "}}`: {"f", "a.json", "x/a.json"},
		`{"sourceFileId":1,"metadata":{"sourceFilename":2}}`:                                      {},
		`{"sourceFileId":"f","metadata":["a"]}`:                                                   {sourceFileID: "f"},
		`{"sourceFileId":null}`:                                                                   {},
		`["sourceFileId"]`:                                                                        {},
		`null`:                                                                                    {},
		``:                                                                                        {},
	} {
		require.Equal(t, want, parseJobInputPayloadSource([]byte(raw)), "%s", raw)
	}
}

type failingJobSourceDB struct{ dictionaryDB }

func (failingJobSourceDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
}

func (failingJobSourceDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected exec")
}

func TestResolveJobSourceFileDisplaysWithoutLookup(t *testing.T) {
	displays, err := resolveJobSourceFileDisplays(t.Context(), failingJobSourceDB{}, []jobSourceFileInput{
		{organizationID: "org", inputPayload: []byte(`{"sourceFileId":"` + jobSourceStoredFileID + `","metadata":{"sourceFilename":"home.json","sourcePath":"marketing/home.json"}}`)},
		{organizationID: "org", inputPayload: []byte(`{"sourceFileId":"` + jobSourceStoredFileID + `","metadata":{"sourcePath":"marketing/only-path.json"}}`)},
		{organizationID: "org", inputPayload: []byte(`{"sourceText":"hello"}`)},
		{organizationID: "org", inputPayload: []byte(`{"metadata":{"sourceFilename":"orphan.json"}}`)},
	})
	require.NoError(t, err)
	require.Len(t, displays, 4)
	filename, sourcePath := displayValues(displays[0])
	require.Equal(t, "home.json", filename)
	require.Equal(t, "marketing/home.json", sourcePath)
	filename, sourcePath = displayValues(displays[1])
	require.Equal(t, "only-path.json", filename)
	require.Equal(t, "marketing/only-path.json", sourcePath)
	for _, display := range displays[2:] {
		filename, sourcePath = displayValues(display)
		require.Nil(t, filename)
		require.Nil(t, sourcePath)
	}
}

func mustJobSourceStoredFile(t *testing.T, scope *testenv.Scope, filename, metadata string) string {
	t.Helper()
	storedFileID := "file_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256, metadata
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, $4, 'application/json', 2, 'deadbeef', $5::jsonb)`,
		storedFileID, scope.OrganizationID, scope.ProjectID, filename, metadata)
	require.NoError(t, err)
	return storedFileID
}

func mustJobSourceVersion(t *testing.T, scope *testenv.Scope, storedFileID, sourcePath string, createdAt time.Time) {
	t.Helper()
	var sourceFileID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_files (organization_id, project_id, source_path)
        values ($1, $2, $3)
        on conflict (project_id, source_path) do update set updated_at=now()
        returning id`, scope.OrganizationID, scope.ProjectID, sourcePath).Scan(&sourceFileID))
	_, err := scope.Pool.Exec(t.Context(), `
        insert into repository_source_file_versions (repository_source_file_id, organization_id, project_id, source_path, stored_file_id, created_at)
        values ($1, $2, $3, $4, $5, $6)`,
		sourceFileID, scope.OrganizationID, scope.ProjectID, sourcePath, storedFileID, createdAt)
	require.NoError(t, err)
}

func TestResolveJobSourceFileDisplaysLookup(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})

	versioned := mustJobSourceStoredFile(t, scope, "organizations/o/projects/p/files/f/pricing.json", `{"sourcePath":"meta/pricing.json"}`)
	mustJobSourceVersion(t, scope, versioned, "marketing/pricing.json", time.Now())
	emptyVersionPath := mustJobSourceStoredFile(t, scope, "empty.json", `{"sourcePath":"meta/empty.json"}`)
	mustJobSourceVersion(t, scope, emptyVersionPath, "", time.Now())
	metadataOnly := mustJobSourceStoredFile(t, scope, "brief.docx", `{"sourcePath":"docs/brief.docx"}`)
	nonStringMetadata := mustJobSourceStoredFile(t, scope, "notes.txt", `{"sourcePath":42}`)
	foreign := mustJobSourceStoredFile(t, other, "secret.json", `{}`)

	payload := func(fileID string) []byte { return []byte(`{"sourceFileId":"` + fileID + `"}`) }
	displays, err := resolveJobSourceFileDisplays(t.Context(), scope.Pool, []jobSourceFileInput{
		{organizationID: scope.OrganizationID, inputPayload: payload(versioned)},
		{organizationID: scope.OrganizationID, inputPayload: payload(metadataOnly)},
		{organizationID: scope.OrganizationID, inputPayload: payload(nonStringMetadata)},
		{organizationID: scope.OrganizationID, inputPayload: payload(foreign)},
		{organizationID: scope.OrganizationID, inputPayload: payload(versioned)},
		{organizationID: other.OrganizationID, inputPayload: payload(foreign)},
		{organizationID: scope.OrganizationID, inputPayload: payload(emptyVersionPath)},
	})
	require.NoError(t, err)

	expected := [][2]any{
		{"pricing.json", "marketing/pricing.json"},
		{"brief.docx", "docs/brief.docx"},
		{"notes.txt", "notes.txt"},
		{nil, nil},
		{"pricing.json", "marketing/pricing.json"},
		{"secret.json", "secret.json"},
		{"empty.json", "empty.json"},
	}
	require.Len(t, displays, len(expected))
	for i, want := range expected {
		filename, sourcePath := displayValues(displays[i])
		require.Equal(t, want, [2]any{filename, sourcePath}, "job %d", i)
	}
}
