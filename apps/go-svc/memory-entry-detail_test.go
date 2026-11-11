package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestMemoryEntryEditCapabilitiesFrom(t *testing.T) {
	require.Equal(t, memoryEntryEditCapabilities{CanEdit: true}, memoryEntryEditCapabilitiesFrom(memoryUnitNative()))

	external := memoryUnitNative()
	external.Source = "external_tms"
	capabilities := memoryEntryEditCapabilitiesFrom(external)
	require.False(t, capabilities.CanEdit)
	require.Equal(t, "external_tms", *capabilities.ReadOnlyReason)

	referenceOnly, synced := "reference_only", "synced"
	reference := memoryUnitNative()
	reference.CapabilityMode = &referenceOnly
	capabilities = memoryEntryEditCapabilitiesFrom(reference)
	require.False(t, capabilities.CanEdit)
	require.Equal(t, "reference_only", *capabilities.ReadOnlyReason)

	reference.CapabilityMode = &synced
	require.True(t, memoryEntryEditCapabilitiesFrom(reference).CanEdit)
}

func TestMemoryEntryProvenanceFrom(t *testing.T) {
	creator, editor, batch := "user_creator", "user_editor", "batch_1"
	names := map[string]string{creator: "Ada Lovelace"}
	base := memoryEntryRecord{
		ID: memoryUnitEntryID, Provenance: "manual", CreatedByUserID: &creator, ModifiedByUserID: &editor,
		CreatedAt: "2026-01-01T00:00:00.000000Z", UpdatedAt: "2026-01-02T00:00:00.000000Z", Metadata: json.RawMessage(`{}`),
	}

	t.Run("manual with provider metadata", func(t *testing.T) {
		entry := base
		entry.Metadata = json.RawMessage(`{"provider":" deepl ","context":"Checkout button","providerUpdatedAt":"2025-12-31T00:00:00Z","externalUpdatedAt":"ignored"}`)
		provenance := memoryEntryProvenanceFrom(entry, memoryUnitNative(), names)
		require.Equal(t, "manual", provenance.Origin)
		require.Equal(t, "deepl", *provenance.Provider)
		require.Equal(t, "Checkout button", *provenance.Context)
		require.Equal(t, memoryEntryActor{DisplayName: provenance.Provider, At: provenance.ProviderSupplied.At, Source: "provider"}, provenance.ProviderSupplied)
		require.Equal(t, "2025-12-31T00:00:00Z", *provenance.ProviderSupplied.At)
		require.Equal(t, "Ada Lovelace", *provenance.Created.DisplayName)
		require.Equal(t, entry.CreatedAt, *provenance.Created.At)
		require.Equal(t, editor, *provenance.Modified.UserID)
		require.Nil(t, provenance.Modified.DisplayName)
		require.Nil(t, provenance.Reviewed.UserID)
		require.Nil(t, provenance.Reviewed.At)
		require.Nil(t, provenance.Imported.UserID)
		require.Nil(t, provenance.Imported.At)
		require.Equal(t, "imported", provenance.Imported.Source)
	})

	t.Run("synced without metadata", func(t *testing.T) {
		entry := base
		entry.Provenance = "sync"
		provenance := memoryEntryProvenanceFrom(entry, memoryUnitNative(), names)
		require.Equal(t, "external_tms", *provenance.Provider)
		require.Equal(t, entry.UpdatedAt, *provenance.ProviderSupplied.At)
		require.Nil(t, provenance.Context)
	})

	t.Run("memory provider and external timestamp", func(t *testing.T) {
		entry := base
		entry.Provenance = "sync"
		entry.Metadata = json.RawMessage(`{"externalUpdatedAt":"2025-11-01T00:00:00Z"}`)
		kind := "phrase"
		memory := memoryUnitNative()
		memory.ExternalProviderKind = &kind
		provenance := memoryEntryProvenanceFrom(entry, memory, names)
		require.Equal(t, "phrase", *provenance.Provider)
		require.Equal(t, "2025-11-01T00:00:00Z", *provenance.ProviderSupplied.At)
	})

	t.Run("imported", func(t *testing.T) {
		entry := base
		entry.Provenance = "import"
		entry.ImportBatchID = &batch
		provenance := memoryEntryProvenanceFrom(entry, memoryUnitNative(), names)
		require.Equal(t, &batch, provenance.ImportBatchID)
		require.Equal(t, creator, *provenance.Imported.UserID)
		require.Equal(t, "Ada Lovelace", *provenance.Imported.DisplayName)
		require.Equal(t, entry.CreatedAt, *provenance.Imported.At)
		require.Nil(t, provenance.Provider)
		require.Nil(t, provenance.ProviderSupplied.At)
	})
}

func TestSynthesizeMemoryEntryAuditEvents(t *testing.T) {
	creator, reviewer, batch := "user_creator", "user_reviewer", "batch_1"
	reviewedAt := "2026-01-03T00:00:00.000000Z"
	entry := memoryEntryRecord{
		ID: memoryUnitEntryID, Provenance: "manual", Version: 4, ReviewStatus: "approved",
		CreatedByUserID: &creator, ReviewedByUserID: &reviewer,
		CreatedAt: "2026-01-01T00:00:00.000000Z", UpdatedAt: "2026-01-01T00:00:00.000000Z",
	}

	events := synthesizeMemoryEntryAuditEvents(entry)
	require.Len(t, events, 1)
	require.Equal(t, memoryUnitEntryID+":created", events[0].ID)
	require.Equal(t, "created", events[0].EventType)
	require.Equal(t, "user", events[0].ActorKind)
	require.Equal(t, 1, events[0].Version)
	require.JSONEq(t, `{"provenance":"manual"}`, string(events[0].Attributes))

	entry.UpdatedAt = "2026-01-02T00:00:00.000000Z"
	entry.ReviewedAt = &reviewedAt
	events = synthesizeMemoryEntryAuditEvents(entry)
	require.Equal(t, []string{"created", "updated", "reviewed"}, []string{events[0].EventType, events[1].EventType, events[2].EventType})
	require.Equal(t, entry.UpdatedAt, events[1].OccurredAt)
	require.Equal(t, []string{}, events[1].ChangedFields)
	require.Equal(t, reviewedAt, events[2].OccurredAt)
	require.Equal(t, &reviewer, events[2].ActorUserID)
	require.JSONEq(t, `{"reviewStatus":"approved"}`, string(events[2].Attributes))

	entry.Provenance = "import"
	entry.ImportBatchID = &batch
	created := synthesizeMemoryEntryCreationEvent(entry)
	require.Equal(t, "imported", created.EventType)
	require.Equal(t, "import", created.ActorKind)
	require.JSONEq(t, `{"provenance":"import","importBatchId":"batch_1"}`, string(created.Attributes))

	entry.Provenance = "sync"
	entry.ImportBatchID = nil
	created = synthesizeMemoryEntryCreationEvent(entry)
	require.Equal(t, "synced", created.EventType)
	require.Equal(t, "provider", created.ActorKind)
}

func TestMemoryEntryAuditEventHelpers(t *testing.T) {
	ada, grace, known := "user_ada", "user_grace", "Kept"
	events := []memoryEntryAuditEvent{
		{EventType: "updated", ActorUserID: &ada},
		{EventType: "reviewed", ActorUserID: &grace, ActorDisplayName: &known},
		{EventType: "updated"},
	}
	require.False(t, hasMemoryEntryCreationEvent(events))
	for _, eventType := range []string{"created", "imported", "synced"} {
		require.True(t, hasMemoryEntryCreationEvent(append(events, memoryEntryAuditEvent{EventType: eventType})), eventType)
	}

	named := attachMemoryEntryEventNames(events, map[string]string{ada: "Ada", grace: "Grace"})
	require.Equal(t, "Ada", *named[0].ActorDisplayName)
	require.Equal(t, "Kept", *named[1].ActorDisplayName)
	require.Nil(t, named[2].ActorDisplayName)
}

func TestMemoryEntryMetadataString(t *testing.T) {
	meta := json.RawMessage(`{"context":"  Header  ","count":3,"nested":{"a":1}}`)
	require.Equal(t, "Header", memoryEntryMetadataString(meta, "context"))
	require.Equal(t, "", memoryEntryMetadataString(meta, "count"))
	require.Equal(t, "", memoryEntryMetadataString(meta, "nested"))
	require.Equal(t, "", memoryEntryMetadataString(meta, "missing"))
	require.Equal(t, "", memoryEntryMetadataString(json.RawMessage(`[1]`), "context"))
	require.Equal(t, "", memoryEntryMetadataString(json.RawMessage(`nope`), "context"))
	require.Equal(t, "", memoryEntryMetadataString(nil, "context"))
}

func TestOptionalNonEmptyAndUniqueNonEmpty(t *testing.T) {
	require.Nil(t, optionalNonEmpty(""))
	require.Nil(t, optionalNonEmpty("  \t"))
	require.Equal(t, " x ", *optionalNonEmpty(" x "))

	require.Equal(t, []string{}, uniqueNonEmpty(nil))
	require.Equal(t, []string{"a", "b"}, uniqueNonEmpty([]string{"", " a ", "b", "a", "  ", "b"}))
}

func TestMemoryEntryDetailFromScripted(t *testing.T) {
	ctx := context.Background()
	boom := errors.New("boom")
	entryRow := dbStep{op: opQueryRow, scan: memoryUnitEntryValues("Hello", 2, "hello")}

	t.Run("missing", func(t *testing.T) {
		_, _, err := memoryEntryDetailFrom(ctx, &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}, memoryUnitNative(), memoryUnitEntryID)
		requireMemoryFailure(t, err, http.StatusNotFound, "memory_not_found")
	})

	t.Run("maps variants and stored events", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			entryRow,
			{op: opQuery, table: [][]any{{memoryUnitUserID, "Ada Lovelace"}, {"user_blank", nil}}},
			{op: opQuery, table: [][]any{
				{"variant_1", "en-US", "de-DE", "Hello", "Hallo", "approved", []byte(`{"context":" home "}`)},
				{"variant_2", "en-US", "es-ES", "Hello", "Hola", "pending", nil},
			}},
			{op: opQuery, table: [][]any{
				{"event_1", "updated", "user", memoryUnitUserID, 2, nil, nil, memoryUnitUpdatedAt, nil},
			}},
		}}
		value, status, err := memoryEntryDetailFrom(ctx, pool, memoryUnitNative(), memoryUnitEntryID)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)

		detail := value.(map[string]any)
		variants := detail["variants"].([]memoryEntryVariant)
		require.Len(t, variants, 2)
		require.Equal(t, "home", *variants[0].Context)
		require.Nil(t, variants[1].Context)

		events := detail["auditEvents"].([]memoryEntryAuditEvent)
		require.Len(t, events, 2)
		require.Equal(t, "created", events[0].EventType)
		require.Equal(t, "Ada Lovelace", *events[0].ActorDisplayName)
		require.Equal(t, "updated", events[1].EventType)
		require.Equal(t, []string{}, events[1].ChangedFields)
		require.JSONEq(t, `{}`, string(events[1].Attributes))
		require.Equal(t, "2026-01-03T03:04:05.000000Z", events[1].OccurredAt)
		require.Equal(t, "Ada Lovelace", *events[1].ActorDisplayName)

		provenance := detail["provenance"].(memoryEntryProvenance)
		require.Equal(t, "Ada Lovelace", *provenance.Created.DisplayName)
		require.Equal(t, "home", *provenance.Context)
		require.Equal(t, memoryEntryEditCapabilities{CanEdit: true}, detail["capabilities"])
	})

	t.Run("stored creation event is kept", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			entryRow,
			{op: opQuery},
			{op: opQuery},
			{op: opQuery, table: [][]any{
				{"event_1", "created", "user", memoryUnitUserID, 1, []string{"sourceText"}, json.RawMessage(`{"provenance":"manual"}`), memoryUnitCreatedAt, "Ada"},
			}},
		}}
		value, _, err := memoryEntryDetailFrom(ctx, pool, memoryUnitNative(), memoryUnitEntryID)
		require.NoError(t, err)
		events := value.(map[string]any)["auditEvents"].([]memoryEntryAuditEvent)
		require.Len(t, events, 1)
		require.Equal(t, "event_1", events[0].ID)
		require.Equal(t, []string{"sourceText"}, events[0].ChangedFields)
		require.Equal(t, "Ada", *events[0].ActorDisplayName)
	})

	t.Run("no actors skips the name lookup", func(t *testing.T) {
		values := memoryUnitEntryValues("Hello", 1, "hello")
		values[11] = nil
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: values}, {op: opQuery}, {op: opQuery}}}
		value, _, err := memoryEntryDetailFrom(ctx, pool, memoryUnitNative(), memoryUnitEntryID)
		require.NoError(t, err)
		require.Len(t, value.(map[string]any)["auditEvents"].([]memoryEntryAuditEvent), 2)
		requireScriptDone(t, pool)
	})

	for name, steps := range map[string][]dbStep{
		"entry":         {{op: opQueryRow, err: boom}},
		"names":         {entryRow, {op: opQuery, err: boom}},
		"names scan":    {entryRow, {op: opQuery, table: [][]any{{"only_id"}}}},
		"names rows":    {entryRow, {op: opQuery, rowsErr: boom}},
		"variants":      {entryRow, {op: opQuery}, {op: opQuery, err: boom}},
		"variants scan": {entryRow, {op: opQuery}, {op: opQuery, table: [][]any{{"variant_1"}}}},
		"variants rows": {entryRow, {op: opQuery}, {op: opQuery, rowsErr: boom}},
		"events":        {entryRow, {op: opQuery}, {op: opQuery}, {op: opQuery, err: boom}},
		"events scan":   {entryRow, {op: opQuery}, {op: opQuery}, {op: opQuery, table: [][]any{{"event_1"}}}},
		"events rows":   {entryRow, {op: opQuery}, {op: opQuery}, {op: opQuery, rowsErr: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: steps}
			_, _, err := memoryEntryDetailFrom(ctx, pool, memoryUnitNative(), memoryUnitEntryID)
			require.Error(t, err)
			requireScriptDone(t, pool)
		})
	}
}
