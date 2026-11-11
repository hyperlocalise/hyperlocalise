package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
	"github.com/stretchr/testify/require"
)

type stubCatalogProvider struct {
	glossaryExport tmscatalog.Export
	memoryExport   tmscatalog.Export
	err            error
}

func (s stubCatalogProvider) ListGlossaries(context.Context) ([]tmscatalog.Resource, error) {
	return nil, s.err
}

func (s stubCatalogProvider) ListMemories(context.Context) ([]tmscatalog.Resource, error) {
	return nil, s.err
}

func (s stubCatalogProvider) ExportGlossary(context.Context, string, int64) (tmscatalog.Export, error) {
	return s.glossaryExport, s.err
}

func (s stubCatalogProvider) ExportMemory(context.Context, string, int64) (tmscatalog.Export, error) {
	return s.memoryExport, s.err
}

type recordingGlossaryInterchangePublisher struct {
	messages []glossaryInterchangeMessage
	err      error
}

func (p *recordingGlossaryInterchangePublisher) Publish(_ context.Context, message glossaryInterchangeMessage) error {
	if p.err != nil {
		return p.err
	}
	p.messages = append(p.messages, message)
	return nil
}

func (p *recordingGlossaryInterchangePublisher) Ping(context.Context) error { return nil }

func mustOrgTMSCredential(t *testing.T, scope *testenv.Scope) string {
	return mustOrgTMSCredentialFor(t, scope, "crowdin", "Crowdin")
}

func mustOrgTMSCredentialFor(t *testing.T, scope *testenv.Scope, providerKind, displayName string) string {
	t.Helper()
	var id string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into organization_external_tms_provider_credentials (
            organization_id, provider_kind, display_name, encryption_algorithm, ciphertext, iv, auth_tag, masked_secret_suffix
        ) values ($1, $2::external_tms_provider_kind, $3, 'aes-256-gcm', 'c', 'i', 't', '1234')
        returning id::text`, scope.OrganizationID, providerKind, displayName).Scan(&id))
	return id
}

func TestListTMSGlossariesAndMemories(t *testing.T) {
	t.Run("empty when nothing is connected", func(t *testing.T) {
		glossaryAPI, scope := glossaryTestAPI(t, "admin")
		rec := glossaryRequest(glossaryAPI, scope, http.MethodGet, scope.OrgPath("/tms/glossaries"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"connection":null,"glossaries":[]}`, rec.Body.String())

		memoryAPI, memoryScope := memoryTestAPI(t, "admin")
		rec = memoryRequest(memoryAPI, memoryScope, http.MethodGet, memoryScope.OrgPath("/tms/translation-memories"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"connection":null,"memories":[]}`, rec.Body.String())
	})

	t.Run("unavailable when the mint client is missing", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		mustOrgTMSCredential(t, scope)
		rec := glossaryRequest(api, scope, http.MethodGet, scope.OrgPath("/tms/glossaries"), "")
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "tms_unavailable")
	})

	t.Run("lists resources from the connected TMS", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			w.Header().Set("Content-Type", "application/json")
			switch r.URL.Path {
			case "/glossaries":
				_, _ = w.Write([]byte(`{"data":[{"data":{"id":11,"name":"Brand","languageId":"en","terms":4}}]}`))
			case "/tms":
				_, _ = w.Write([]byte(`{"data":[{"data":{"id":22,"name":"Product","languageId":"en","segmentsCount":9}}]}`))
			default:
				http.NotFound(w, r)
			}
		}))
		t.Cleanup(server.Close)

		imports := &tmsImports{
			tokens: stubTMSMinter{token: &tmsauth.AccessToken{
				BaseURL:     server.URL,
				HeaderName:  "Authorization",
				HeaderValue: "Bearer token",
			}},
			http: server.Client(),
		}

		glossaryAPI, scope := glossaryTestAPI(t, "admin")
		glossaryAPI.tms = imports
		credID := mustOrgTMSCredential(t, scope)
		rec := glossaryRequest(glossaryAPI, scope, http.MethodGet, scope.OrgPath("/tms/glossaries"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"credentialId":"`+credID+`"`)
		require.Contains(t, rec.Body.String(), `"externalId":"11"`)
		require.Contains(t, rec.Body.String(), `"termCount":4`)

		memoryAPI, memoryScope := memoryTestAPI(t, "admin")
		memoryAPI.tms = imports
		mustOrgTMSCredential(t, memoryScope)
		rec = memoryRequest(memoryAPI, memoryScope, http.MethodGet, memoryScope.OrgPath("/tms/translation-memories"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"externalId":"22"`)
		require.Contains(t, rec.Body.String(), `"segmentCount":9`)
	})
}

func TestImportFromTMSHandlers(t *testing.T) {
	t.Run("glossary needs object storage and interchange", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		path := scope.OrgPath("/glossaries/" + id + "/concepts/import/from-tms")

		rec := glossaryRequest(api, scope, http.MethodPost, path, `{"credentialId":"cred","externalId":"g-1"}`)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "object_storage_unavailable")

		api.objects = memoryObjectRegistry(t)
		rec = glossaryRequest(api, scope, http.MethodPost, path, `{"credentialId":"cred","externalId":"g-1"}`)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "glossary_interchange_unavailable")
	})

	t.Run("memory needs object storage and interchange", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		path := scope.OrgPath("/translation-memories/" + id + "/entries/import/from-tms")

		rec := memoryRequest(api, scope, http.MethodPost, path, `{"credentialId":"cred","externalId":"tm-1"}`)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "object_storage_unavailable")

		api.objects = memoryObjectRegistry(t)
		rec = memoryRequest(api, scope, http.MethodPost, path, `{"credentialId":"cred","externalId":"tm-1"}`)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "memory_interchange_unavailable")
	})

	t.Run("queues glossary and memory imports", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "no export in this test", http.StatusNotFound)
		}))
		t.Cleanup(server.Close)
		imports := &tmsImports{
			tokens: stubTMSMinter{token: &tmsauth.AccessToken{
				BaseURL:     server.URL,
				HeaderName:  "Authorization",
				HeaderValue: "Bearer token",
			}},
			http: server.Client(),
		}

		glossaryAPI, glossaryScope := glossaryTestAPI(t, "admin")
		glossaryAPI.tms = imports
		glossaryAPI.objects = memoryObjectRegistry(t)
		glossaryAPI.interchange = &recordingGlossaryInterchangePublisher{}
		glossaryID := glossaryScope.MustGlossary(t, "", "Product terms", "en-US")
		credID := mustOrgTMSCredential(t, glossaryScope)
		rec := glossaryRequest(glossaryAPI, glossaryScope, http.MethodPost,
			glossaryScope.OrgPath("/glossaries/"+glossaryID+"/concepts/import/from-tms"),
			`{"credentialId":"`+credID+`","externalId":"g-1"}`)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"status":"upload_pending"`)
		waitTMSImportLeavePending(t, glossaryScope, `select status from glossary_import_runs where glossary_id=$1`, glossaryID)

		memoryAPI, memoryScope := memoryTestAPI(t, "admin")
		memoryAPI.tms = imports
		memoryAPI.objects = memoryObjectRegistry(t)
		memoryAPI.interchange = &recordingMemoryInterchangePublisher{}
		memoryID := memoryScope.MustMemory(t, "", "Product TM")
		memoryCred := mustOrgTMSCredential(t, memoryScope)
		rec = memoryRequest(memoryAPI, memoryScope, http.MethodPost,
			memoryScope.OrgPath("/translation-memories/"+memoryID+"/entries/import/from-tms"),
			`{"credentialId":"`+memoryCred+`","externalId":"tm-1"}`)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"status":"upload_pending"`)
		waitTMSImportLeavePending(t, memoryScope, `select status from memory_import_attempts where memory_id=$1`, memoryID)
	})
}

func TestRunGlossaryAndMemoryTMSImport(t *testing.T) {
	conn := tmsConnection{ProviderKind: "crowdin", DisplayName: "Crowdin"}

	t.Run("glossary export, store, and queue", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		api.objects = memoryObjectRegistry(t)
		publisher := &recordingGlossaryInterchangePublisher{}
		api.interchange = publisher
		glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
		runID := insertPendingGlossaryImport(t, scope, glossaryID)
		key := "glossary-interchange/" + scope.OrganizationID + "/" + glossaryID + "/import/" + runID + ".tbx"

		api.runGlossaryTMSImport(t.Context(), conn, stubCatalogProvider{err: errors.New("crowdin down")}, "g-1", runID, key)
		require.Equal(t, "failed", glossaryImportStatus(t, scope, runID))

		runID = insertPendingGlossaryImport(t, scope, glossaryID)
		api.runGlossaryTMSImport(t.Context(), conn, stubCatalogProvider{glossaryExport: tmscatalog.Export{Content: []byte("  ")}}, "g-1", runID, key)
		require.Equal(t, "failed", glossaryImportStatus(t, scope, runID))

		runID = insertPendingGlossaryImport(t, scope, glossaryID)
		key = "glossary-interchange/" + scope.OrganizationID + "/" + glossaryID + "/import/" + runID + ".tbx"
		api.runGlossaryTMSImport(t.Context(), conn, stubCatalogProvider{glossaryExport: tmscatalog.Export{Content: []byte("<tbx/>")}}, "g-1", runID, key)
		require.Equal(t, "queued", glossaryImportStatus(t, scope, runID))
		require.Equal(t, []glossaryInterchangeMessage{{SchemaVersion: 1, RunID: runID, Operation: "import"}}, publisher.messages)
	})

	t.Run("memory export, store, and queue", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		api.objects = memoryObjectRegistry(t)
		publisher := &recordingMemoryInterchangePublisher{}
		api.interchange = publisher
		memoryID := scope.MustMemory(t, "", "Product TM")
		attemptID := insertPendingMemoryImport(t, scope, memoryID)
		key := "memory-interchange/" + scope.OrganizationID + "/" + memoryID + "/import/" + attemptID + ".tmx"

		api.runMemoryTMSImport(t.Context(), conn, stubCatalogProvider{err: errors.New("crowdin down")}, "tm-1", attemptID, key)
		require.Equal(t, "failed", memoryImportStatus(t, scope, attemptID))

		attemptID = insertPendingMemoryImport(t, scope, memoryID)
		api.runMemoryTMSImport(t.Context(), conn, stubCatalogProvider{memoryExport: tmscatalog.Export{Content: []byte("\n")}}, "tm-1", attemptID, key)
		require.Equal(t, "failed", memoryImportStatus(t, scope, attemptID))

		attemptID = insertPendingMemoryImport(t, scope, memoryID)
		key = "memory-interchange/" + scope.OrganizationID + "/" + memoryID + "/import/" + attemptID + ".tmx"
		api.runMemoryTMSImport(t.Context(), conn, stubCatalogProvider{memoryExport: tmscatalog.Export{Content: []byte("<tmx/>")}}, "tm-1", attemptID, key)
		require.Equal(t, "queued", memoryImportStatus(t, scope, attemptID))
		require.Equal(t, []memoryInterchangeMessage{{SchemaVersion: 1, AttemptID: attemptID, Operation: "import"}}, publisher.messages)
	})
}

func insertPendingGlossaryImport(t *testing.T, scope *testenv.Scope, glossaryID string) string {
	t.Helper()
	var runID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into glossary_import_runs (
            organization_id, glossary_id, created_by_user_id, operation, format, mode, status,
            source_filename, source_object_location, source_object_key
        ) values ($1,$2,$3,'import','tbx','merge','upload_pending','crowdin.tbx','r2-primary','pending.tbx')
        returning id::text`, scope.OrganizationID, glossaryID, scope.UserID).Scan(&runID))
	return runID
}

func insertPendingMemoryImport(t *testing.T, scope *testenv.Scope, memoryID string) string {
	t.Helper()
	var attemptID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into memory_import_attempts (
            organization_id, memory_id, created_by_user_id, operation, status, mode, format,
            source_filename, source_object_location, source_object_key
        ) values ($1,$2,$3,'import','upload_pending','apply','tmx','crowdin.tmx','r2-primary','pending.tmx')
        returning id::text`, scope.OrganizationID, memoryID, scope.UserID).Scan(&attemptID))
	return attemptID
}

func glossaryImportStatus(t *testing.T, scope *testenv.Scope, runID string) string {
	t.Helper()
	var status string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select status from glossary_import_runs where id=$1`, runID).Scan(&status))
	return status
}

func memoryImportStatus(t *testing.T, scope *testenv.Scope, attemptID string) string {
	t.Helper()
	var status string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select status from memory_import_attempts where id=$1`, attemptID).Scan(&status))
	return status
}

func waitTMSImportLeavePending(t *testing.T, scope *testenv.Scope, query, id string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var status string
		if err := scope.Pool.QueryRow(t.Context(), query, id).Scan(&status); err == nil && status != "upload_pending" {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("import run stayed upload_pending")
}
