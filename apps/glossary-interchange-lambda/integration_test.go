package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const testObjectLocation = "local"

type glossaryFixture struct {
	pool           *pgxpool.Pool
	store          objectstore.Store
	objects        *objectstore.Registry
	userID         string
	organizationID string
	glossaryID     string
}

type runState struct {
	Status       string
	ErrorCode    *string
	ErrorMessage *string
	Counts       map[string]int
	ResultKey    *string
	ResultName   *string
	BackupKey    *string
}

type glossaryTermRow struct {
	ID, ConceptID, Locale, Term, Description string
}

func newGlossaryFixture(t *testing.T) glossaryFixture {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run glossary interchange database tests")
	}
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))

	store := memory.New()
	objects, err := objectstore.NewRegistry(testObjectLocation, map[string]objectstore.Store{testObjectLocation: store})
	require.NoError(t, err)
	suffix := uuid.NewString()
	f := glossaryFixture{
		pool:           pool,
		store:          store,
		objects:        objects,
		userID:         uuid.NewString(),
		organizationID: uuid.NewString(),
		glossaryID:     uuid.NewString(),
	}
	f.exec(t, `insert into users (id, workos_user_id, email) values ($1, $2, $3)`, f.userID, "user_"+suffix, suffix+"@example.com")
	f.exec(t, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		f.organizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	f.exec(t, `insert into glossaries (id, organization_id, name, source_locale, locale_coverage) values ($1, $2, 'Product Glossary', 'en-US', '["fr-FR"]'::jsonb)`,
		f.glossaryID, f.organizationID)
	t.Cleanup(func() {
		cleanup := context.Background()
		_, _ = pool.Exec(cleanup, `delete from organizations where id = $1`, f.organizationID)
		_, _ = pool.Exec(cleanup, `delete from users where id = $1`, f.userID)
	})
	return f
}

func (f glossaryFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func (f glossaryFixture) queueRun(t *testing.T, operation, format, mode, key, options string) string {
	t.Helper()
	id := uuid.NewString()
	f.exec(t, `insert into glossary_import_runs (id, organization_id, glossary_id, created_by_user_id, operation, format, mode, status, source_object_location, source_object_key, options)
		values ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, nullif($9, ''), $10::jsonb)`,
		id, f.organizationID, f.glossaryID, f.userID, operation, format, mode, testObjectLocation, key, options)
	return id
}

func (f glossaryFixture) importRun(t *testing.T, format, mode string, body []byte, options string) string {
	t.Helper()
	key := "glossary-interchange/" + uuid.NewString() + "." + format
	_, err := f.store.Put(t.Context(), objectstore.PutInput{Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: "text/plain"})
	require.NoError(t, err)
	return f.queueRun(t, "import", format, mode, key, options)
}

func (f glossaryFixture) process(t *testing.T, runID, operation string) error {
	t.Helper()
	return processRun(t.Context(), f.pool, f.objects, interchangeMessage{SchemaVersion: 1, RunID: runID, Operation: operation})
}

func (f glossaryFixture) state(t *testing.T, runID string) runState {
	t.Helper()
	var state runState
	var counts []byte
	require.NoError(t, f.pool.QueryRow(t.Context(), `select status, error_code, error_message, coalesce(counts, '{}'::jsonb), result_object_key, result_filename, backup_object_key from glossary_import_runs where id=$1`, runID).
		Scan(&state.Status, &state.ErrorCode, &state.ErrorMessage, &counts, &state.ResultKey, &state.ResultName, &state.BackupKey))
	require.NoError(t, json.Unmarshal(counts, &state.Counts))
	return state
}

func (f glossaryFixture) terms(t *testing.T) []glossaryTermRow {
	t.Helper()
	rows, err := f.pool.Query(t.Context(), `select id::text, concept_id::text, locale, term, coalesce(description, '') from glossary_terms where glossary_id=$1 and archived_at is null order by locale, term`, f.glossaryID)
	require.NoError(t, err)
	defer rows.Close()
	var terms []glossaryTermRow
	for rows.Next() {
		var term glossaryTermRow
		require.NoError(t, rows.Scan(&term.ID, &term.ConceptID, &term.Locale, &term.Term, &term.Description))
		terms = append(terms, term)
	}
	require.NoError(t, rows.Err())
	return terms
}

func (f glossaryFixture) conceptCount(t *testing.T) int {
	t.Helper()
	var count int
	require.NoError(t, f.pool.QueryRow(t.Context(), `select count(*) from glossary_concepts where glossary_id=$1`, f.glossaryID).Scan(&count))
	return count
}

func (f glossaryFixture) reportCodes(t *testing.T, runID string) []string {
	t.Helper()
	rows, err := f.pool.Query(t.Context(), `select code from glossary_import_report_entries where run_id=$1 order by code`, runID)
	require.NoError(t, err)
	defer rows.Close()
	var codes []string
	for rows.Next() {
		var code string
		require.NoError(t, rows.Scan(&code))
		codes = append(codes, code)
	}
	require.NoError(t, rows.Err())
	return codes
}

func (f glossaryFixture) readObject(t *testing.T, key string) []byte {
	t.Helper()
	body, _, err := f.store.Get(t.Context(), key)
	require.NoError(t, err)
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	return data
}

const seedCSV = "conceptId,locale,term,primaryTerm,description\n" +
	"checkout,en-US,Checkout,Checkout,Pay for the order\n" +
	"checkout,fr-FR,Paiement,Checkout,\n" +
	"cart,en-US,Cart,Cart,\n"

func (f glossaryFixture) seed(t *testing.T) {
	t.Helper()
	runID := f.importRun(t, "csv", "create", []byte(seedCSV), `{}`)
	require.NoError(t, f.process(t, runID, "import"))
	require.Equal(t, "completed", f.state(t, runID).Status)
}

func TestImportCreatesConceptsAndIgnoresDuplicates(t *testing.T) {
	f := newGlossaryFixture(t)
	runID := f.importRun(t, "csv", "create", []byte(seedCSV), `{}`)
	require.NoError(t, f.process(t, runID, "import"))

	state := f.state(t, runID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, 2, state.Counts["concepts"])
	require.Equal(t, 3, state.Counts["terms"])
	require.Equal(t, 3, state.Counts["termsCreated"])
	require.Equal(t, 2, state.Counts["conceptsCreated"])
	require.Equal(t, 2, f.conceptCount(t))
	terms := f.terms(t)
	require.Len(t, terms, 3)
	require.Equal(t, "Pay for the order", terms[1].Description)

	var coverage []string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select locale_coverage from glossaries where id=$1`, f.glossaryID).Scan(&coverage))
	require.Equal(t, []string{"fr-FR"}, coverage)

	var actorKind, payload string
	var actorUserID *string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select actor_kind, actor_user_id::text, payload::text from organization_activity_events where organization_id=$1 and event_type='glossary_imported' and target_id=$2`, f.organizationID, f.glossaryID).
		Scan(&actorKind, &actorUserID, &payload))
	require.Equal(t, "user", actorKind)
	require.Equal(t, f.userID, *actorUserID)
	require.JSONEq(t, `{"batchId":"`+runID+`","itemCount":3,"resourceId":"`+f.glossaryID+`"}`, payload)

	require.NoError(t, f.process(t, runID, "import"))
	require.NoError(t, f.process(t, uuid.NewString(), "import"))
	require.NoError(t, f.process(t, runID, "export"))
	require.Len(t, f.terms(t), 3)

	again := f.importRun(t, "csv", "create", []byte(seedCSV), `{}`)
	require.NoError(t, f.process(t, again, "import"))
	state = f.state(t, again)
	require.Equal(t, "completed", state.Status)
	require.Zero(t, state.Counts["termsCreated"])
	require.Equal(t, 2, f.conceptCount(t))
}

func TestImportUpdateAndMergeUseStableIDs(t *testing.T) {
	f := newGlossaryFixture(t)
	f.seed(t)
	terms := f.terms(t)
	checkout := terms[1]
	require.Equal(t, "Checkout", checkout.Term)

	update := "conceptId,termId,locale,term,description,subject\n" +
		checkout.ConceptID + "," + checkout.ID + ",en-US,Checkout,Updated description,Commerce\n" +
		"unknown-concept,,en-US,Brand new,,\n"
	runID := f.importRun(t, "csv", "update", []byte(update), `{}`)
	require.NoError(t, f.process(t, runID, "import"))
	state := f.state(t, runID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, 1, state.Counts["termsUpdated"])
	require.Equal(t, 1, state.Counts["conceptsUpdated"])
	require.Zero(t, state.Counts["termsCreated"])
	var subject string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select subject from glossary_concepts where id=$1`, checkout.ConceptID).Scan(&subject))
	require.Equal(t, "Commerce", subject)
	require.Len(t, f.terms(t), 3)
	require.Equal(t, "Updated description", f.terms(t)[1].Description)

	merge := "conceptId,locale,term,primaryTerm\n" +
		"c-" + checkout.ConceptID + ",en-US,Check out,Checkout\n" +
		"new-concept,en-US,Wishlist,Wishlist\n"
	mergeID := f.importRun(t, "csv", "merge", []byte(merge), `{}`)
	require.NoError(t, f.process(t, mergeID, "import"))
	state = f.state(t, mergeID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, 2, state.Counts["termsMerged"])
	require.Equal(t, 1, state.Counts["conceptsMerged"])
	require.Equal(t, 1, state.Counts["conceptsCreated"])
	require.Equal(t, 3, f.conceptCount(t))
	require.Len(t, f.terms(t), 5)
}

func TestImportRefusesToMoveTermsBetweenConcepts(t *testing.T) {
	f := newGlossaryFixture(t)
	f.seed(t)
	terms := f.terms(t)
	cart, checkout := terms[0], terms[1]
	require.NotEqual(t, cart.ConceptID, checkout.ConceptID)

	body := "conceptId,termId,locale,term\n" + cart.ConceptID + "," + checkout.ID + ",en-US,Checkout\n"
	runID := f.importRun(t, "csv", "merge", []byte(body), `{}`)
	err := f.process(t, runID, "import")
	require.ErrorContains(t, err, "belongs to another concept")
	require.True(t, isPermanentGlossaryInterchangeFailure(err))
	state := f.state(t, runID)
	require.Equal(t, "failed", state.Status)
	require.Equal(t, "glossary_interchange_failed", *state.ErrorCode)
	require.Contains(t, *state.ErrorMessage, "belongs to another concept")
	require.Equal(t, terms, f.terms(t))
}

func TestImportPreviewReportsDiagnosticsWithoutWriting(t *testing.T) {
	f := newGlossaryFixture(t)
	body := "conceptId,locale,term\n" +
		"ok,en_us,Hello\n" +
		"ok,fr-FR,Bonjour\n" +
		"no-source,fr-FR,Seulement\n" +
		"bad-locale,not a locale!,Broken\n"
	runID := f.importRun(t, "csv", "preview", []byte(body), `{}`)
	require.NoError(t, f.process(t, runID, "import"))
	state := f.state(t, runID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, map[string]int{"concepts": 1, "terms": 2}, state.Counts)
	require.Equal(t, []string{"concept_has_no_valid_terms", "invalid_locale", "missing_source_locale"}, f.reportCodes(t, runID))
	require.Zero(t, f.conceptCount(t))

	relaxed := f.importRun(t, "csv", "preview", []byte(body), `{"strictLocale":false}`)
	require.NoError(t, f.process(t, relaxed, "import"))
	require.Equal(t, map[string]int{"concepts": 2, "terms": 3}, f.state(t, relaxed).Counts)
	require.Equal(t, []string{"concept_has_no_valid_terms", "invalid_locale"}, f.reportCodes(t, relaxed))
}

func TestImportReplace(t *testing.T) {
	f := newGlossaryFixture(t)
	f.seed(t)

	invalid := "conceptId,locale,term\nonly-french,fr-FR,Panier\n"
	rejected := f.importRun(t, "csv", "replace", []byte(invalid), `{}`)
	require.NoError(t, f.process(t, rejected, "import"))
	state := f.state(t, rejected)
	require.Equal(t, "failed", state.Status)
	require.Equal(t, "replace_requires_valid_input", *state.ErrorCode)
	require.Equal(t, []string{"missing_source_locale"}, f.reportCodes(t, rejected))
	require.Equal(t, 2, f.conceptCount(t))

	valid := "conceptId,locale,term\nbasket,en-US,Basket\nbasket,de-DE,Warenkorb\n"
	runID := f.importRun(t, "csv", "replace", []byte(valid), `{}`)
	require.NoError(t, f.process(t, runID, "import"))
	state = f.state(t, runID)
	require.Equal(t, "completed", state.Status)
	require.NotNil(t, state.BackupKey)
	require.Contains(t, string(f.readObject(t, *state.BackupKey)), "Paiement")
	require.Equal(t, 1, f.conceptCount(t))
	terms := f.terms(t)
	require.Len(t, terms, 2)
	require.Equal(t, "Warenkorb", terms[0].Term)

	var coverage []string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select locale_coverage from glossaries where id=$1`, f.glossaryID).Scan(&coverage))
	require.Equal(t, []string{"de-DE"}, coverage)
}

func TestImportFailuresMarkRunFailed(t *testing.T) {
	f := newGlossaryFixture(t)
	tests := []struct {
		name    string
		format  string
		body    []byte
		options string
		wantErr string
	}{
		{name: "row diagnostics", format: "csv", body: []byte("conceptId,locale,term\nc1,en-US,\n"), options: `{}`, wantErr: "Row 2 is missing conceptId, locale, or term"},
		{name: "unreadable workbook", format: "xlsx", body: []byte("not a workbook"), options: `{}`, wantErr: "zip"},
		{name: "bad options", format: "csv", body: []byte("conceptId,locale,term\nc1,en-US,Hi\n"), options: `[]`, wantErr: "decode import options"},
		{name: "empty file", format: "csv", body: nil, options: `{}`, wantErr: "glossary import object is empty"},
		{name: "oversized file", format: "csv", body: make([]byte, maxGlossaryInterchangeBytes+1), options: `{}`, wantErr: "exceeds the 25 MB limit"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runID := f.importRun(t, tt.format, "create", tt.body, tt.options)
			err := f.process(t, runID, "import")
			require.ErrorContains(t, err, tt.wantErr)
			require.True(t, isPermanentGlossaryInterchangeFailure(err))
			state := f.state(t, runID)
			require.Equal(t, "failed", state.Status)
			require.Equal(t, "glossary_interchange_failed", *state.ErrorCode)
			require.Contains(t, *state.ErrorMessage, tt.wantErr)
		})
	}
	require.Zero(t, f.conceptCount(t))
}

func TestImportEmptyFileIsNotReportedAsOversized(t *testing.T) {
	f := newGlossaryFixture(t)
	runID := f.importRun(t, "csv", "create", nil, `{}`)
	err := f.process(t, runID, "import")
	require.EqualError(t, err, "glossary import object is empty")
	require.NotContains(t, *f.state(t, runID).ErrorMessage, "25 MB")
}

func TestImportRequeuesRetryableFailures(t *testing.T) {
	f := newGlossaryFixture(t)
	key := "glossary-interchange/" + uuid.NewString() + ".csv"
	runID := f.queueRun(t, "import", "csv", "create", key, `{}`)

	err := f.process(t, runID, "import")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.False(t, isPermanentGlossaryInterchangeFailure(err))
	state := f.state(t, runID)
	require.Equal(t, "queued", state.Status)
	require.Equal(t, "glossary_interchange_retryable", *state.ErrorCode)
	var completedAt, processingStartedAt *string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select completed_at::text, processing_started_at::text from glossary_import_runs where id=$1`, runID).Scan(&completedAt, &processingStartedAt))
	require.Nil(t, completedAt)
	require.Nil(t, processingStartedAt)

	_, err = f.store.Put(t.Context(), objectstore.PutInput{Key: key, Body: strings.NewReader(seedCSV), Size: int64(len(seedCSV)), ContentType: "text/csv"})
	require.NoError(t, err)
	require.NoError(t, f.process(t, runID, "import"))
	require.Equal(t, "completed", f.state(t, runID).Status)
	require.Len(t, f.terms(t), 3)
}

func TestImportUnknownLocationIsRetryable(t *testing.T) {
	f := newGlossaryFixture(t)
	runID := f.queueRun(t, "import", "csv", "create", "glossary-interchange/a.csv", `{}`)
	f.exec(t, `update glossary_import_runs set source_object_location='retired' where id=$1`, runID)
	err := f.process(t, runID, "import")
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)
	require.Equal(t, "queued", f.state(t, runID).Status)
}

func TestExportWritesResultObject(t *testing.T) {
	f := newGlossaryFixture(t)
	f.seed(t)

	runID := f.queueRun(t, "export", "csv", "create", "", `{"scope":"filtered","locales":["fr_FR"]}`)
	require.NoError(t, f.process(t, runID, "export"))
	state := f.state(t, runID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, map[string]int{"concepts": 1, "terms": 1}, state.Counts)
	require.Equal(t, "glossary-"+f.glossaryID+".csv", *state.ResultName)
	require.Equal(t, "glossary-interchange/"+f.organizationID+"/"+f.glossaryID+"/export/"+runID+".csv", *state.ResultKey)
	concepts, diagnostics, err := decodeDocument("csv", f.readObject(t, *state.ResultKey))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.Equal(t, "Paiement", concepts[0].Terms[0].Term)

	tbxID := f.queueRun(t, "export", "tbx", "create", "", `{"modifiedFrom":"2000-01-01T00:00:00Z"}`)
	require.NoError(t, f.process(t, tbxID, "export"))
	state = f.state(t, tbxID)
	require.Equal(t, map[string]int{"concepts": 2, "terms": 3}, state.Counts)
	require.True(t, strings.HasSuffix(*state.ResultKey, ".tbx"))

	badID := f.queueRun(t, "export", "csv", "create", "", `{"modifiedFrom":"yesterday"}`)
	err = f.process(t, badID, "export")
	require.ErrorContains(t, err, "decode modifiedFrom")
	require.True(t, isPermanentGlossaryInterchangeFailure(err))
	require.Equal(t, "failed", f.state(t, badID).Status)
}

func TestHandleProcessesGlossaryBatch(t *testing.T) {
	f := newGlossaryFixture(t)
	importID := f.importRun(t, "csv", "create", []byte(seedCSV), `{}`)
	permanentID := f.importRun(t, "csv", "create", []byte("conceptId,locale,term\nc1,,x\n"), `{}`)
	retryableID := f.queueRun(t, "import", "csv", "create", "glossary-interchange/"+uuid.NewString()+".csv", `{}`)
	handler := &glossaryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{pool: f.pool}, objects: f.objects}
	message := func(id string) string {
		return `{"schemaVersion":1,"runId":"` + id + `","operation":"import"}`
	}

	response, err := handler.Handle(t.Context(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "first", Body: message(importID)},
		{MessageId: "duplicate", Body: message(importID)},
		{MessageId: "permanent", Body: message(permanentID)},
		{MessageId: "retryable", Body: message(retryableID)},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "retryable"}}, response.BatchItemFailures)
	require.Equal(t, "completed", f.state(t, importID).Status)
	require.Equal(t, "failed", f.state(t, permanentID).Status)
	require.Equal(t, "queued", f.state(t, retryableID).Status)
	require.Len(t, f.terms(t), 3)
}
