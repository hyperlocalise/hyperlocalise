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
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange/fixtures"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const testObjectLocation = "local"

type memoryFixture struct {
	pool           *pgxpool.Pool
	store          objectstore.Store
	objects        *objectstore.Registry
	userID         string
	organizationID string
	memoryID       string
}

func newMemoryFixture(t *testing.T) memoryFixture {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run memory interchange database tests")
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
	f := memoryFixture{
		pool:           pool,
		store:          store,
		objects:        objects,
		userID:         uuid.NewString(),
		organizationID: uuid.NewString(),
		memoryID:       uuid.NewString(),
	}
	f.exec(t, `insert into users (id, workos_user_id, email) values ($1, $2, $3)`, f.userID, "user_"+suffix, suffix+"@example.com")
	f.exec(t, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		f.organizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	f.exec(t, `insert into memories (id, organization_id, created_by_user_id, name, description, status, source) values ($1, $2, $3, 'Product TM', '', 'active', 'native')`,
		f.memoryID, f.organizationID, f.userID)
	t.Cleanup(func() {
		cleanup := context.Background()
		_, _ = pool.Exec(cleanup, `delete from organizations where id = $1`, f.organizationID)
		_, _ = pool.Exec(cleanup, `delete from users where id = $1`, f.userID)
	})
	return f
}

func (f memoryFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func (f memoryFixture) putObject(t *testing.T, key string, body []byte) {
	t.Helper()
	_, err := f.store.Put(t.Context(), objectstore.PutInput{Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: "text/plain"})
	require.NoError(t, err)
}

func (f memoryFixture) attempt(t *testing.T, operation, mode, format, key, options string) string {
	t.Helper()
	id := uuid.NewString()
	f.exec(t, `insert into memory_import_attempts (id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, options, source_object_location, source_object_key)
		values ($1, $2, $3, $4, $5, 'queued', $6, $7, $8::jsonb, $9, nullif($10, ''))`,
		id, f.organizationID, f.memoryID, f.userID, operation, mode, format, options, testObjectLocation, key)
	return id
}

func (f memoryFixture) importFile(t *testing.T, mode, format string, body []byte, options string) string {
	t.Helper()
	key := "memory-interchange/" + uuid.NewString() + "." + format
	f.putObject(t, key, body)
	return f.attempt(t, "import", mode, format, key, options)
}

func (f memoryFixture) run(t *testing.T, attemptID, operation string) error {
	t.Helper()
	return processMemoryInterchangeRun(t.Context(), f.pool, f.objects, memoryInterchangeMessage{SchemaVersion: 1, AttemptID: attemptID, Operation: operation})
}

type attemptState struct {
	Status      string
	FailureCode *string
	Counts      map[string]any
	SHA256      *string
	Header      *string
	ResultKey   *string
	ResultName  *string
	ResultType  *string
}

func (f memoryFixture) state(t *testing.T, attemptID string) attemptState {
	t.Helper()
	var state attemptState
	var counts []byte
	require.NoError(t, f.pool.QueryRow(t.Context(), `select status, failure_code, counts, source_sha256, header_srclang, result_object_key, result_filename, result_content_type from memory_import_attempts where id=$1`, attemptID).
		Scan(&state.Status, &state.FailureCode, &counts, &state.SHA256, &state.Header, &state.ResultKey, &state.ResultName, &state.ResultType))
	if len(counts) > 0 {
		require.NoError(t, json.Unmarshal(counts, &state.Counts))
	}
	return state
}

func (f memoryFixture) entryCount(t *testing.T) int {
	t.Helper()
	var count int
	require.NoError(t, f.pool.QueryRow(t.Context(), `select count(*) from memory_entries where memory_id=$1`, f.memoryID).Scan(&count))
	return count
}

func (f memoryFixture) diagnosticCodes(t *testing.T, attemptID string) []string {
	t.Helper()
	rows, err := f.pool.Query(t.Context(), `select code from memory_import_attempt_diagnostics where attempt_id=$1 order by code`, attemptID)
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

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := fixtures.Read(name)
	require.NoError(t, err)
	return data
}

func tmxUnit(tuid, source, target string) string {
	return `<tu tuid="` + tuid + `"><tuv xml:lang="en"><seg>` + source + `</seg></tuv><tuv xml:lang="vi"><seg>` + target + `</seg></tuv></tu>`
}

func tmxDocument(units ...string) []byte {
	return []byte(`<?xml version="1.0" encoding="UTF-8"?><tmx version="1.4"><header srclang="en"/><body>` + strings.Join(units, "") + `</body></tmx>`)
}

func TestMemoryImportApplyCreatesEntriesAndIsIdempotent(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.importFile(t, "apply", "csv", readFixture(t, "crowdin-two-column.csv"), `{}`)

	require.NoError(t, f.run(t, attemptID, "import"))
	state := f.state(t, attemptID)
	require.Equal(t, "completed", state.Status)
	require.EqualValues(t, 2, state.Counts["created"])
	require.EqualValues(t, 2, state.Counts["totalRead"])
	require.Len(t, state.Counts["samples"], 2)
	require.NotNil(t, state.SHA256)
	require.Len(t, *state.SHA256, 64)
	require.Equal(t, 2, f.entryCount(t))

	var activityCount int
	require.NoError(t, f.pool.QueryRow(t.Context(), `select count(*) from organization_activity_events where organization_id=$1 and event_type='translation_memory_imported' and target_id=$2`, f.organizationID, f.memoryID).Scan(&activityCount))
	require.Equal(t, 1, activityCount)

	require.NoError(t, f.run(t, attemptID, "import"))
	require.Equal(t, 2, f.entryCount(t))
	require.Equal(t, "completed", f.state(t, attemptID).Status)

	repeatID := f.importFile(t, "apply", "csv", readFixture(t, "crowdin-two-column.csv"), `{}`)
	require.NoError(t, f.run(t, repeatID, "import"))
	repeat := f.state(t, repeatID)
	require.Equal(t, "completed", repeat.Status)
	require.EqualValues(t, 0, repeat.Counts["created"])
	require.EqualValues(t, 2, repeat.Counts["skipped"])
	require.Equal(t, 2, f.entryCount(t))
}

func TestMemoryImportUpdatesEntriesByExternalKey(t *testing.T) {
	f := newMemoryFixture(t)
	firstID := f.importFile(t, "apply", "tmx", tmxDocument(tmxUnit("u1", "Discount", "Giảm giá"), tmxUnit("u2", "Cart", "Giỏ hàng")), `{}`)
	require.NoError(t, f.run(t, firstID, "import"))
	first := f.state(t, firstID)
	require.Equal(t, "completed", first.Status)
	require.NotNil(t, first.Header)
	require.Equal(t, "en", *first.Header)
	require.EqualValues(t, 2, first.Counts["created"])

	secondID := f.importFile(t, "apply", "tmx", tmxDocument(tmxUnit("u1", "Discount", "Khuyến mãi"), tmxUnit("u2", "Cart", "Giỏ hàng")), `{}`)
	require.NoError(t, f.run(t, secondID, "import"))
	second := f.state(t, secondID)
	require.Equal(t, "completed", second.Status)
	require.EqualValues(t, 2, second.Counts["updated"])
	require.EqualValues(t, 0, second.Counts["created"])

	var target string
	var version int
	require.NoError(t, f.pool.QueryRow(t.Context(), `select target_text, version from memory_entries where memory_id=$1 and external_key='tmx:u1:vi'`, f.memoryID).Scan(&target, &version))
	require.Equal(t, "Khuyến mãi", target)
	require.Equal(t, 2, version)
	require.Equal(t, 2, f.entryCount(t))
}

func TestMemoryImportPreviewDoesNotWriteEntries(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.importFile(t, "preview", "csv", readFixture(t, "crowdin-two-column.csv"), `{}`)
	require.NoError(t, f.run(t, attemptID, "import"))
	state := f.state(t, attemptID)
	require.Equal(t, "preview_completed", state.Status)
	require.EqualValues(t, 2, state.Counts["created"])
	require.Zero(t, f.entryCount(t))
}

func TestMemoryImportTruncatesToMaxUnitsAndRecordsDiagnostics(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.importFile(t, "apply", "csv", readFixture(t, "crowdin-two-column.csv"), `{"maxUnits":1}`)
	require.NoError(t, f.run(t, attemptID, "import"))
	state := f.state(t, attemptID)
	require.Equal(t, "completed", state.Status)
	require.EqualValues(t, 1, state.Counts["created"])
	require.EqualValues(t, 1, state.Counts["warned"])
	require.Equal(t, 1, f.entryCount(t))
	require.Equal(t, []string{"truncated_units"}, f.diagnosticCodes(t, attemptID))
}

func TestMemoryImportMarksPartialSuccessForInvalidUnits(t *testing.T) {
	f := newMemoryFixture(t)
	invalid := `<tu tuid="broken"><tuv xml:lang="en"><seg>Only source</seg></tuv></tu>`
	attemptID := f.importFile(t, "apply", "tmx", tmxDocument(tmxUnit("ok", "Save", "Lưu"), invalid), `{}`)
	require.NoError(t, f.run(t, attemptID, "import"))
	state := f.state(t, attemptID)
	require.Equal(t, "partially_successful", state.Status)
	require.EqualValues(t, 1, state.Counts["failed"])
	require.Equal(t, 1, f.entryCount(t))
	require.Equal(t, []string{"invalid_tu"}, f.diagnosticCodes(t, attemptID))
}

func TestMemoryImportPermanentFailures(t *testing.T) {
	tests := []struct {
		name    string
		mode    string
		format  string
		archive bool
	}{
		{name: "unsupported format", mode: "apply", format: "xliff"},
		{name: "unsupported mode", mode: "replace", format: "csv"},
		{name: "archived memory", mode: "apply", format: "csv", archive: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newMemoryFixture(t)
			if tt.archive {
				f.exec(t, `update memories set status='archived' where id=$1`, f.memoryID)
			}
			attemptID := f.importFile(t, tt.mode, tt.format, readFixture(t, "crowdin-two-column.csv"), `{}`)
			err := f.run(t, attemptID, "import")
			require.Error(t, err)
			require.True(t, isPermanentMemoryInterchangeFailure(err))
			state := f.state(t, attemptID)
			require.Equal(t, "failed", state.Status)
			require.NotNil(t, state.FailureCode)
			require.Equal(t, "memory_interchange_failed", *state.FailureCode)
			require.Zero(t, f.entryCount(t))
		})
	}
}

func TestMemoryImportRequeuesRetryableFailures(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.attempt(t, "import", "apply", "csv", "memory-interchange/missing.csv", `{}`)
	err := f.run(t, attemptID, "import")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.False(t, isPermanentMemoryInterchangeFailure(err))
	state := f.state(t, attemptID)
	require.Equal(t, "queued", state.Status)
	require.NotNil(t, state.FailureCode)
	require.Equal(t, "memory_interchange_retryable", *state.FailureCode)

	f.putObject(t, "memory-interchange/missing.csv", readFixture(t, "crowdin-two-column.csv"))
	require.NoError(t, f.run(t, attemptID, "import"))
	require.Equal(t, "completed", f.state(t, attemptID).Status)
}

func (f memoryFixture) failureMessage(t *testing.T, attemptID string) string {
	t.Helper()
	var message *string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select failure_message from memory_import_attempts where id=$1`, attemptID).Scan(&message))
	require.NotNil(t, message)
	return *message
}

func TestMemoryImportRejectsEmptyObject(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.importFile(t, "apply", "csv", nil, `{}`)
	err := f.run(t, attemptID, "import")
	require.EqualError(t, err, "memory import object is empty")
	require.True(t, isPermanentMemoryInterchangeFailure(err))
	require.Equal(t, "failed", f.state(t, attemptID).Status)
	require.Equal(t, "memory import object is empty", f.failureMessage(t, attemptID))
}

func TestMemoryImportFailsUnparseableTMX(t *testing.T) {
	for _, mode := range []string{"apply", "preview"} {
		t.Run(mode, func(t *testing.T) {
			f := newMemoryFixture(t)
			attemptID := f.importFile(t, mode, "tmx", []byte(`<tmx><body></tmx>`), `{}`)
			err := f.run(t, attemptID, "import")
			require.True(t, isPermanentMemoryInterchangeFailure(err))
			state := f.state(t, attemptID)
			require.Equal(t, "failed", state.Status)
			require.Equal(t, "memory_interchange_failed", *state.FailureCode)
			require.Equal(t, []string{"invalid_tmx"}, f.diagnosticCodes(t, attemptID))
			require.Zero(t, f.entryCount(t))
		})
	}
}

func TestMemoryImportRejectsArchivedMemoryAndModeBeforeWritingDiagnostics(t *testing.T) {
	invalid := tmxDocument(tmxUnit("ok", "Save", "Lưu"), `<tu tuid="broken"><tuv xml:lang="en"><seg>Only source</seg></tuv></tu>`)
	tests := []struct {
		name    string
		mode    string
		archive bool
		wantErr string
	}{
		{name: "archived memory", mode: "apply", archive: true, wantErr: "translation memory is archived"},
		{name: "unsupported mode", mode: "replace", wantErr: `memory import mode "replace" is not supported`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newMemoryFixture(t)
			if tt.archive {
				f.exec(t, `update memories set status='archived' where id=$1`, f.memoryID)
			}
			attemptID := f.importFile(t, tt.mode, "tmx", invalid, `{}`)
			err := f.run(t, attemptID, "import")
			require.EqualError(t, err, tt.wantErr)
			require.True(t, isPermanentMemoryInterchangeFailure(err))
			require.Equal(t, "failed", f.state(t, attemptID).Status)
			require.Empty(t, f.diagnosticCodes(t, attemptID))
		})
	}
}

func TestMemoryImportUnknownLocationIsRetryable(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.attempt(t, "import", "apply", "csv", "memory-interchange/a.csv", `{}`)
	f.exec(t, `update memory_import_attempts set source_object_location='retired' where id=$1`, attemptID)
	err := f.run(t, attemptID, "import")
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)
	require.Equal(t, "queued", f.state(t, attemptID).Status)
}

func TestMemoryInterchangeIgnoresUnknownOrMismatchedAttempts(t *testing.T) {
	f := newMemoryFixture(t)
	require.NoError(t, f.run(t, uuid.NewString(), "import"))
	exportID := f.attempt(t, "export", "apply", "csv", "", `{}`)
	require.NoError(t, f.run(t, exportID, "import"))
	require.Equal(t, "queued", f.state(t, exportID).Status)
}

func (f memoryFixture) seedEntry(t *testing.T, sourceLocale, targetLocale, source, target string) {
	t.Helper()
	f.exec(t, `insert into memory_entries (memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text, match_score, provenance)
		values ($1, $2, $3, $4, lower($4), $5, 90, 'manual')`, f.memoryID, sourceLocale, targetLocale, source, target)
}

func (f memoryFixture) readResult(t *testing.T, key string) string {
	t.Helper()
	body, _, err := f.store.Get(t.Context(), key)
	require.NoError(t, err)
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	return string(data)
}

func TestMemoryExportWritesFilteredCSV(t *testing.T) {
	f := newMemoryFixture(t)
	f.exec(t, `update memories set name='Product TM / 2026' where id=$1`, f.memoryID)
	f.seedEntry(t, "en-US", "fr-FR", "Hello", "Bonjour")
	f.seedEntry(t, "en-US", "de-DE", "Hello", "Hallo")
	attemptID := f.attempt(t, "export", "apply", " CSV ", "", `{"sourceLocale":"en_US","targetLocale":"fr_FR"}`)

	require.NoError(t, f.run(t, attemptID, "export"))
	state := f.state(t, attemptID)
	require.Equal(t, "completed", state.Status)
	require.EqualValues(t, 1, state.Counts["entries"])
	require.NotNil(t, state.ResultKey)
	require.Equal(t, "memory-interchange/local/"+f.memoryID+"/export/"+attemptID+".csv", *state.ResultKey)
	require.Equal(t, "Product-TM---2026.csv", *state.ResultName)
	require.Equal(t, "text/csv; charset=utf-8", *state.ResultType)
	body := f.readResult(t, *state.ResultKey)
	require.Contains(t, body, "Bonjour")
	require.NotContains(t, body, "Hallo")
}

func TestMemoryExportDefaultsToTMX(t *testing.T) {
	f := newMemoryFixture(t)
	f.seedEntry(t, "en", "vi", "Discount", "Khuyến mãi")
	attemptID := f.attempt(t, "export", "apply", "", "", `{"sourceLocale":"  ","targetLocale":7}`)

	require.NoError(t, f.run(t, attemptID, "export"))
	state := f.state(t, attemptID)
	require.Equal(t, "completed", state.Status)
	require.Equal(t, "application/x-tmx+xml; charset=utf-8", *state.ResultType)
	require.Equal(t, "Product-TM.tmx", *state.ResultName)
	require.Contains(t, f.readResult(t, *state.ResultKey), "Khuyến mãi")
}

func TestHandleProcessesMessagesEndToEnd(t *testing.T) {
	f := newMemoryFixture(t)
	attemptID := f.importFile(t, "apply", "csv", readFixture(t, "crowdin-two-column.csv"), `{}`)
	failingID := f.importFile(t, "apply", "xliff", readFixture(t, "crowdin-two-column.csv"), `{}`)
	handler := &memoryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{pool: f.pool}, objects: f.objects}
	message := func(id string) string {
		return `{"schemaVersion":1,"attemptId":"` + id + `","operation":"import"}`
	}

	response, err := handler.Handle(t.Context(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "ok", Body: message(attemptID)},
		{MessageId: "duplicate", Body: message(attemptID)},
		{MessageId: "permanent", Body: message(failingID)},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "permanent"}}, response.BatchItemFailures)
	require.Equal(t, "completed", f.state(t, attemptID).Status)
	require.Equal(t, "failed", f.state(t, failingID).Status)
	require.Equal(t, 2, f.entryCount(t))
}
