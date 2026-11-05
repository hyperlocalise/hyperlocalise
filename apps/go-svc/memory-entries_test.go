package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

const (
	memoryUnitMemoryID = "44444444-4444-4444-8444-444444444444"
	memoryUnitEntryID  = "55555555-5555-4555-8555-555555555555"
	memoryUnitUserID   = "66666666-6666-4666-8666-666666666666"
)

var (
	memoryUnitCreatedAt = time.Date(2026, 1, 2, 3, 4, 5, 123456000, time.UTC)
	memoryUnitUpdatedAt = time.Date(2026, 1, 3, 3, 4, 5, 0, time.UTC)
)

func requireMemoryFailure(t *testing.T, err error, status int, code string) any {
	t.Helper()
	var failure *memoryError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
	return failure.details
}

func memoryUnitActor(role string) memoryActor {
	return memoryActor{userID: memoryUnitUserID, organizationID: "22222222-2222-4222-8222-222222222222", role: role}
}

func memoryUnitNative() memoryRecord {
	return memoryRecord{ID: memoryUnitMemoryID, Source: "native", Status: "active"}
}

func memoryUnitRequest(method, body string) *http.Request {
	return httptest.NewRequest(method, "/", strings.NewReader(body))
}

func memoryUnitEntryValues(sourceText string, version int, extra ...any) []any {
	return append([]any{
		memoryUnitEntryID, memoryUnitMemoryID, "en-US", "fr-FR", sourceText, "Bonjour", 100, "manual", "pending", version,
		nil, memoryUnitUserID, nil, nil, nil, []byte(`{"context":"home"}`), memoryUnitCreatedAt, memoryUnitUpdatedAt, nil,
	}, extra...)
}

func memoryUnitDetailSteps() []dbStep {
	return []dbStep{
		{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 2, "hello")},
		{op: opQuery, table: [][]any{{memoryUnitUserID, "Ada Lovelace"}}},
		{op: opQuery},
		{op: opQuery},
	}
}

func TestScanMemoryEntry(t *testing.T) {
	values := memoryUnitEntryValues("Hello", 1, "hello")
	values[15] = nil
	var normalized string
	entry, err := scanMemoryEntry(scriptScanRow{values: values}, &normalized)
	require.NoError(t, err)
	require.Equal(t, "hello", normalized)
	require.JSONEq(t, `{}`, string(entry.Metadata))
	require.Equal(t, "2026-01-02T03:04:05.123456Z", entry.CreatedAt)
	require.Equal(t, "2026-01-03T03:04:05.000000Z", entry.UpdatedAt)
	require.Nil(t, entry.ReviewedAt)
	require.Equal(t, memoryUnitUserID, *entry.CreatedByUserID)

	reviewed := memoryUnitUpdatedAt
	values = memoryUnitEntryValues("Hello", 1)
	values[18] = reviewed
	entry, err = scanMemoryEntry(scriptScanRow{values: values})
	require.NoError(t, err)
	require.JSONEq(t, `{"context":"home"}`, string(entry.Metadata))
	require.Equal(t, "2026-01-03T03:04:05.000000Z", *entry.ReviewedAt)

	_, err = scanMemoryEntry(errorRow{err: pgx.ErrNoRows})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestMemoryEntryChangedContentFields(t *testing.T) {
	current := memoryEntryRecord{
		SourceLocale: "en", TargetLocale: "fr", SourceText: "a", TargetText: "b", MatchScore: 90,
		ReviewStatus: "pending", Metadata: json.RawMessage(`{"a":1,"b":[1,2]}`),
	}
	require.Equal(t, []string{}, memoryEntryChangedContentFields(current, current))

	next := current
	next.ReviewStatus = "approved"
	next.Metadata = json.RawMessage(`{ "b": [1, 2], "a": 1 }`)
	require.Equal(t, []string{}, memoryEntryChangedContentFields(current, next))

	next = memoryEntryRecord{
		SourceLocale: "en-GB", TargetLocale: "de", SourceText: "c", TargetText: "d", MatchScore: 80,
		Metadata: json.RawMessage(`{"a":2}`),
	}
	require.Equal(t, []string{"sourceLocale", "targetLocale", "sourceText", "targetText", "matchScore", "metadata"}, memoryEntryChangedContentFields(current, next))
}

func TestIsMemoryEntryMetadataObject(t *testing.T) {
	for raw, want := range map[string]bool{
		`{}`:            true,
		`{"context":1}`: true,
		` { } `:         true,
		`null`:          false,
		`[]`:            false,
		`"x"`:           false,
		`0`:             false,
		`false`:         false,
	} {
		require.Equal(t, want, isMemoryEntryMetadataObject(json.RawMessage(raw)), raw)
	}
}

func TestMemoryEntryMetadataEqual(t *testing.T) {
	for _, tc := range []struct {
		a, b  string
		equal bool
	}{
		{a: `{"a":1,"b":2}`, b: `{"b":2,"a":1}`, equal: true},
		{a: `{"a":1}`, b: `{"a":1.0}`, equal: true},
		{a: `{}`, b: `null`},
		{a: `{"a":1}`, b: `{"a":"1"}`},
		{a: `not json`, b: `not json`, equal: true},
		{a: `not json`, b: `{}`},
	} {
		require.Equal(t, tc.equal, memoryEntryMetadataEqual(json.RawMessage(tc.a), json.RawMessage(tc.b)), tc.a+" vs "+tc.b)
	}
}

func TestMustMemoryEventJSON(t *testing.T) {
	require.Equal(t, `["sourceText"]`, mustMemoryEventJSON([]string{"sourceText"}))
	require.Equal(t, `{"provenance":"manual"}`, mustMemoryEventJSON(map[string]any{"provenance": "manual"}))
	require.Equal(t, `{}`, mustMemoryEventJSON(map[string]any{"bad": make(chan int)}))
}

func TestMemoryEntryHandlersRejectInvalidEntryIDs(t *testing.T) {
	api := &memoryAPI{}
	actor := memoryUnitActor("admin")
	for _, entryID := range []string{"", "nope", strings.Repeat("a", 36)} {
		for _, handler := range []func(*http.Request, memoryActor, memoryRecord) (any, int, error){
			api.getMemoryEntryHandler, api.patchMemoryEntryHandler, api.deleteMemoryEntryHandler,
		} {
			req := memoryUnitRequest(http.MethodGet, "")
			req.SetPathValue("entryId", entryID)
			_, _, err := handler(req, actor, memoryUnitNative())
			requireMemoryFailure(t, err, http.StatusNotFound, "memory_not_found")
		}
	}
}

func TestCreateMemoryEntryValidation(t *testing.T) {
	api := &memoryAPI{}
	valid := `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Hello","targetText":"Bonjour"}`
	archived := memoryUnitNative()
	archived.Status = "archived"
	external := memoryUnitNative()
	external.Source = "external_tms"

	for _, tc := range []struct {
		name, role, body string
		memory           memoryRecord
		status           int
		code             string
	}{
		{name: "reviewer", role: "reviewer", body: valid, memory: memoryUnitNative(), status: 403, code: "forbidden"},
		{name: "external", role: "admin", body: valid, memory: external, status: 403, code: "external_tms_memory_immutable"},
		{name: "archived", role: "admin", body: valid, memory: archived, status: 403, code: "memory_action_archived"},
		{name: "missing target", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Hello"}`},
		{name: "null field", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Hello","targetText":null}`},
		{name: "blank locale", role: "admin", body: `{"sourceLocale":"  ","targetLocale":"fr","sourceText":"Hello","targetText":"Bonjour"}`},
		{name: "blank source", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"   ","targetText":"Bonjour"}`},
		{name: "source too long", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"` + strings.Repeat("a", 100001) + `","targetText":""}`},
		{name: "target too long", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"a","targetText":"` + strings.Repeat("a", 100001) + `"}`},
		{name: "score too high", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"a","targetText":"b","matchScore":101}`},
		{name: "score negative", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"a","targetText":"b","matchScore":-1}`},
		{name: "score fraction", role: "admin", body: `{"sourceLocale":"en","targetLocale":"fr","sourceText":"a","targetText":"b","matchScore":1.5}`},
		{name: "trailing data", role: "admin", body: valid + `{}`},
		{name: "not an object", role: "admin", body: `[]`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			memory := tc.memory
			if memory.ID == "" {
				memory = memoryUnitNative()
			}
			status, code := tc.status, tc.code
			if code == "" {
				status, code = http.StatusBadRequest, "invalid_memory_payload"
			}
			_, _, err := api.createMemoryEntryHandler(memoryUnitRequest(http.MethodPost, tc.body), memoryUnitActor(tc.role), memory)
			requireMemoryFailure(t, err, status, code)
		})
	}
}

func TestCreateMemoryEntryScripted(t *testing.T) {
	body := `{"sourceLocale":"en_US","targetLocale":" fr_FR ","sourceText":"Hello","targetText":"Bonjour","matchScore":0,"reviewStatus":"approved"}`
	boom := errors.New("boom")

	t.Run("duplicate", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opQueryRow, scan: []any{memoryUnitEntryID}}}}
		_, _, err := (&memoryAPI{pool: pool}).createMemoryEntry(memoryUnitRequest(http.MethodPost, body), memoryUnitActor("admin"), memoryUnitNative())
		requireMemoryFailure(t, err, http.StatusConflict, "duplicate_memory_entry")
		requireScriptDone(t, pool)
	})

	t.Run("created", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opBegin},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 1)},
			{op: opExec},
			{op: opExec},
		}}
		value, status, err := (&memoryAPI{pool: pool}).createMemoryEntry(memoryUnitRequest(http.MethodPost, body), memoryUnitActor("localization_manager"), memoryUnitNative())
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, status)
		require.Equal(t, memoryUnitEntryID, value.(map[string]any)["memoryEntry"].(memoryEntryRecord).ID)
		requireScriptDone(t, pool)
	})

	t.Run("unique violation from a concurrent create", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opBegin},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, err: &pgconn.PgError{Code: "23505", ConstraintName: "memory_entries_memory_locale_source_key"}},
		}}
		_, _, err := (&memoryAPI{pool: pool}).createMemoryEntry(memoryUnitRequest(http.MethodPost, body), memoryUnitActor("admin"), memoryUnitNative())
		requireMemoryFailure(t, err, http.StatusConflict, "duplicate_memory_entry")
		requireScriptDone(t, pool)
	})

	t.Run("missing events table is skipped", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opBegin},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 1)},
			{op: opExec},
			{op: opExec, err: &pgconn.PgError{Code: "42P01"}},
			{op: opExec},
		}}
		_, status, err := (&memoryAPI{pool: pool}).createMemoryEntry(memoryUnitRequest(http.MethodPost, body), memoryUnitActor("admin"), memoryUnitNative())
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, status)
		requireScriptDone(t, pool)
	})

	for name, steps := range map[string][]dbStep{
		"begin":     {{op: opBegin, err: boom}},
		"lookup":    {{op: opBegin}, {op: opQueryRow, err: boom}},
		"insert":    {{op: opBegin}, {op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: boom}},
		"savepoint": {{op: opBegin}, {op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, scan: memoryUnitEntryValues("Hello", 1)}, {op: opExec, err: boom}},
		"rollback": {
			{op: opBegin},
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 1)},
			{op: opExec},
			{op: opExec, err: errors.New("no table")},
			{op: opExec, err: boom},
		},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: steps}
			_, _, err := (&memoryAPI{pool: pool}).createMemoryEntry(memoryUnitRequest(http.MethodPost, body), memoryUnitActor("admin"), memoryUnitNative())
			require.ErrorIs(t, err, boom)
			requireScriptDone(t, pool)
		})
	}
}

func TestPatchMemoryEntryValidation(t *testing.T) {
	api := &memoryAPI{}
	archived := memoryUnitNative()
	archived.Status = "archived"
	external := memoryUnitNative()
	external.Source = "external_tms"

	for _, tc := range []struct {
		name, role, body string
		memory           memoryRecord
		status           int
		code             string
	}{
		{name: "external", role: "admin", body: `{"expectedVersion":1}`, memory: external, status: 403, code: "external_tms_memory_immutable"},
		{name: "archived", role: "admin", body: `{"expectedVersion":1}`, memory: archived, status: 403, code: "memory_action_archived"},
		{name: "missing version", role: "admin", body: `{"targetText":"x"}`, status: 400, code: "invalid_memory_payload"},
		{name: "zero version", role: "admin", body: `{"targetText":"x","expectedVersion":0}`, status: 400, code: "invalid_memory_payload"},
		{name: "null text", role: "admin", body: `{"targetText":null,"expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
		{name: "translator review", role: "translator", body: `{"reviewStatus":"approved","expectedVersion":1}`, status: 403, code: "forbidden"},
		{name: "reviewer edit", role: "reviewer", body: `{"targetText":"x","expectedVersion":1}`, status: 403, code: "forbidden"},
		{name: "reviewer edit with review", role: "reviewer", body: `{"targetText":"x","reviewStatus":"approved","expectedVersion":1}`, status: 403, code: "forbidden"},
		{name: "null metadata", role: "admin", body: `{"metadata":null,"expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
		{name: "array metadata", role: "admin", body: `{"metadata":[],"expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
		{name: "string metadata", role: "admin", body: `{"metadata":"context","expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
		{name: "number metadata", role: "admin", body: `{"metadata":1,"expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
		{name: "boolean metadata", role: "admin", body: `{"metadata":true,"expectedVersion":1}`, status: 400, code: "invalid_memory_payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			memory := tc.memory
			if memory.ID == "" {
				memory = memoryUnitNative()
			}
			_, _, err := api.patchMemoryEntry(memoryUnitRequest(http.MethodPatch, tc.body), memoryUnitActor(tc.role), memory, memoryUnitEntryID)
			requireMemoryFailure(t, err, tc.status, tc.code)
		})
	}
}

func TestPatchMemoryEntryScripted(t *testing.T) {
	current := dbStep{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 2, "hello")}
	patch := func(t *testing.T, pool *scriptPool, role, body string) (any, int, error) {
		t.Helper()
		return (&memoryAPI{pool: pool}).patchMemoryEntry(memoryUnitRequest(http.MethodPatch, body), memoryUnitActor(role), memoryUnitNative(), memoryUnitEntryID)
	}

	t.Run("missing", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opQueryRow, err: pgx.ErrNoRows}}}
		_, _, err := patch(t, pool, "admin", `{"targetText":"Salut","expectedVersion":2}`)
		requireMemoryFailure(t, err, http.StatusNotFound, "memory_not_found")
	})

	t.Run("stale", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, current}}
		_, _, err := patch(t, pool, "admin", `{"targetText":"Salut","expectedVersion":1}`)
		details := requireMemoryFailure(t, err, http.StatusConflict, "stale_memory_entry")
		require.Equal(t, 2, details.(map[string]any)["memoryEntry"].(memoryEntryRecord).Version)
	})

	for name, body := range map[string]string{
		"blank locale":   `{"sourceLocale":" ","expectedVersion":2}`,
		"blank source":   `{"sourceText":"  ","expectedVersion":2}`,
		"score too high": `{"matchScore":101,"expectedVersion":2}`,
		"score negative": `{"matchScore":-5,"expectedVersion":2}`,
		"review status":  `{"reviewStatus":"maybe","expectedVersion":2}`,
	} {
		t.Run(name, func(t *testing.T) {
			pool := &scriptPool{steps: []dbStep{{op: opBegin}, current}}
			_, _, err := patch(t, pool, "admin", body)
			requireMemoryFailure(t, err, http.StatusBadRequest, "invalid_memory_payload")
			requireScriptDone(t, pool)
		})
	}

	t.Run("no change returns the detail", func(t *testing.T) {
		pool := &scriptPool{steps: append([]dbStep{{op: opBegin}, current}, memoryUnitDetailSteps()...)}
		value, status, err := patch(t, pool, "admin", `{"targetText":"Bonjour","metadata":{"context":"home"},"expectedVersion":2}`)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		require.Contains(t, value.(map[string]any), "provenance")
		requireScriptDone(t, pool)
	})

	t.Run("duplicate after a source change", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, current, {op: opQueryRow, scan: []any{"other"}}}}
		_, _, err := patch(t, pool, "admin", `{"sourceText":"Hi","expectedVersion":2}`)
		requireMemoryFailure(t, err, http.StatusConflict, "duplicate_memory_entry")
		requireScriptDone(t, pool)
	})

	t.Run("unique violation on update", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, current, {op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: &pgconn.PgError{Code: "23505"}}}}
		_, _, err := patch(t, pool, "admin", `{"targetLocale":"de","expectedVersion":2}`)
		requireMemoryFailure(t, err, http.StatusConflict, "duplicate_memory_entry")
		requireScriptDone(t, pool)
	})

	t.Run("version moved during update", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, current, {op: opQueryRow, err: pgx.ErrNoRows}}}
		_, _, err := patch(t, pool, "admin", `{"targetText":"Salut","expectedVersion":2}`)
		requireMemoryFailure(t, err, http.StatusConflict, "stale_memory_entry")
		requireScriptDone(t, pool)
	})

	t.Run("reviewer approves", func(t *testing.T) {
		steps := []dbStep{
			{op: opBegin},
			current,
			{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 3)},
			{op: opQueryRow, scan: []any{true}},
			{op: opExec},
		}
		pool := &scriptPool{steps: append(steps, memoryUnitDetailSteps()...)}
		_, status, err := patch(t, pool, "reviewer", `{"reviewStatus":"approved","expectedVersion":2}`)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)
	})

	t.Run("content and review change backfill the creation event", func(t *testing.T) {
		steps := []dbStep{
			{op: opBegin},
			current,
			{op: opQueryRow, err: pgx.ErrNoRows},
			{op: opQueryRow, scan: memoryUnitEntryValues("Hi", 3)},
			{op: opQueryRow, scan: []any{false}},
			{op: opExec},
			{op: opExec},
			{op: opExec},
		}
		pool := &scriptPool{steps: append(steps, memoryUnitDetailSteps()...)}
		_, status, err := patch(t, pool, "admin", `{"sourceText":"Hi","sourceLocale":"en_GB","matchScore":90,"reviewStatus":"rejected","expectedVersion":2}`)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)
	})

	boom := errors.New("boom")
	updated := dbStep{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 3)}
	for name, tail := range map[string][]dbStep{
		"duplicate lookup": {{op: opQueryRow, err: boom}},
		"update":           {{op: opQueryRow, err: pgx.ErrNoRows}, {op: opQueryRow, err: boom}},
		"creation lookup":  {{op: opQueryRow, err: pgx.ErrNoRows}, updated, {op: opQueryRow, err: boom}},
		"creation insert":  {{op: opQueryRow, err: pgx.ErrNoRows}, updated, {op: opQueryRow, scan: []any{false}}, {op: opExec, err: boom}},
		"update event":     {{op: opQueryRow, err: pgx.ErrNoRows}, updated, {op: opQueryRow, scan: []any{true}}, {op: opExec, err: boom}},
		"review event":     {{op: opQueryRow, err: pgx.ErrNoRows}, updated, {op: opQueryRow, scan: []any{true}}, {op: opExec}, {op: opExec, err: boom}},
		"detail":           {{op: opQueryRow, err: pgx.ErrNoRows}, updated, {op: opQueryRow, scan: []any{true}}, {op: opExec}, {op: opExec}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: append([]dbStep{{op: opBegin}, current}, tail...)}
			_, _, err := patch(t, pool, "admin", `{"sourceText":"Hi","reviewStatus":"approved","expectedVersion":2}`)
			require.ErrorIs(t, err, boom)
			requireScriptDone(t, pool)
		})
	}

	for name, steps := range map[string][]dbStep{
		"begin":   {{op: opBegin, err: boom}},
		"current": {{op: opBegin}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			_, _, err := patch(t, &scriptPool{steps: steps}, "admin", `{"targetText":"x","expectedVersion":2}`)
			require.ErrorIs(t, err, boom)
		})
	}
}

func TestDeleteMemoryEntryScripted(t *testing.T) {
	req := memoryUnitRequest(http.MethodDelete, "")
	req.SetPathValue("entryId", memoryUnitEntryID)

	_, _, err := (&memoryAPI{}).deleteMemoryEntryHandler(req, memoryUnitActor("reviewer"), memoryUnitNative())
	requireMemoryFailure(t, err, http.StatusForbidden, "forbidden")

	pool := &scriptPool{steps: []dbStep{{op: opExec, tag: pgconn.NewCommandTag("DELETE 0")}}}
	_, _, err = (&memoryAPI{pool: pool}).deleteMemoryEntryHandler(req, memoryUnitActor("admin"), memoryUnitNative())
	requireMemoryFailure(t, err, http.StatusNotFound, "memory_not_found")

	pool = &scriptPool{steps: []dbStep{{op: opExec, tag: pgconn.NewCommandTag("DELETE 1")}}}
	value, status, err := (&memoryAPI{pool: pool}).deleteMemoryEntryHandler(req, memoryUnitActor("admin"), memoryUnitNative())
	require.NoError(t, err)
	require.Nil(t, value)
	require.Equal(t, http.StatusNoContent, status)

	boom := errors.New("boom")
	pool = &scriptPool{steps: []dbStep{{op: opExec, err: boom}}}
	_, _, err = (&memoryAPI{pool: pool}).deleteMemoryEntryHandler(req, memoryUnitActor("admin"), memoryUnitNative())
	require.ErrorIs(t, err, boom)
}

func TestGetMemoryEntryHandlerScripted(t *testing.T) {
	req := memoryUnitRequest(http.MethodGet, "")
	req.SetPathValue("entryId", memoryUnitEntryID)
	pool := &scriptPool{steps: memoryUnitDetailSteps()}
	value, status, err := (&memoryAPI{pool: pool}).getMemoryEntryHandler(req, memoryUnitActor("member"), memoryUnitNative())
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, memoryUnitEntryID, value.(map[string]any)["memoryEntry"].(memoryEntryRecord).ID)
	requireScriptDone(t, pool)
}
