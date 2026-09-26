package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

type editorCatSegment struct {
	ExternalStringID  string  `json:"externalStringId"`
	Key               string  `json:"key"`
	SourceText        string  `json:"sourceText"`
	Context           *string `json:"context"`
	Type              *string `json:"type"`
	MaxLength         *int    `json:"maxLength,omitempty"`
	IsHidden          *bool   `json:"isHidden,omitempty"`
	IsLocked          *bool   `json:"isLocked,omitempty"`
	ContentKind       *string `json:"contentKind,omitempty"`
	SourceAssetURL    *string `json:"sourceAssetUrl,omitempty"`
	TargetAssetURL    *string `json:"targetAssetUrl,omitempty"`
	ImageVariantID    *string `json:"imageVariantId,omitempty"`
	LooksLikeImageURL *bool   `json:"looksLikeImageUrl,omitempty"`
	LooksLikeVideoURL *bool   `json:"looksLikeVideoUrl,omitempty"`
	SourcePath        *string `json:"sourcePath,omitempty"`
}

type editorCatPagination struct {
	Offset        int  `json:"offset"`
	Limit         int  `json:"limit"`
	ReturnedCount int  `json:"returnedCount"`
	TotalCount    int  `json:"totalCount"`
	HasMore       bool `json:"hasMore"`
}

type editorCatTeamGlossary struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	TeamID string `json:"teamId"`
}

type editorCatContributorTeam struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type editorCatQueueFile struct {
	SourcePath                string                     `json:"sourcePath"`
	Filename                  string                     `json:"filename"`
	Provider                  any                        `json:"provider"`
	TargetLocale              string                     `json:"targetLocale"`
	CanEditTranslations       bool                       `json:"canEditTranslations"`
	Truncated                 bool                       `json:"truncated"`
	TeamGlossaries            []editorCatTeamGlossary    `json:"teamGlossaries,omitempty"`
	ContributorTeams          []editorCatContributorTeam `json:"contributorTeams,omitempty"`
	ProjectTeamID             *string                    `json:"projectTeamId,omitempty"`
	CanContributeTeamGlossary bool                       `json:"canContributeTeamGlossary,omitempty"`
	TeamName                  *string                    `json:"teamName,omitempty"`
	ProjectTeamSlug           *string                    `json:"projectTeamSlug,omitempty"`
	Segments                  []editorCatSegment         `json:"segments"`
	Pagination                *editorCatPagination       `json:"pagination,omitempty"`
}

type editorCatQueueQuery struct {
	sourcePath   string
	targetLocale string
	search       string
	queueFilter  string
	queueSort    string
	offset       int
	limit        int
	sourcePaths  []string
}

func parseEditorCatQueueQuery(values url.Values) (editorCatQueueQuery, error) {
	sourcePath, err := requireEditorCatQuery(values, "sourcePath", 2048)
	if err != nil {
		return editorCatQueueQuery{}, err
	}
	targetLocale, err := requireEditorCatQuery(values, "targetLocale", 32)
	if err != nil {
		return editorCatQueueQuery{}, err
	}
	search := trimEditorCat(values.Get("search"))
	if len(search) > editorCatMaxSearchLen {
		return editorCatQueueQuery{}, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	queueFilter := trimEditorCat(values.Get("queueFilter"))
	if queueFilter == "" {
		queueFilter = "all"
	}
	switch queueFilter {
	case "all", "untranslated", "needs_review", "reviewed", "has_issues", "hidden", "qa_issues", "machine_translated", "with_comments":
	default:
		return editorCatQueueQuery{}, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	queueSort := trimEditorCat(values.Get("queueSort"))
	if queueSort == "" {
		queueSort = "file_order"
	}
	if queueSort != "file_order" && queueSort != "untranslated_first" {
		return editorCatQueueQuery{}, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	offset, err := parseEditorCatIntQuery(values, "offset", 0, 0, 1_000_000)
	if err != nil {
		return editorCatQueueQuery{}, err
	}
	limit, err := parseEditorCatIntQuery(values, "limit", editorCatDefaultLimit, 1, editorCatMaxLimit)
	if err != nil {
		return editorCatQueueQuery{}, err
	}
	var sourcePaths []string
	if raw := trimEditorCat(values.Get("sourcePaths")); raw != "" {
		seen := map[string]bool{}
		for _, part := range strings.Split(raw, ",") {
			path := trimEditorCat(part)
			if path == "" || seen[path] {
				continue
			}
			seen[path] = true
			sourcePaths = append(sourcePaths, path)
		}
	}
	return editorCatQueueQuery{
		sourcePath:   sourcePath,
		targetLocale: targetLocale,
		search:       search,
		queueFilter:  queueFilter,
		queueSort:    queueSort,
		offset:       offset,
		limit:        limit,
		sourcePaths:  sourcePaths,
	}, nil
}

func (api *editorCatAPI) getQueue(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	queue, err := api.loadQueue(r, actor, project)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"contentEditorQueue": queue}, 200, nil
}

func (api *editorCatAPI) getFile(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	queue, err := api.loadQueue(r, actor, project)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"contentEditorFile": queue}, 200, nil
}

func (api *editorCatAPI) loadQueue(r *http.Request, actor editorCatActor, project editorCatProject) (editorCatQueueFile, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return editorCatQueueFile{}, err
	}
	query, err := parseEditorCatQueueQuery(r.URL.Query())
	if err != nil {
		return editorCatQueueFile{}, err
	}
	noteRequest(r,
		"queue_kind", editorCatQueueKind(query.sourcePath),
		"target_locale", query.targetLocale,
		"queue_filter", query.queueFilter,
		"queue_sort", query.queueSort,
		"limit", query.limit,
		"offset", query.offset,
		"has_search", query.search != "",
	)
	var queue editorCatQueueFile
	if isEditorCatAllFiles(query.sourcePath) {
		queue, err = api.loadAllFilesQueue(r, actor, project, query)
	} else if isEditorCatWholeFile(query.sourcePath) {
		queue, err = api.loadWholeFileQueue(r, actor, project, query)
	} else {
		queue, err = api.loadTextFileQueue(r, actor, project, query)
	}
	if err != nil {
		return editorCatQueueFile{}, err
	}
	noteRequest(r, "segments", len(queue.Segments))
	if queue.Pagination != nil {
		noteRequest(r, "total", queue.Pagination.TotalCount, "has_more", queue.Pagination.HasMore)
	}
	return api.withQueueContext(r, actor, project, queue)
}

func editorCatQueueKind(sourcePath string) string {
	if isEditorCatAllFiles(sourcePath) {
		return "all_files"
	}
	if isEditorCatWholeFile(sourcePath) {
		return "whole_file"
	}
	return "text"
}

func (api *editorCatAPI) loadTextFileQueue(r *http.Request, actor editorCatActor, project editorCatProject, query editorCatQueueQuery) (editorCatQueueFile, error) {
	sourceFileID, err := api.sourceFileID(r, actor, project, query.sourcePath)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	keys, total, err := api.listKeys(r, actor, project, query, &sourceFileID, false)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	pagination := editorCatPagination{
		Offset:        query.offset,
		Limit:         query.limit,
		ReturnedCount: len(keys),
		TotalCount:    total,
		HasMore:       query.offset+len(keys) < total,
	}
	return editorCatQueueFile{
		SourcePath:          query.sourcePath,
		Filename:            filenameFromSourcePath(query.sourcePath),
		Provider:            nil,
		TargetLocale:        query.targetLocale,
		CanEditTranslations: actor.canEdit(),
		Truncated:           pagination.HasMore,
		Segments:            keys,
		Pagination:          &pagination,
	}, nil
}

func (api *editorCatAPI) loadAllFilesQueue(r *http.Request, actor editorCatActor, project editorCatProject, query editorCatQueueQuery) (editorCatQueueFile, error) {
	keys, total, err := api.listKeys(r, actor, project, query, nil, true)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	pagination := editorCatPagination{
		Offset:        query.offset,
		Limit:         query.limit,
		ReturnedCount: len(keys),
		TotalCount:    total,
		HasMore:       query.offset+len(keys) < total,
	}
	return editorCatQueueFile{
		SourcePath:          "*",
		Filename:            "All Files",
		Provider:            nil,
		TargetLocale:        query.targetLocale,
		CanEditTranslations: actor.canEdit(),
		Truncated:           pagination.HasMore,
		Segments:            keys,
		Pagination:          &pagination,
	}, nil
}

func (api *editorCatAPI) loadWholeFileQueue(r *http.Request, actor editorCatActor, project editorCatProject, query editorCatQueueQuery) (editorCatQueueFile, error) {
	sourceFileID, err := api.sourceFileID(r, actor, project, query.sourcePath)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	kind := editorCatSourceKind(query.sourcePath)
	contentKind := string(kind)
	variantTable := "project_image_variants"
	if kind == editorCatKindVideo {
		variantTable = "project_video_variants"
	}
	var sourceStored, targetStored, variantID *string
	err = api.pool.QueryRow(r.Context(), `
        select v.stored_file_id
        from repository_source_file_versions v
        where v.organization_id=$1 and v.project_id=$2 and v.source_path=$3
        order by v.created_at desc
        limit 1`, actor.organizationID, project.ID, query.sourcePath).Scan(&sourceStored)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return editorCatQueueFile{}, err
	}
	_ = api.pool.QueryRow(r.Context(), `
        select id, stored_file_id from `+variantTable+`
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
        limit 1`, actor.organizationID, project.ID, query.sourcePath, query.targetLocale).Scan(&variantID, &targetStored)
	var sourceURL, targetURL *string
	if sourceStored != nil && *sourceStored != "" {
		url := editorCatAssetPath(actor.organizationSlug, project.ID, *sourceStored)
		sourceURL = &url
	}
	if targetStored != nil && *targetStored != "" {
		url := editorCatAssetPath(actor.organizationSlug, project.ID, *targetStored)
		targetURL = &url
	}
	segment := editorCatSegment{
		ExternalStringID: binaryEditorCatStringID(sourceFileID, query.sourcePath),
		Key:              query.sourcePath,
		SourceText:       query.sourcePath,
		ContentKind:      &contentKind,
		SourceAssetURL:   sourceURL,
		TargetAssetURL:   targetURL,
		ImageVariantID:   variantID,
	}
	return editorCatQueueFile{
		SourcePath:          query.sourcePath,
		Filename:            filenameFromSourcePath(query.sourcePath),
		Provider:            nil,
		TargetLocale:        query.targetLocale,
		CanEditTranslations: actor.canEdit(),
		Truncated:           false,
		Segments:            []editorCatSegment{segment},
	}, nil
}

func (api *editorCatAPI) sourceFileID(r *http.Request, actor editorCatActor, project editorCatProject, sourcePath string) (string, error) {
	var id string
	err := api.pool.QueryRow(r.Context(), `
        select id from repository_source_files
        where organization_id=$1 and project_id=$2 and source_path=$3
        limit 1`, actor.organizationID, project.ID, sourcePath).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", editorCatFailure(400, "source_file_not_found", "Source file not found for the given path")
	}
	return id, err
}

func escapeEditorCatIlike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func editorCatQueueFilterSQL(filter string, orgN, projectN, localeN int) string {
	translationMatch := `t.translation_key_id = k.id and t.organization_id=$` + strconv.Itoa(orgN) +
		` and t.project_id=$` + strconv.Itoa(projectN) + ` and t.target_locale=$` + strconv.Itoa(localeN)
	switch filter {
	case "untranslated":
		return ` and not exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '')`
	case "reviewed":
		return ` and exists (select 1 from project_translations t where ` + translationMatch + ` and t.status='approved')`
	case "needs_review":
		return ` and exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '' and t.status != 'approved')`
	case "has_issues":
		return ` and (
            exists (
                select 1 from issue_sheet_issues i
                where i.translation_key_id = k.id and i.organization_id=$` + strconv.Itoa(orgN) + `
                  and i.project_id=$` + strconv.Itoa(projectN) + ` and i.target_locale=$` + strconv.Itoa(localeN) + `
                  and i.status in ('open', 'in_progress')
            )
            or exists (
                select 1 from project_translation_comments c
                where c.translation_key_id = k.id and c.organization_id=$` + strconv.Itoa(orgN) + `
                  and c.project_id=$` + strconv.Itoa(projectN) + ` and c.target_locale=$` + strconv.Itoa(localeN) + `
                  and c.type='issue' and c.status='unresolved'
                  and not exists (select 1 from issue_sheet_issues i where i.linked_comment_id = c.id)
            )
        )`
	case "hidden":
		return ` and k.is_hidden = true`
	default:
		return ""
	}
}

// editorCatQueueFilterBindsLocale reports whether the filter SQL references the
// target-locale placeholder. "all" and the deferred filters do not.
func editorCatQueueFilterBindsLocale(filter string) bool {
	switch filter {
	case "untranslated", "reviewed", "needs_review", "has_issues":
		return true
	default:
		return false
	}
}

func (api *editorCatAPI) listKeys(r *http.Request, actor editorCatActor, project editorCatProject, query editorCatQueueQuery, sourceFileID *string, includeSourcePath bool) ([]editorCatSegment, int, error) {
	args := []any{actor.organizationID, project.ID}
	where := `k.organization_id=$1 and k.project_id=$2`
	if sourceFileID != nil {
		args = append(args, *sourceFileID)
		where += ` and k.repository_source_file_id=$` + strconv.Itoa(len(args))
	}
	if includeSourcePath {
		where += ` and k.repository_source_file_id is not null`
		if len(query.sourcePaths) > 0 {
			args = append(args, query.sourcePaths)
			where += ` and f.source_path = any($` + strconv.Itoa(len(args)) + `::text[])`
		}
	}
	if query.search != "" {
		args = append(args, "%"+escapeEditorCatIlike(query.search)+"%")
		searchN := strconv.Itoa(len(args))
		args = append(args, query.targetLocale)
		localeN := strconv.Itoa(len(args))
		where += ` and (
            k.key ilike $` + searchN + ` escape '\' or
            k.source_text ilike $` + searchN + ` escape '\' or
            coalesce(k.context,'') ilike $` + searchN + ` escape '\' or
            exists (
                select 1 from project_translations t
                where t.translation_key_id=k.id and t.organization_id=$1 and t.project_id=$2
                  and t.target_locale=$` + localeN + ` and t.text ilike $` + searchN + ` escape '\'
            )
        )`
	}
	// pgx rejects unused arguments. Bind targetLocale only in the statements
	// whose SQL actually references it. The count query has no ORDER BY, so a
	// sort that needs the locale must not add that argument to the count.
	countArgs := append([]any(nil), args...)
	filterLocale := 0
	if editorCatQueueFilterBindsLocale(query.queueFilter) {
		countArgs = append(countArgs, query.targetLocale)
		filterLocale = len(countArgs)
	}
	where += editorCatQueueFilterSQL(query.queueFilter, 1, 2, filterLocale)

	join := ""
	if includeSourcePath {
		join = ` inner join repository_source_files f on f.id = k.repository_source_file_id`
	}
	var total int
	err := api.pool.QueryRow(r.Context(), `select count(*) from project_translation_keys k`+join+` where `+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	order := `k.key, k.id`
	if includeSourcePath {
		order = `f.source_path, k.key, k.id`
	}
	listArgs := append([]any(nil), countArgs...)
	if query.queueSort == "untranslated_first" {
		if !editorCatQueueFilterBindsLocale(query.queueFilter) {
			listArgs = append(listArgs, query.targetLocale)
		}
		localeN := strconv.Itoa(len(listArgs))
		rank := `case
            when not exists (select 1 from project_translations t where t.translation_key_id=k.id and t.organization_id=$1 and t.project_id=$2 and t.target_locale=$` + localeN + ` and trim(t.text) != '') then 0
            when exists (select 1 from project_translations t where t.translation_key_id=k.id and t.organization_id=$1 and t.project_id=$2 and t.target_locale=$` + localeN + ` and trim(t.text) != '' and t.status != 'approved') then 1
            else 2 end`
		order = rank + `, ` + order
	}
	listArgs = append(listArgs, query.limit, query.offset)
	selectCols := `k.id, k.key, k.source_text, k.context, k.type, k.max_length, k.metadata, k.is_hidden`
	if includeSourcePath {
		selectCols += `, f.source_path`
	}
	rows, err := api.pool.Query(r.Context(), `
        select `+selectCols+`
        from project_translation_keys k`+join+`
        where `+where+`
        order by `+order+`
        limit $`+strconv.Itoa(len(listArgs)-1)+` offset $`+strconv.Itoa(len(listArgs)), listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	segments := make([]editorCatSegment, 0)
	for rows.Next() {
		var segment editorCatSegment
		var context, keyType *string
		var maxLength *int
		var metadata []byte
		var hidden bool
		var sourcePath *string
		dest := []any{&segment.ExternalStringID, &segment.Key, &segment.SourceText, &context, &keyType, &maxLength, &metadata, &hidden}
		if includeSourcePath {
			dest = append(dest, &sourcePath)
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, 0, err
		}
		segment.Context = context
		segment.Type = keyType
		if maxLength != nil && *maxLength > 0 {
			segment.MaxLength = maxLength
		}
		if hidden {
			value := true
			segment.IsHidden = &value
		}
		contentKind := editorCatMetadataContentKind(metadata)
		if contentKind != "" {
			segment.ContentKind = &contentKind
			segment.SourceAssetURL = &segment.SourceText
		}
		if looksLikeEditorCatImageURL(segment.SourceText) || contentKind == "image_url" {
			value := looksLikeEditorCatImageURL(segment.SourceText) || contentKind == "image_url"
			segment.LooksLikeImageURL = &value
		}
		if looksLikeEditorCatVideoURL(segment.SourceText) || contentKind == "video_url" {
			value := looksLikeEditorCatVideoURL(segment.SourceText) || contentKind == "video_url"
			segment.LooksLikeVideoURL = &value
		}
		if includeSourcePath && sourcePath != nil {
			segment.SourcePath = sourcePath
		}
		segments = append(segments, segment)
	}
	return segments, total, rows.Err()
}

func editorCatMetadataContentKind(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	kind, _ := payload["contentKind"].(string)
	if kind == "image_url" || kind == "video_url" {
		return kind
	}
	return ""
}

func (api *editorCatAPI) withQueueContext(r *http.Request, actor editorCatActor, project editorCatProject, queue editorCatQueueFile) (editorCatQueueFile, error) {
	if err := api.attachLocks(r, actor, project, &queue); err != nil {
		return editorCatQueueFile{}, err
	}
	glossaries, err := api.listTeamGlossaries(r, project.ID)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	teams, err := api.listContributorTeams(r, actor)
	if err != nil {
		return editorCatQueueFile{}, err
	}
	queue.TeamGlossaries = glossaries
	queue.ContributorTeams = teams
	queue.CanContributeTeamGlossary = actor.canManageGlossaries() || actor.role == "translator"
	queue.ProjectTeamID = project.TeamID
	queue.TeamName = project.TeamName
	queue.ProjectTeamSlug = project.TeamSlug
	return queue, nil
}

func (api *editorCatAPI) attachLocks(r *http.Request, actor editorCatActor, project editorCatProject, queue *editorCatQueueFile) error {
	if len(queue.Segments) == 0 {
		return nil
	}
	ids := make([]string, 0, len(queue.Segments))
	for _, segment := range queue.Segments {
		ids = append(ids, segment.ExternalStringID)
	}
	rows, err := api.pool.Query(r.Context(), `
        select external_string_id from project_cat_segment_locks
        where organization_id=$1 and project_id=$2 and target_locale=$3 and external_string_id = any($4::text[])`,
		actor.organizationID, project.ID, queue.TargetLocale, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	locked := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		locked[id] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(locked) == 0 {
		return nil
	}
	for i, segment := range queue.Segments {
		if locked[segment.ExternalStringID] {
			value := true
			queue.Segments[i].IsLocked = &value
		}
	}
	return nil
}

func (api *editorCatAPI) listTeamGlossaries(r *http.Request, projectID string) ([]editorCatTeamGlossary, error) {
	rows, err := api.pool.Query(r.Context(), `
        select g.id, g.name, g.team_id
        from project_glossaries pg
        join glossaries g on g.id = pg.glossary_id
        join projects p on p.id = pg.project_id
        where pg.project_id=$1 and g.status='active' and g.source='native' and g.control_level='team'
          and g.source_locale = p.source_locale and g.team_id is not null
        order by pg.priority, g.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]editorCatTeamGlossary, 0)
	for rows.Next() {
		var item editorCatTeamGlossary
		if err := rows.Scan(&item.ID, &item.Name, &item.TeamID); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (api *editorCatAPI) listContributorTeams(r *http.Request, actor editorCatActor) ([]editorCatContributorTeam, error) {
	sql := `
        select t.id, t.name, t.slug
        from teams t
        where t.organization_id=$1 and t.slug <> 'default'`
	args := []any{actor.organizationID}
	if !actor.canManageGlossaries() {
		sql = `
            select t.id, t.name, t.slug
            from team_memberships m
            join teams t on t.id = m.team_id
            where m.user_id=$2 and t.organization_id=$1 and t.slug <> 'default'`
		args = append(args, actor.userID)
	}
	sql += ` order by t.name`
	rows, err := api.pool.Query(r.Context(), sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]editorCatContributorTeam, 0)
	for rows.Next() {
		var item editorCatContributorTeam
		if err := rows.Scan(&item.ID, &item.Name, &item.Slug); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
