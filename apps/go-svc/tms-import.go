package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

// Importing a TMS glossary or memory copies it into a native one. The caller
// creates the native glossary or memory first, the same as for a file import;
// then go-svc exports from the TMS in the background, stores the file where an
// upload would land, and queues the usual interchange run.

const tmsImportTimeout = 10 * time.Minute

type tmsTokenMinter interface {
	Mint(ctx context.Context, request tmsauth.MintRequest) (*tmsauth.AccessToken, error)
}

type tmsImports struct {
	tokens tmsTokenMinter
	http   tmscatalog.HTTPDoer
}

// newTMSImportsFromEnv returns nil when the web app can't be reached for tokens;
// the TMS routes then answer 503.
func newTMSImportsFromEnv() *tmsImports {
	client, err := tmsauth.NewClient(tmsauth.Config{
		BaseURL:        tmsauth.BaseURLFromEnv(),
		CookiePassword: os.Getenv("WORKOS_COOKIE_PASSWORD"),
	})
	if err != nil {
		slog.Warn("tms_imports_disabled", "reason", err.Error())
		return nil
	}
	return &tmsImports{tokens: client, http: &http.Client{Timeout: tmsImportTimeout}}
}

type tmsConnection struct {
	CredentialID string `json:"credentialId"`
	ProviderKind string `json:"providerKind"`
	DisplayName  string `json:"displayName"`
}

type tmsResourceResponse struct {
	ExternalID    string   `json:"externalId"`
	Name          string   `json:"name"`
	SourceLocale  *string  `json:"sourceLocale"`
	TargetLocales []string `json:"targetLocales"`
	TermCount     *int     `json:"termCount,omitempty"`
	SegmentCount  *int     `json:"segmentCount,omitempty"`
}

type tmsImportRequest struct {
	CredentialID string `json:"credentialId"`
	ExternalID   string `json:"externalId"`
}

// tmsFailure is a TMS problem before a resource-specific failure wraps it.
type tmsFailure struct {
	status        int
	code, message string
}

func (e *tmsFailure) Error() string { return e.message }

// activeTMSConnection is the workspace's most recently updated TMS credential,
// which is the one the web app treats as active. Nil when none is connected.
func activeTMSConnection(ctx context.Context, db dictionaryDB, organizationID string) (*tmsConnection, error) {
	var conn tmsConnection
	err := db.QueryRow(ctx, `select id::text, provider_kind::text, display_name from organization_external_tms_provider_credentials where organization_id=$1 order by updated_at desc limit 1`, organizationID).Scan(&conn.CredentialID, &conn.ProviderKind, &conn.DisplayName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &conn, nil
}

// provider mints a token as the acting user (Crowdin can hold per-user
// connections) and returns the catalog for the connected TMS.
func (t *tmsImports) provider(ctx context.Context, db dictionaryDB, conn tmsConnection, organizationID, userID string) (tmscatalog.Provider, error) {
	if t == nil {
		return nil, &tmsFailure{http.StatusServiceUnavailable, "tms_unavailable", "TMS imports are unavailable on this server"}
	}
	if !tmscatalog.Supported(conn.ProviderKind) {
		return nil, &tmsFailure{http.StatusNotImplemented, "tms_provider_unsupported", fmt.Sprintf("Importing from %s isn't supported yet", conn.DisplayName)}
	}
	credentials, err := t.credentials(ctx, db, conn, organizationID, userID)
	if err != nil {
		return nil, err
	}
	return tmscatalog.New(conn.ProviderKind, credentials, t.http)
}

// credentials mints a short-lived token from the web app as the acting user.
// go-svc never holds the stored credential or the key that encrypts it.
func (t *tmsImports) credentials(ctx context.Context, db dictionaryDB, conn tmsConnection, organizationID, userID string) (tmscatalog.Credentials, error) {
	token, err := t.tokens.Mint(ctx, tmsauth.MintRequest{
		OrganizationID: organizationID,
		ProviderKind:   conn.ProviderKind,
		CredentialID:   conn.CredentialID,
		ActorUserID:    userID,
	})
	if err != nil {
		return tmscatalog.Credentials{}, tmsTokenFailure(conn, err)
	}
	credentials := tmscatalog.Credentials{
		BaseURL:     token.BaseURL,
		HeaderName:  token.HeaderName,
		HeaderValue: token.HeaderValue,
		AuthMode:    token.AuthMode,
	}
	if token.AccountID != nil {
		credentials.AccountID = strings.TrimSpace(*token.AccountID)
	}
	if strings.EqualFold(conn.ProviderKind, "smartling") && credentials.AccountID == "" {
		credentials.AccountID, credentials.ProjectID, err = smartlingProjectAccount(ctx, db, organizationID)
		if err != nil {
			return tmscatalog.Credentials{}, err
		}
	}
	return credentials, nil
}

// smartlingProjectAccount reads a synced Smartling project, as the web app does
// when the credential has no account UID: its cached accountUid, or its project
// ID for Smartling to resolve.
func smartlingProjectAccount(ctx context.Context, db dictionaryDB, organizationID string) (accountID, projectID string, err error) {
	err = db.QueryRow(ctx, `select coalesce(provider_metadata->>'accountUid', ''), coalesce(external_project_id, '') from projects where organization_id=$1 and external_provider_kind='smartling' order by (provider_metadata->>'accountUid' is null), created_at desc limit 1`, organizationID).Scan(&accountID, &projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return accountID, projectID, err
}

func tmsTokenFailure(conn tmsConnection, err error) error {
	var mintErr *tmsauth.Error
	if errors.As(err, &mintErr) && mintErr.Status >= 400 && mintErr.Status < 500 {
		message := strings.TrimSpace(mintErr.Message)
		if message == "" {
			message = fmt.Sprintf("Reconnect %s in Integrations, then try again", conn.DisplayName)
		}
		return &tmsFailure{http.StatusConflict, "tms_not_connected", message}
	}
	slog.Error("tms_token_mint_failed", "provider", conn.ProviderKind, "error", err)
	return &tmsFailure{http.StatusBadGateway, "tms_unreachable", fmt.Sprintf("Could not reach %s", conn.DisplayName)}
}

// tmsProviderFailure keeps the TMS's own message when it refused us, and hides
// transport details otherwise.
func tmsProviderFailure(conn tmsConnection, err error) error {
	if errors.Is(err, tmscatalog.ErrAccountRequired) {
		return &tmsFailure{http.StatusConflict, "tms_account_required", fmt.Sprintf("Add your account UID to the %s connection in Integrations, then try again", conn.DisplayName)}
	}
	var providerErr *tmscatalog.ProviderError
	if errors.As(err, &providerErr) {
		status := http.StatusBadGateway
		if providerErr.Status == http.StatusUnauthorized || providerErr.Status == http.StatusForbidden {
			status = http.StatusConflict
		}
		return &tmsFailure{status, "tms_request_failed", providerErr.Error()}
	}
	slog.Error("tms_request_failed", "provider", conn.ProviderKind, "error", err)
	return &tmsFailure{http.StatusBadGateway, "tms_unreachable", fmt.Sprintf("Could not reach %s", conn.DisplayName)}
}

// tmsExportMessage is what an import run records when the export fails.
func tmsExportMessage(conn tmsConnection, err error) string {
	var failure *tmsFailure
	if errors.As(tmsProviderFailure(conn, err), &failure) {
		return failure.message
	}
	return fmt.Sprintf("Could not export from %s", conn.DisplayName)
}

// requireTMSConnection checks the request names the workspace's active TMS.
func requireTMSConnection(ctx context.Context, db dictionaryDB, organizationID string, payload tmsImportRequest) (tmsConnection, error) {
	if strings.TrimSpace(payload.CredentialID) == "" || strings.TrimSpace(payload.ExternalID) == "" {
		return tmsConnection{}, &tmsFailure{http.StatusBadRequest, "invalid_request", "credentialId and externalId are required"}
	}
	conn, err := activeTMSConnection(ctx, db, organizationID)
	if err != nil {
		return tmsConnection{}, err
	}
	if conn == nil || conn.CredentialID != payload.CredentialID {
		return tmsConnection{}, &tmsFailure{http.StatusConflict, "tms_not_connected", "That TMS is no longer connected to this workspace"}
	}
	return *conn, nil
}

func asGlossaryFailure(err error) error {
	var failure *tmsFailure
	if errors.As(err, &failure) {
		return glossaryFailure(failure.status, failure.code, failure.message)
	}
	return err
}

func asMemoryFailure(err error) error {
	var failure *tmsFailure
	if errors.As(err, &failure) {
		return memoryFailure(failure.status, failure.code, failure.message)
	}
	return err
}

func requireTMSExportContent(export tmscatalog.Export, conn tmsConnection) error {
	if len(bytes.TrimSpace(export.Content)) == 0 {
		return &tmsFailure{http.StatusUnprocessableEntity, "tms_export_empty", fmt.Sprintf("The %s export was empty", conn.DisplayName)}
	}
	return nil
}

func tmsResources(resources []tmscatalog.Resource, countAsTerms bool) []tmsResourceResponse {
	out := make([]tmsResourceResponse, 0, len(resources))
	for _, resource := range resources {
		item := tmsResourceResponse{
			ExternalID:    resource.ExternalID,
			Name:          resource.Name,
			SourceLocale:  resource.SourceLocale,
			TargetLocales: resource.TargetLocales,
		}
		if countAsTerms {
			item.TermCount = resource.Count
		} else {
			item.SegmentCount = resource.Count
		}
		out = append(out, item)
	}
	return out
}

func tmsImportContext(r *http.Request) (context.Context, context.CancelFunc) {
	// The export outlives the request that started it.
	return context.WithTimeout(context.WithoutCancel(r.Context()), tmsImportTimeout)
}

// listTMSGlossariesHandler serves GET /v1/orgs/{slug}/tms/glossaries.
func (api *glossaryAPI) listTMSGlossariesHandler(r *http.Request, actor glossaryActor) (any, int, error) {
	conn, err := activeTMSConnection(r.Context(), api.pool, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	if conn == nil {
		return map[string]any{"connection": nil, "glossaries": []tmsResourceResponse{}}, http.StatusOK, nil
	}
	provider, err := api.tms.provider(r.Context(), api.pool, *conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, 0, asGlossaryFailure(err)
	}
	resources, err := provider.ListGlossaries(r.Context())
	if err != nil {
		return nil, 0, asGlossaryFailure(tmsProviderFailure(*conn, err))
	}
	return map[string]any{"connection": conn, "glossaries": tmsResources(resources, true)}, http.StatusOK, nil
}

// importGlossaryFromTMSHandler serves POST …/glossaries/{id}/concepts/import/from-tms.
func (api *glossaryAPI) importGlossaryFromTMSHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_unavailable", "Glossary object storage is unavailable")
	}
	if api.interchange == nil {
		return nil, 0, glossaryFailure(503, "glossary_interchange_unavailable", "Glossary interchange processing is unavailable")
	}
	var payload tmsImportRequest
	if err := readGlossaryBody(r, []string{"credentialId", "externalId"}, &payload); err != nil {
		return nil, 0, err
	}
	conn, err := requireTMSConnection(r.Context(), api.pool, actor.organizationID, payload)
	if err != nil {
		return nil, 0, asGlossaryFailure(err)
	}
	// Mint now, so a disconnected or unsupported TMS fails the request rather than the run.
	provider, err := api.tms.provider(r.Context(), api.pool, conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, 0, asGlossaryFailure(err)
	}
	runID := uuid.NewString()
	location := api.objects.DefaultLocationID()
	key := fmt.Sprintf("glossary-interchange/%s/%s/import/%s.tbx", actor.organizationID, g.ID, runID)
	filename := fmt.Sprintf("%s-glossary-%s.tbx", conn.ProviderKind, payload.ExternalID)
	_, err = api.pool.Exec(r.Context(), `insert into glossary_import_runs (id, organization_id, glossary_id, created_by_user_id, operation, format, mode, status, source_filename, source_object_location, source_object_key) values ($1,$2,$3,$4,'import','tbx','merge','upload_pending',$5,$6,$7)`, runID, actor.organizationID, g.ID, actor.userID, filename, location, key)
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := tmsImportContext(r)
	go func() {
		defer cancel()
		api.runGlossaryTMSImport(ctx, conn, provider, payload.ExternalID, runID, key)
	}()
	return map[string]any{"reportId": runID, "operation": "import", "status": "upload_pending"}, http.StatusAccepted, nil
}

func (api *glossaryAPI) runGlossaryTMSImport(ctx context.Context, conn tmsConnection, provider tmscatalog.Provider, externalID, runID, key string) {
	fail := func(code, message string) {
		_, _ = api.pool.Exec(context.WithoutCancel(ctx), `update glossary_import_runs set status='failed', error_code=$2, error_message=$3, completed_at=now() where id=$1 and status='upload_pending'`, runID, code, message)
	}
	export, err := provider.ExportGlossary(ctx, externalID, glossaryInterchangeMaxBytes)
	if err != nil {
		fail("tms_export_failed", tmsExportMessage(conn, err))
		return
	}
	if err := requireTMSExportContent(export, conn); err != nil {
		fail("tms_export_failed", tmsExportMessage(conn, err))
		return
	}
	if _, _, err := api.objects.Put(ctx, objectstore.PutInput{
		Key:         key,
		Body:        bytes.NewReader(export.Content),
		Size:        int64(len(export.Content)),
		ContentType: "application/x-tbx+xml",
		IfAbsent:    true,
	}); err != nil {
		slog.Error("tms_glossary_import_store_failed", "run_id", runID, "error", err)
		fail("tms_export_store_failed", "Could not store the exported glossary")
		return
	}
	options, _ := json.Marshal(map[string]any{"mode": "merge", "previewForMode": nil, "strictLocale": nil, "localeMapping": nil})
	updated, err := api.pool.Exec(ctx, `update glossary_import_runs set options=$2::jsonb, status='queued' where id=$1 and status='upload_pending'`, runID, options)
	if err != nil || updated.RowsAffected() == 0 {
		slog.Error("tms_glossary_import_queue_failed", "run_id", runID, "error", err)
		fail("tms_import_queue_failed", "Could not queue the glossary import")
		return
	}
	if err := api.interchange.Publish(ctx, glossaryInterchangeMessage{SchemaVersion: 1, RunID: runID, Operation: "import"}); err != nil {
		_, _ = api.pool.Exec(context.WithoutCancel(ctx), `update glossary_import_runs set status='failed', error_code='glossary_interchange_enqueue_failed', error_message=$2, completed_at=now() where id=$1`, runID, err.Error())
	}
}

// listTMSMemoriesHandler serves GET /v1/orgs/{slug}/tms/translation-memories.
func (api *memoryAPI) listTMSMemoriesHandler(r *http.Request, actor memoryActor) (any, int, error) {
	conn, err := activeTMSConnection(r.Context(), api.pool, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	if conn == nil {
		return map[string]any{"connection": nil, "memories": []tmsResourceResponse{}}, http.StatusOK, nil
	}
	provider, err := api.tms.provider(r.Context(), api.pool, *conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, 0, asMemoryFailure(err)
	}
	resources, err := provider.ListMemories(r.Context())
	if err != nil {
		return nil, 0, asMemoryFailure(tmsProviderFailure(*conn, err))
	}
	return map[string]any{"connection": conn, "memories": tmsResources(resources, false)}, http.StatusOK, nil
}

// importMemoryFromTMSHandler serves POST …/translation-memories/{id}/entries/import/from-tms.
func (api *memoryAPI) importMemoryFromTMSHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(r.Context(), actor, m, "import", true, true); denied {
		return nil, 0, err
	}
	if api.objects == nil {
		return nil, 0, memoryFailure(503, "object_storage_unavailable", "Memory object storage is unavailable")
	}
	if api.interchange == nil {
		return nil, 0, memoryFailure(503, "memory_interchange_unavailable", "Memory interchange processing is unavailable")
	}
	var payload tmsImportRequest
	if err := readMemoryBody(r, []string{"credentialId", "externalId"}, &payload); err != nil {
		return nil, 0, err
	}
	conn, err := requireTMSConnection(r.Context(), api.pool, actor.organizationID, payload)
	if err != nil {
		return nil, 0, asMemoryFailure(err)
	}
	provider, err := api.tms.provider(r.Context(), api.pool, conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, 0, asMemoryFailure(err)
	}
	attemptID := uuid.NewString()
	location := api.objects.DefaultLocationID()
	key := fmt.Sprintf("memory-interchange/%s/%s/import/%s.tmx", actor.organizationID, m.ID, attemptID)
	filename := fmt.Sprintf("%s-memory-%s.tmx", conn.ProviderKind, payload.ExternalID)
	_, err = api.pool.Exec(r.Context(), `insert into memory_import_attempts (id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, source_filename, source_object_location, source_object_key) values ($1,$2,$3,$4,'import','upload_pending','apply','tmx',$5,$6,$7)`, attemptID, actor.organizationID, m.ID, actor.userID, filename, location, key)
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := tmsImportContext(r)
	go func() {
		defer cancel()
		api.runMemoryTMSImport(ctx, conn, provider, payload.ExternalID, attemptID, key)
	}()
	return map[string]any{"attemptId": attemptID, "operation": "import", "status": "upload_pending"}, http.StatusAccepted, nil
}

func (api *memoryAPI) runMemoryTMSImport(ctx context.Context, conn tmsConnection, provider tmscatalog.Provider, externalID, attemptID, key string) {
	fail := func(code, message string) {
		_, _ = api.pool.Exec(context.WithoutCancel(ctx), `update memory_import_attempts set status='failed', failure_code=$2, failure_message=$3, completed_at=now() where id=$1 and status='upload_pending'`, attemptID, code, message)
	}
	export, err := provider.ExportMemory(ctx, externalID, MEMORY_INTERCHANGE_MAX_BYTES)
	if err != nil {
		fail("tms_export_failed", tmsExportMessage(conn, err))
		return
	}
	if err := requireTMSExportContent(export, conn); err != nil {
		fail("tms_export_failed", tmsExportMessage(conn, err))
		return
	}
	if _, _, err := api.objects.Put(ctx, objectstore.PutInput{
		Key:         key,
		Body:        bytes.NewReader(export.Content),
		Size:        int64(len(export.Content)),
		ContentType: "application/x-tmx+xml",
		IfAbsent:    true,
	}); err != nil {
		slog.Error("tms_memory_import_store_failed", "attempt_id", attemptID, "error", err)
		fail("tms_export_store_failed", "Could not store the exported translation memory")
		return
	}
	options, _ := json.Marshal(map[string]any{"maxUnits": nil, "mode": "apply"})
	updated, err := api.pool.Exec(ctx, `update memory_import_attempts set options=$2::jsonb, status='queued', source_byte_size=$3 where id=$1 and status='upload_pending'`, attemptID, options, int32(len(export.Content)))
	if err != nil || updated.RowsAffected() == 0 {
		slog.Error("tms_memory_import_queue_failed", "attempt_id", attemptID, "error", err)
		fail("tms_import_queue_failed", "Could not queue the translation memory import")
		return
	}
	if err := api.interchange.Publish(ctx, memoryInterchangeMessage{SchemaVersion: 1, AttemptID: attemptID, Operation: "import"}); err != nil {
		_, _ = api.pool.Exec(context.WithoutCancel(ctx), `update memory_import_attempts set status='failed', failure_code='memory_interchange_enqueue_failed', completed_at=now() where id=$1`, attemptID)
	}
}
