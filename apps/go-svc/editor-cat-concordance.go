package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type editorCatGlossaryTerm struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Approved  bool   `json:"approved"`
	Forbidden bool   `json:"forbidden"`
}

type editorCatMemoryMatch struct {
	ID           string `json:"id"`
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
	MatchPercent int    `json:"matchPercent"`
	ContextLabel string `json:"contextLabel,omitempty"`
}

func (api *editorCatAPI) loadConcordance(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourceLocale string `json:"sourceLocale"`
		TargetLocale string `json:"targetLocale"`
		SourceText   string `json:"sourceText"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourceLocale := trimEditorCat(body.SourceLocale)
	targetLocale := trimEditorCat(body.TargetLocale)
	sourceText := body.SourceText
	if sourceLocale == "" || targetLocale == "" || trimEditorCat(sourceText) == "" || len(sourceText) > 100_000 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	pattern := "%" + escapeEditorCatIlike(sourceText) + "%"
	glossaryTerms, err := api.searchConcordanceGlossary(r, actor, project, sourceLocale, targetLocale, pattern)
	if err != nil {
		return nil, 0, err
	}
	memoryMatches, err := api.searchConcordanceMemory(r, actor, project, sourceLocale, targetLocale, pattern)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"concordance": map[string]any{
		"glossaryTerms":            glossaryTerms,
		"translationMemoryMatches": memoryMatches,
	}}, 200, nil
}

func (api *editorCatAPI) searchConcordanceGlossary(r *http.Request, actor editorCatActor, project editorCatProject, sourceLocale, targetLocale, pattern string) ([]editorCatGlossaryTerm, error) {
	rows, err := api.pool.Query(r.Context(), `
        select st.id::text, st.term, coalesce(tt.term, ''), coalesce(tt.forbidden, false)
        from project_glossaries pg
        join glossaries g on g.id = pg.glossary_id
        join glossary_terms st on st.glossary_id = g.id and st.locale=$3 and st.archived_at is null
        left join glossary_terms tt on tt.glossary_id = g.id and tt.concept_id = st.concept_id
            and tt.locale=$4 and tt.archived_at is null
        where pg.project_id=$2 and g.organization_id=$1 and g.status='active' and g.source='native'
          and st.term ilike $5 escape '\'
        order by pg.priority, st.term
        limit 20`, actor.organizationID, project.ID, sourceLocale, targetLocale, pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	terms := make([]editorCatGlossaryTerm, 0)
	for rows.Next() {
		var term editorCatGlossaryTerm
		if err := rows.Scan(&term.ID, &term.Source, &term.Target, &term.Forbidden); err != nil {
			return nil, err
		}
		term.Approved = !term.Forbidden && term.Target != ""
		terms = append(terms, term)
	}
	return terms, rows.Err()
}

func (api *editorCatAPI) searchConcordanceMemory(r *http.Request, actor editorCatActor, project editorCatProject, sourceLocale, targetLocale, pattern string) ([]editorCatMemoryMatch, error) {
	rows, err := api.pool.Query(r.Context(), `
        select e.id::text, e.source_text, e.target_text, e.match_score
        from project_memories pm
        join memories m on m.id = pm.memory_id
        join memory_entries e on e.memory_id = m.id
        where pm.project_id=$2 and m.organization_id=$1 and m.source='native'
          and e.source_locale=$3 and e.target_locale=$4
          and e.source_text ilike $5 escape '\'
        order by e.match_score desc, e.updated_at desc
        limit 20`, actor.organizationID, project.ID, sourceLocale, targetLocale, pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	matches := make([]editorCatMemoryMatch, 0)
	for rows.Next() {
		var match editorCatMemoryMatch
		if err := rows.Scan(&match.ID, &match.SourceText, &match.TargetText, &match.MatchPercent); err != nil {
			return nil, err
		}
		matches = append(matches, match)
	}
	return matches, rows.Err()
}

func (api *editorCatAPI) listActivityLogs(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	query := r.URL.Query()
	sourcePath, err := requireEditorCatQuery(query, "sourcePath", 2048)
	if err != nil {
		return nil, 0, err
	}
	limit, err := parseEditorCatIntQuery(query, "limit", 50, 1, 100)
	if err != nil {
		return nil, 0, err
	}
	eventTypes := []string{
		"file_uploaded",
		"file_translations_imported",
		"string_segment_approved",
		"string_segment_status_changed",
		"string_segment_hidden",
		"string_segment_unhidden",
		"string_segment_locked",
		"string_segment_unlocked",
		"string_segment_commented",
	}
	fingerprint := "cat:" + project.ID + ":" + sourcePath
	args := []any{actor.organizationID, eventTypes, project.ID}
	conditions := []string{
		"e.organization_id = $1",
		"e.event_type = any($2::text[])",
		"(e.payload->>'projectId' = $3 or e.target_id = $3)",
	}
	argN := 4
	if !isEditorCatAllFiles(sourcePath) {
		conditions = append(conditions, "e.payload->>'sourcePath' = $"+strconv.Itoa(argN))
		args = append(args, sourcePath)
		argN++
	}
	if cursor := trimEditorCat(query.Get("cursor")); cursor != "" {
		decoded, err := decodeActivityLogCursor(cursor, fingerprint)
		if err != nil {
			return nil, 0, editorCatFailure(400, "invalid_activity_log_cursor", "Activity log cursor is invalid")
		}
		conditions = append(conditions,
			"(e.created_at < $"+strconv.Itoa(argN)+" or (e.created_at = $"+strconv.Itoa(argN)+" and e.id < $"+strconv.Itoa(argN+1)+"::uuid))")
		args = append(args, decoded.createdAt, decoded.id)
		argN += 2
	}
	args = append(args, limit+1)
	rows, err := api.pool.Query(r.Context(), `
        select e.actor_credential_id, e.actor_kind, e.actor_user_id, e.created_at, e.event_type, e.id,
               e.payload, e.target_id, e.target_kind, u.first_name, u.last_name
        from organization_activity_events e
        left join users u on u.id = e.actor_user_id
        where `+strings.Join(conditions, " and ")+`
        order by e.created_at desc, e.id desc
        limit $`+strconv.Itoa(argN), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	type eventRow struct {
		actorCredentialID *string
		actorKind         string
		actorUserID       *string
		createdAt         time.Time
		eventType         string
		id                string
		payload           map[string]any
		targetID          string
		targetKind        string
		userFirstName     *string
		userLastName      *string
	}
	events := make([]eventRow, 0)
	for rows.Next() {
		var row eventRow
		var payloadRaw []byte
		if err := rows.Scan(
			&row.actorCredentialID, &row.actorKind, &row.actorUserID, &row.createdAt, &row.eventType, &row.id,
			&payloadRaw, &row.targetID, &row.targetKind, &row.userFirstName, &row.userLastName,
		); err != nil {
			return nil, 0, err
		}
		row.payload = map[string]any{}
		if len(payloadRaw) > 0 && string(payloadRaw) != "null" {
			_ = json.Unmarshal(payloadRaw, &row.payload)
		}
		events = append(events, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasNext := len(events) > limit
	page := events
	if hasNext {
		page = events[:limit]
	}
	items := make([]activityLogListItem, 0, len(page))
	for _, row := range page {
		items = append(items, activityLogListItem{
			Actor: activityLogActorView{
				CredentialID: row.actorCredentialID,
				DisplayName:  activityLogActorDisplayName(row.actorKind, row.userFirstName, row.userLastName),
				Kind:         row.actorKind,
				UserID:       row.actorUserID,
			},
			CreatedAt: formatActivityLogTime(row.createdAt),
			EventType: row.eventType,
			ID:        row.id,
			Payload:   row.payload,
			Target:    activityLogTargetView{ID: row.targetID, Kind: row.targetKind},
		})
	}
	var nextCursor *string
	if hasNext && len(page) > 0 {
		last := page[len(page)-1]
		encoded := encodeActivityLogCursor(activityLogCursor{createdAt: last.createdAt, id: last.id}, fingerprint)
		nextCursor = &encoded
	}
	return map[string]any{"activityLogs": items, "nextCursor": nextCursor}, 200, nil
}
