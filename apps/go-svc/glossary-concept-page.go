package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Concept page cursors are opaque base64 of "updatedAt|id" (no HMAC).
// Clients must treat nextCursor as opaque and not forge values.

type glossaryConceptPageRow struct {
	ID           string  `json:"id"`
	GlossaryID   string  `json:"glossaryId"`
	PrimaryTerm  string  `json:"primaryTerm"`
	Subject      string  `json:"subject"`
	Definition   string  `json:"definition"`
	ReviewStatus string  `json:"reviewStatus"`
	TermCount    int     `json:"termCount"`
	LocaleCount  int     `json:"localeCount"`
	ArchivedAt   *string `json:"archivedAt"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

func (api *glossaryAPI) pageGlossaryConcepts(r *http.Request, g glossaryRecord) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "external_glossary_page_unsupported", "Provider-backed glossaries do not expose the native management index")
	}
	limit, _, err := glossaryPage(r, 50, 100)
	if err != nil {
		return nil, 0, err
	}
	search := trimGlossaryInput(r.URL.Query().Get("search"))
	where := `c.glossary_id=$1 and c.archived_at is null`
	args := []any{g.ID}
	if search != "" {
		args = append(args, "%"+search+"%")
		where += ` and (c.primary_term ilike $2 or c.subject ilike $2 or c.definition ilike $2)`
	}
	cursor := trimGlossaryInput(r.URL.Query().Get("cursor"))
	if cursor != "" {
		updatedAt, id, decodeErr := decodeGlossaryPageCursor(cursor)
		if decodeErr != nil {
			return nil, 0, glossaryFailure(400, "invalid_glossary_concept_cursor", "Glossary concept cursor is invalid")
		}
		args = append(args, updatedAt, id)
		pos := len(args)
		where += ` and (c.updated_at, c.id) < ($` + strconv.Itoa(pos-1) + `::timestamptz, $` + strconv.Itoa(pos) + `::uuid)`
	}
	args = append(args, limit+1)
	limitPos := len(args)
	rows, err := api.pool.Query(r.Context(), `select c.id, c.glossary_id, c.primary_term, c.subject, c.definition, coalesce(c.review_status,'proposed'), c.created_at, c.updated_at from glossary_concepts c where `+where+` order by c.updated_at desc, c.id desc limit $`+strconv.Itoa(limitPos), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	concepts := []glossaryConceptPageRow{}
	ids := []string{}
	for rows.Next() {
		var row glossaryConceptPageRow
		var created, updated time.Time
		if err := rows.Scan(&row.ID, &row.GlossaryID, &row.PrimaryTerm, &row.Subject, &row.Definition, &row.ReviewStatus, &created, &updated); err != nil {
			return nil, 0, err
		}
		row.CreatedAt = formatGlossaryTime(created)
		row.UpdatedAt = formatGlossaryTime(updated)
		concepts = append(concepts, row)
		ids = append(ids, row.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasMore := len(concepts) > limit
	if hasMore {
		concepts = concepts[:limit]
		ids = ids[:limit]
	}
	if len(ids) > 0 {
		countRows, countErr := api.pool.Query(r.Context(), `select concept_id, count(*), count(distinct locale) from glossary_terms where concept_id = any($1) and archived_at is null group by concept_id`, ids)
		if countErr != nil {
			return nil, 0, countErr
		}
		counts := map[string][2]int{}
		for countRows.Next() {
			var conceptID string
			var termCount, localeCount int
			if err := countRows.Scan(&conceptID, &termCount, &localeCount); err != nil {
				countRows.Close()
				return nil, 0, err
			}
			counts[conceptID] = [2]int{termCount, localeCount}
		}
		countRows.Close()
		for i := range concepts {
			if c, ok := counts[concepts[i].ID]; ok {
				concepts[i].TermCount = c[0]
				concepts[i].LocaleCount = c[1]
			}
		}
	}
	var total int
	countArgs := args[:len(args)-1]
	if cursor != "" {
		// total ignores cursor; rebuild without cursor predicate
		totalWhere := `glossary_id=$1 and archived_at is null`
		totalArgs := []any{g.ID}
		if search != "" {
			totalWhere += ` and (primary_term ilike $2 or subject ilike $2 or definition ilike $2)`
			totalArgs = append(totalArgs, "%"+search+"%")
		}
		err = api.pool.QueryRow(r.Context(), `select count(*) from glossary_concepts where `+totalWhere, totalArgs...).Scan(&total)
	} else {
		err = api.pool.QueryRow(r.Context(), `select count(*) from glossary_concepts c where `+where, countArgs...).Scan(&total)
	}
	if err != nil {
		return nil, 0, err
	}
	var nextCursor any
	if hasMore && len(concepts) > 0 {
		last := concepts[len(concepts)-1]
		nextCursor = encodeGlossaryPageCursor(last.UpdatedAt, last.ID)
	}
	return map[string]any{
		"concepts":   concepts,
		"nextCursor": nextCursor,
		"total":      total,
		"pagination": map[string]any{"limit": limit, "returned": len(concepts), "hasMore": hasMore},
	}, 200, nil
}

func encodeGlossaryPageCursor(updatedAt, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(updatedAt + "|" + id))
}

func decodeGlossaryPageCursor(cursor string) (string, string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		raw, err = base64.URLEncoding.DecodeString(cursor)
	}
	if err != nil {
		return "", "", err
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 || parts[0] == "" || !validGlossaryID(parts[1]) {
		return "", "", pgx.ErrNoRows
	}
	return parts[0], parts[1], nil
}

func (api *glossaryAPI) listGlossaryConceptAuthors(ctx context.Context, g glossaryRecord) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "external_glossary_page_unsupported", "Provider-backed glossaries do not expose the native management index")
	}
	rows, err := api.pool.Query(ctx, `select distinct u.id, coalesce(nullif(trim(concat(coalesce(u.first_name,''),' ',coalesce(u.last_name,''))),''), u.email, u.id::text) as display_name from users u where u.id in (select created_by_user_id from glossary_concepts where glossary_id=$1 and created_by_user_id is not null union select created_by_user_id from glossary_terms where glossary_id=$1 and created_by_user_id is not null) order by display_name`, g.ID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	authors := []map[string]string{}
	for rows.Next() {
		var userID, displayName string
		if err := rows.Scan(&userID, &displayName); err != nil {
			return nil, 0, err
		}
		authors = append(authors, map[string]string{"userId": userID, "displayName": displayName})
	}
	return map[string]any{"authors": authors}, 200, rows.Err()
}

func (api *glossaryAPI) pageGlossaryHistory(r *http.Request, g glossaryRecord) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "external_glossary_history_unsupported", "Provider-backed glossaries do not expose local history")
	}
	limit, _, err := glossaryPage(r, 50, 100)
	if err != nil {
		return nil, 0, err
	}
	where := `e.glossary_id=$1`
	args := []any{g.ID}
	if conceptID := trimGlossaryInput(r.URL.Query().Get("conceptId")); conceptID != "" {
		if !validGlossaryID(conceptID) {
			return nil, 0, invalidGlossary()
		}
		args = append(args, conceptID)
		where += ` and e.concept_id=$` + strconv.Itoa(len(args))
	}
	if eventType := trimGlossaryInput(r.URL.Query().Get("eventType")); eventType != "" {
		args = append(args, eventType)
		where += ` and e.event_type=$` + strconv.Itoa(len(args))
	}
	cursor := trimGlossaryInput(r.URL.Query().Get("cursor"))
	if cursor != "" {
		occurredAt, id, decodeErr := decodeGlossaryPageCursor(cursor)
		if decodeErr != nil {
			return nil, 0, glossaryFailure(400, "invalid_glossary_history_cursor", "Glossary history cursor is invalid")
		}
		args = append(args, occurredAt, id)
		pos := len(args)
		where += ` and (e.occurred_at, e.id) < ($` + strconv.Itoa(pos-1) + `::timestamptz, $` + strconv.Itoa(pos) + `::uuid)`
	}
	args = append(args, limit+1)
	rows, err := api.pool.Query(r.Context(), `select e.id, e.concept_id, e.term_id, e.event_type, e.actor_kind, e.actor_user_id, e.actor_credential_id, e.version, e.reason, e.changed_fields, e.changes, e.attributes, e.occurred_at, coalesce(nullif(trim(concat(coalesce(u.first_name,''),' ',coalesce(u.last_name,''))),''), u.email) from glossary_history_events e left join users u on u.id=e.actor_user_id where `+where+` order by e.occurred_at desc, e.id desc limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		// Table may be absent in older environments; return an empty page.
		if strings.Contains(err.Error(), "glossary_history_events") {
			return map[string]any{
				"events":     []any{},
				"nextCursor": nil,
				"pagination": map[string]any{"limit": limit, "returned": 0, "hasMore": false},
			}, 200, nil
		}
		return nil, 0, err
	}
	defer rows.Close()
	events := []map[string]any{}
	for rows.Next() {
		var (
			id, eventType, actorKind                                                string
			conceptID, termID, actorUserID, actorCredentialID, reason, actorDisplay *string
			version                                                                 int
			changedFields, changes, attributes                                      []byte
			occurredAt                                                              time.Time
		)
		if err := rows.Scan(&id, &conceptID, &termID, &eventType, &actorKind, &actorUserID, &actorCredentialID, &version, &reason, &changedFields, &changes, &attributes, &occurredAt, &actorDisplay); err != nil {
			return nil, 0, err
		}
		events = append(events, map[string]any{
			"id": id, "conceptId": conceptID, "termId": termID, "eventType": eventType, "actorKind": actorKind,
			"actorUserId": actorUserID, "actorCredentialId": actorCredentialID, "actorDisplayName": actorDisplay,
			"version": version, "reason": reason,
			"changedFields": jsonArrayOrEmpty(changedFields), "changes": jsonArrayOrEmpty(changes),
			"attributes": jsonObjectOrEmpty(attributes), "occurredAt": formatGlossaryTime(occurredAt),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasMore := len(events) > limit
	if hasMore {
		events = events[:limit]
	}
	var nextCursor any
	if hasMore && len(events) > 0 {
		last := events[len(events)-1]
		nextCursor = encodeGlossaryPageCursor(last["occurredAt"].(string), last["id"].(string))
	}
	return map[string]any{
		"events":     events,
		"nextCursor": nextCursor,
		"pagination": map[string]any{"limit": limit, "returned": len(events), "hasMore": hasMore},
	}, 200, nil
}

func jsonArrayOrEmpty(raw []byte) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`[]`)
	}
	return json.RawMessage(raw)
}

func (api *glossaryAPI) pageConceptTerms(r *http.Request, g glossaryRecord, conceptID string) (any, int, error) {
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "external_glossary_page_unsupported", "Provider-backed glossaries do not expose the native management index")
	}
	limit, _, err := glossaryPage(r, 50, 100)
	if err != nil {
		return nil, 0, err
	}
	var exists string
	err = api.pool.QueryRow(r.Context(), `select id from glossary_concepts where id=$1 and glossary_id=$2 and archived_at is null`, conceptID, g.ID).Scan(&exists)
	if errorsIsNoRows(err) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	where := `t.glossary_id=$1 and t.concept_id=$2 and t.archived_at is null`
	args := []any{g.ID, conceptID}
	if locale := strings.ReplaceAll(trimGlossaryInput(r.URL.Query().Get("locale")), "_", "-"); locale != "" {
		args = append(args, locale)
		where += ` and t.locale=$` + strconv.Itoa(len(args))
	}
	cursor := trimGlossaryInput(r.URL.Query().Get("cursor"))
	if cursor != "" {
		updatedAt, id, decodeErr := decodeGlossaryPageCursor(cursor)
		if decodeErr != nil {
			return nil, 0, glossaryFailure(400, "invalid_glossary_term_cursor", "Glossary term cursor is invalid")
		}
		args = append(args, updatedAt, id)
		pos := len(args)
		where += ` and (t.updated_at, t.id) < ($` + strconv.Itoa(pos-1) + `::timestamptz, $` + strconv.Itoa(pos) + `::uuid)`
	}
	args = append(args, limit+1)
	rows, err := api.pool.Query(r.Context(), `select `+glossaryTermColumns+` from glossary_terms t where `+where+` order by t.updated_at desc, t.id desc limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	terms := []glossaryConceptTermRecord{}
	for rows.Next() {
		term, scanErr := scanGlossaryTerm(rows, g.SourceLocale)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		terms = append(terms, term)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasMore := len(terms) > limit
	if hasMore {
		terms = terms[:limit]
	}
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from glossary_terms t where t.glossary_id=$1 and t.concept_id=$2 and t.archived_at is null`, g.ID, conceptID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	var nextCursor any
	if hasMore && len(terms) > 0 {
		last := terms[len(terms)-1]
		nextCursor = encodeGlossaryPageCursor(last.UpdatedAt, last.ID)
	}
	return map[string]any{
		"terms":      terms,
		"nextCursor": nextCursor,
		"total":      total,
		"pagination": map[string]any{"limit": limit, "returned": len(terms), "hasMore": hasMore},
	}, 200, nil
}
