package main

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
)

type editorCatStringGroup struct {
	ID                  string `json:"id"`
	SourceText          string `json:"sourceText"`
	OccurrenceCount     int    `json:"occurrenceCount"`
	MatchingCount       int    `json:"matchingCount"`
	TranslationVariants int    `json:"translationVariants"`
	TranslatedCount     int    `json:"translatedCount"`
	ApprovedCount       int    `json:"approvedCount"`
	LockedCount         int    `json:"lockedCount"`
}

type editorCatGroupMember struct {
	ID            string  `json:"id"`
	Key           string  `json:"key"`
	SourcePath    string  `json:"sourcePath"`
	Context       *string `json:"context"`
	MaxLength     *int    `json:"maxLength"`
	TargetText    string  `json:"targetText"`
	Status        string  `json:"status"`
	IsHidden      bool    `json:"isHidden"`
	IsLocked      bool    `json:"isLocked"`
	MatchesFilter bool    `json:"matchesFilter"`
}

// Grouping is a read model. Original key identities and locale translations stay intact.
// Search/filter matches select groups, not their membership, so inspection can explain
// both matching and total occurrence counts without hiding conflicting translations.
func editorCatGroupScope(query editorCatQueueQuery) string {
	filter := editorCatQueueFilterSQL(query.queueFilter, 1, 2, 3)
	return `with scoped as (
        select k.id, k.key, k.source_text, k.context, k.max_length, k.is_hidden,
            f.source_path, coalesce(t.text, '') as target_text, coalesce(t.status::text, 'draft') as status,
            exists (select 1 from project_cat_segment_locks l
                where l.organization_id=$1 and l.project_id=$2 and l.target_locale=$3
                and l.external_string_id=k.id::text) as is_locked,
            encode(sha256(convert_to(case
                when coalesce(k.metadata->>'contentKind', '') in ('image_url','video_url')
                then 'media:' || k.id::text else 'text:' || k.source_text end, 'UTF8')), 'hex') as group_id,
            (($6 = '' or k.key ilike $6 escape '\' or k.source_text ilike $6 escape '\'
                or coalesce(k.context,'') ilike $6 escape '\' or coalesce(t.text,'') ilike $6 escape '\')
                ` + filter + `) as matches_filter
        from project_translation_keys k
        join repository_source_files f on f.id=k.repository_source_file_id
            and f.organization_id=k.organization_id and f.project_id=k.project_id
        left join project_translations t on t.translation_key_id=k.id
            and t.organization_id=$1 and t.project_id=$2 and t.target_locale=$3
        where k.organization_id=$1 and k.project_id=$2
            and ($4='*' or f.source_path=$4)
            and (cardinality($5::text[])=0 or f.source_path=any($5::text[]))
    )`
}

func parseEditorCatGroupQuery(r *http.Request) (editorCatQueueQuery, error) {
	query, err := parseEditorCatQueueQuery(r.URL.Query())
	if err != nil {
		return query, err
	}
	// These filters are evaluated in the browser in the ordinary queue. Reject them
	// here rather than returning misleading group-wide counts.
	switch query.queueFilter {
	case "qa_issues", "machine_translated", "with_comments":
		return query, editorCatFailure(400, "unsupported_group_filter", "This filter is not supported in grouped view")
	}
	return query, nil
}

func editorCatGroupArgs(actor editorCatActor, project editorCatProject, query editorCatQueueQuery) []any {
	search := ""
	if query.search != "" {
		search = "%" + escapeEditorCatIlike(query.search) + "%"
	}
	paths := query.sourcePaths
	if paths == nil {
		paths = []string{}
	}
	return []any{actor.organizationID, project.ID, query.targetLocale, query.sourcePath, paths, search}
}

func (api *editorCatAPI) getStringGroups(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query, err := parseEditorCatGroupQuery(r)
	if err != nil {
		return nil, 0, err
	}
	order := `first_path, first_key, id`
	if query.queueSort == "untranslated_first" {
		order = `"translatedCount" > 0, "approvedCount" = "occurrenceCount", ` + order
	}
	sql := editorCatGroupScope(query) + `, grouped as (
        select group_id as id, source_text as "sourceText", count(*)::int as "occurrenceCount",
            count(*) filter (where matches_filter)::int as "matchingCount",
            count(distinct target_text) filter (where trim(target_text) <> '')::int as "translationVariants",
            count(*) filter (where trim(target_text) <> '')::int as "translatedCount",
            count(*) filter (where status='approved')::int as "approvedCount",
            count(*) filter (where is_locked)::int as "lockedCount",
            min(source_path) as first_path, min(key) as first_key
        from scoped group by group_id, source_text having bool_or(matches_filter)
    ), page as (select * from grouped order by ` + order + ` limit $7 offset $8)
    select coalesce((select jsonb_agg(page) from page), '[]'::jsonb), (select count(*) from grouped)`
	var raw []byte
	var total int
	err = api.pool.QueryRow(r.Context(), sql, append(editorCatGroupArgs(actor, project, query), query.limit, query.offset)...).Scan(&raw, &total)
	if err != nil {
		return nil, 0, err
	}
	groups := []editorCatStringGroup{}
	if err := json.Unmarshal(raw, &groups); err != nil {
		return nil, 0, err
	}
	return map[string]any{"groups": groups, "pagination": editorCatPagination{
		Offset: query.offset, Limit: query.limit, ReturnedCount: len(groups), TotalCount: total,
		HasMore: query.offset+len(groups) < total,
	}}, http.StatusOK, nil
}

func (api *editorCatAPI) getStringGroupMembers(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	query, err := parseEditorCatGroupQuery(r)
	if err != nil {
		return nil, 0, err
	}
	groupID := r.PathValue("groupId")
	decoded, err := hex.DecodeString(groupID)
	if err != nil || len(decoded) != 32 {
		return nil, 0, editorCatFailure(400, "invalid_group_id", "Invalid string group")
	}
	sql := editorCatGroupScope(query) + `, members as (
        select id, key, source_path as "sourcePath", context, max_length as "maxLength",
            target_text as "targetText", status, is_hidden as "isHidden", is_locked as "isLocked",
            matches_filter as "matchesFilter"
        from scoped where group_id=$7
    ), page as (select * from members order by "sourcePath", key, id limit $8 offset $9)
    select coalesce((select jsonb_agg(page) from page), '[]'::jsonb), (select count(*) from members)`
	var raw []byte
	var total int
	err = api.pool.QueryRow(r.Context(), sql, append(editorCatGroupArgs(actor, project, query), groupID, query.limit, query.offset)...).Scan(&raw, &total)
	if err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return nil, 0, editorCatFailure(404, "string_group_not_found", "String group not found")
	}
	members := []editorCatGroupMember{}
	if err := json.Unmarshal(raw, &members); err != nil {
		return nil, 0, err
	}
	return map[string]any{"members": members, "pagination": editorCatPagination{
		Offset: query.offset, Limit: query.limit, ReturnedCount: len(members), TotalCount: total,
		HasMore: query.offset+len(members) < total,
	}}, http.StatusOK, nil
}
