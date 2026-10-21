package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type memoryEntryActor struct {
	UserID      *string `json:"userId"`
	DisplayName *string `json:"displayName"`
	At          *string `json:"at"`
	Source      string  `json:"source"`
}

type memoryEntryProvenance struct {
	Origin           string           `json:"origin"`
	Provider         *string          `json:"provider"`
	ImportBatchID    *string          `json:"importBatchId"`
	Context          *string          `json:"context"`
	Created          memoryEntryActor `json:"created"`
	Modified         memoryEntryActor `json:"modified"`
	Reviewed         memoryEntryActor `json:"reviewed"`
	Imported         memoryEntryActor `json:"imported"`
	ProviderSupplied memoryEntryActor `json:"providerSupplied"`
}

type memoryEntryVariant struct {
	ID           string  `json:"id"`
	SourceLocale string  `json:"sourceLocale"`
	TargetLocale string  `json:"targetLocale"`
	SourceText   string  `json:"sourceText"`
	TargetText   string  `json:"targetText"`
	Context      *string `json:"context"`
	ReviewStatus string  `json:"reviewStatus"`
}

type memoryEntryAuditEvent struct {
	ID               string          `json:"id"`
	EventType        string          `json:"eventType"`
	ActorKind        string          `json:"actorKind"`
	ActorUserID      *string         `json:"actorUserId"`
	ActorDisplayName *string         `json:"actorDisplayName"`
	Version          int             `json:"version"`
	ChangedFields    []string        `json:"changedFields"`
	Attributes       json.RawMessage `json:"attributes"`
	OccurredAt       string          `json:"occurredAt"`
}

type memoryEntryEditCapabilities struct {
	CanEdit        bool    `json:"canEdit"`
	ReadOnlyReason *string `json:"readOnlyReason"`
}

func (api *memoryAPI) memoryEntryDetail(ctx context.Context, m memoryRecord, entryID string) (any, int, error) {
	return memoryEntryDetailFrom(ctx, api.pool, m, entryID)
}

func memoryEntryDetailFrom(ctx context.Context, db dictionaryDB, m memoryRecord, entryID string) (any, int, error) {
	var normalized string
	entry, err := scanMemoryEntry(db.QueryRow(ctx, `select `+memoryEntryColumns+`, e.normalized_source_text from memory_entries e where e.id=$1 and e.memory_id=$2`, entryID, m.ID), &normalized)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingMemory()
	}
	if err != nil {
		return nil, 0, err
	}
	names, err := memoryEntryActorNames(ctx, db, []string{
		stringOrEmpty(entry.CreatedByUserID),
		stringOrEmpty(entry.ModifiedByUserID),
		stringOrEmpty(entry.ReviewedByUserID),
	})
	if err != nil {
		return nil, 0, err
	}
	variants, err := memoryEntryVariants(ctx, db, entry, normalized)
	if err != nil {
		return nil, 0, err
	}
	events, err := memoryEntryAuditEvents(ctx, db, entry, names)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"memoryEntry":  entry,
		"provenance":   memoryEntryProvenanceFrom(entry, m, names),
		"variants":     variants,
		"auditEvents":  events,
		"capabilities": memoryEntryEditCapabilitiesFrom(m),
	}, 200, nil
}

func memoryEntryEditCapabilitiesFrom(m memoryRecord) memoryEntryEditCapabilities {
	if m.Source == "external_tms" {
		reason := "external_tms"
		return memoryEntryEditCapabilities{CanEdit: false, ReadOnlyReason: &reason}
	}
	if m.CapabilityMode != nil && *m.CapabilityMode == "reference_only" {
		reason := "reference_only"
		return memoryEntryEditCapabilities{CanEdit: false, ReadOnlyReason: &reason}
	}
	return memoryEntryEditCapabilities{CanEdit: true}
}

func memoryEntryProvenanceFrom(entry memoryEntryRecord, m memoryRecord, names map[string]string) memoryEntryProvenance {
	context := memoryEntryMetadataString(entry.Metadata, "context")
	provider := memoryEntryMetadataString(entry.Metadata, "provider")
	if provider == "" && m.ExternalProviderKind != nil {
		provider = *m.ExternalProviderKind
	}
	if provider == "" && entry.Provenance == "sync" {
		provider = "external_tms"
	}
	providerAt := memoryEntryMetadataString(entry.Metadata, "providerUpdatedAt")
	if providerAt == "" {
		providerAt = memoryEntryMetadataString(entry.Metadata, "externalUpdatedAt")
	}
	if providerAt == "" && entry.Provenance == "sync" {
		providerAt = entry.UpdatedAt
	}
	importedUser := (*string)(nil)
	importedAt := (*string)(nil)
	if entry.Provenance == "import" {
		importedUser = entry.CreatedByUserID
		importedAt = &entry.CreatedAt
	}
	return memoryEntryProvenance{
		Origin:        entry.Provenance,
		Provider:      optionalNonEmpty(provider),
		ImportBatchID: entry.ImportBatchID,
		Context:       optionalNonEmpty(context),
		Created:       memoryEntryNamedActor(entry.CreatedByUserID, names, &entry.CreatedAt, "created"),
		Modified:      memoryEntryNamedActor(entry.ModifiedByUserID, names, &entry.UpdatedAt, "modified"),
		Reviewed:      memoryEntryNamedActor(entry.ReviewedByUserID, names, entry.ReviewedAt, "reviewed"),
		Imported:      memoryEntryNamedActor(importedUser, names, importedAt, "imported"),
		ProviderSupplied: memoryEntryActor{
			DisplayName: optionalNonEmpty(provider),
			At:          optionalNonEmpty(providerAt),
			Source:      "provider",
		},
	}
}

func memoryEntryNamedActor(userID *string, names map[string]string, at *string, source string) memoryEntryActor {
	var display *string
	if userID != nil {
		if name := names[*userID]; name != "" {
			display = &name
		}
	}
	return memoryEntryActor{UserID: userID, DisplayName: display, At: at, Source: source}
}

func memoryEntryActorNames(ctx context.Context, db dictionaryDB, userIDs []string) (map[string]string, error) {
	ids := uniqueNonEmpty(userIDs)
	names := map[string]string{}
	if len(ids) == 0 {
		return names, nil
	}
	rows, err := db.Query(ctx, `select id::text, nullif(trim(concat(coalesce(first_name,''),' ',coalesce(last_name,''))),'') from users where id=any($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var name *string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		if name != nil && *name != "" {
			names[id] = *name
		}
	}
	return names, rows.Err()
}

func memoryEntryVariants(ctx context.Context, db dictionaryDB, entry memoryEntryRecord, normalized string) ([]memoryEntryVariant, error) {
	variantGroupID := memoryEntryMetadataString(entry.Metadata, "variantGroupId")
	context := memoryEntryMetadataString(entry.Metadata, "context")
	rows, err := db.Query(ctx, `
        select e.id, e.source_locale, e.target_locale, e.source_text, e.target_text, e.review_status, e.metadata
        from memory_entries e
        where e.memory_id=$1 and e.id<>$2 and (
            (e.source_locale=$3 and e.normalized_source_text=$4)
            or ($5 <> '' and e.metadata->>'variantGroupId'=$5)
            or ($6 <> '' and e.normalized_source_text=$4 and e.metadata->>'context'=$6)
        )
        order by e.target_locale, e.id`,
		entry.MemoryID, entry.ID, entry.SourceLocale, normalized, variantGroupID, context)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	variants := []memoryEntryVariant{}
	for rows.Next() {
		var row memoryEntryVariant
		var meta []byte
		if err := rows.Scan(&row.ID, &row.SourceLocale, &row.TargetLocale, &row.SourceText, &row.TargetText, &row.ReviewStatus, &meta); err != nil {
			return nil, err
		}
		row.Context = optionalNonEmpty(memoryEntryMetadataString(json.RawMessage(meta), "context"))
		variants = append(variants, row)
	}
	return variants, rows.Err()
}

func memoryEntryAuditEvents(ctx context.Context, db dictionaryDB, entry memoryEntryRecord, names map[string]string) ([]memoryEntryAuditEvent, error) {
	rows, err := db.Query(ctx, `
        select e.id::text, e.event_type, e.actor_kind, e.actor_user_id, e.version, e.changed_fields, e.attributes, e.occurred_at,
               nullif(trim(concat(coalesce(u.first_name,''),' ',coalesce(u.last_name,''))),'')
        from memory_entry_events e
        left join users u on u.id=e.actor_user_id
        where e.memory_entry_id=$1
        order by e.occurred_at, e.id`, entry.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []memoryEntryAuditEvent{}
	for rows.Next() {
		var event memoryEntryAuditEvent
		var occurred time.Time
		if err := rows.Scan(&event.ID, &event.EventType, &event.ActorKind, &event.ActorUserID, &event.Version, &event.ChangedFields, &event.Attributes, &occurred, &event.ActorDisplayName); err != nil {
			return nil, err
		}
		if event.ChangedFields == nil {
			event.ChangedFields = []string{}
		}
		if len(event.Attributes) == 0 {
			event.Attributes = json.RawMessage(`{}`)
		}
		event.OccurredAt = formatMemoryTime(occurred)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(events) == 0 {
		return attachMemoryEntryEventNames(synthesizeMemoryEntryAuditEvents(entry), names), nil
	}
	if !hasMemoryEntryCreationEvent(events) {
		events = append([]memoryEntryAuditEvent{synthesizeMemoryEntryCreationEvent(entry)}, events...)
		events = attachMemoryEntryEventNames(events, names)
	}
	return events, nil
}

func synthesizeMemoryEntryCreationEvent(entry memoryEntryRecord) memoryEntryAuditEvent {
	eventType, actorKind := "created", "user"
	switch entry.Provenance {
	case "import":
		eventType, actorKind = "imported", "import"
	case "sync":
		eventType, actorKind = "synced", "provider"
	}
	attributes := map[string]any{"provenance": entry.Provenance}
	if entry.ImportBatchID != nil {
		attributes["importBatchId"] = *entry.ImportBatchID
	}
	raw, _ := json.Marshal(attributes)
	return memoryEntryAuditEvent{
		ID:            entry.ID + ":created",
		EventType:     eventType,
		ActorKind:     actorKind,
		ActorUserID:   entry.CreatedByUserID,
		Version:       1,
		ChangedFields: []string{"sourceLocale", "targetLocale", "sourceText", "targetText"},
		Attributes:    raw,
		OccurredAt:    entry.CreatedAt,
	}
}

func synthesizeMemoryEntryAuditEvents(entry memoryEntryRecord) []memoryEntryAuditEvent {
	events := []memoryEntryAuditEvent{synthesizeMemoryEntryCreationEvent(entry)}
	if entry.UpdatedAt > entry.CreatedAt {
		events = append(events, memoryEntryAuditEvent{
			ID:            entry.ID + ":updated",
			EventType:     "updated",
			ActorKind:     "user",
			ActorUserID:   entry.ModifiedByUserID,
			Version:       entry.Version,
			ChangedFields: []string{},
			Attributes:    json.RawMessage(`{}`),
			OccurredAt:    entry.UpdatedAt,
		})
	}
	if entry.ReviewedAt != nil {
		raw, _ := json.Marshal(map[string]any{"reviewStatus": entry.ReviewStatus})
		events = append(events, memoryEntryAuditEvent{
			ID:            entry.ID + ":reviewed",
			EventType:     "reviewed",
			ActorKind:     "user",
			ActorUserID:   entry.ReviewedByUserID,
			Version:       entry.Version,
			ChangedFields: []string{"reviewStatus"},
			Attributes:    raw,
			OccurredAt:    *entry.ReviewedAt,
		})
	}
	return events
}

func hasMemoryEntryCreationEvent(events []memoryEntryAuditEvent) bool {
	for _, event := range events {
		if event.EventType == "created" || event.EventType == "imported" || event.EventType == "synced" {
			return true
		}
	}
	return false
}

func attachMemoryEntryEventNames(events []memoryEntryAuditEvent, names map[string]string) []memoryEntryAuditEvent {
	for i, event := range events {
		if event.ActorDisplayName == nil && event.ActorUserID != nil {
			if name := names[*event.ActorUserID]; name != "" {
				events[i].ActorDisplayName = &name
			}
		}
	}
	return events
}

func memoryEntryMetadataString(meta json.RawMessage, key string) string {
	var object map[string]any
	if json.Unmarshal(meta, &object) != nil {
		return ""
	}
	value, _ := object[key].(string)
	return strings.TrimSpace(value)
}

func optionalNonEmpty(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func uniqueNonEmpty(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
