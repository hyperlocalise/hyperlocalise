package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type memoryEntryListFilters struct {
	Search          string
	SourceLocale    string
	TargetLocale    string
	ReviewStatus    string
	SameAsSource    string
	Origin          string
	Provider        string
	CreatedByUserID string
	ModifiedFrom    string
	ModifiedTo      string
	ImportBatchID   string
	Sort            string
	SortDir         string
}

type memoryEntryCursorPayload struct {
	Sort       string `json:"sort"`
	Dir        string `json:"dir"`
	SortValue  string `json:"sortValue"`
	ID         string `json:"id"`
	FilterHash string `json:"filterHash"`
}

type memoryEntryFilterHashFields struct {
	CreatedByUserID string `json:"createdByUserId"`
	ImportBatchID   string `json:"importBatchId"`
	ModifiedFrom    string `json:"modifiedFrom"`
	ModifiedTo      string `json:"modifiedTo"`
	Origin          string `json:"origin"`
	Provider        string `json:"provider"`
	ReviewStatus    string `json:"reviewStatus"`
	SameAsSource    string `json:"sameAsSource"`
	Search          string `json:"search"`
	Sort            string `json:"sort"`
	SortDir         string `json:"sortDir"`
	SourceLocale    string `json:"sourceLocale"`
	TargetLocale    string `json:"targetLocale"`
}

func (api *memoryAPI) listMemoryEntries(r *http.Request, m memoryRecord) (any, int, error) {
	limit, offset, err := memoryPage(r, 50, 100)
	if err != nil {
		limit, offset = 50, 0
	}
	filters, err := parseMemoryEntryListFilters(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	filterWhere, args, err := memoryEntryListWhere(m.ID, filters)
	if err != nil {
		return nil, 0, err
	}
	countArgs := append([]any{}, args...)
	where := filterWhere
	if cursor := trimMemoryInput(r.URL.Query().Get("cursor")); cursor != "" {
		payload, decodeErr := decodeMemoryEntryListCursor(cursor, filters)
		if decodeErr != nil {
			return nil, 0, decodeErr
		}
		args = append(args, payload.SortValue, payload.ID)
		pos := len(args)
		cmp := "<"
		if filters.SortDir == "asc" {
			cmp = ">"
		}
		where += ` and (` + memoryEntryListSortColumn(filters.Sort) + ` ` + cmp + ` $` + itoa(pos-1) + `::timestamptz or (` + memoryEntryListSortColumn(filters.Sort) + ` = $` + itoa(pos-1) + `::timestamptz and e.id ` + cmp + ` $` + itoa(pos) + `::uuid))`
		offset = 0
	}
	args = append(args, limit+1)
	limitPos := len(args)
	query := `select ` + memoryEntryColumns + `, to_char(` + memoryEntryListSortColumn(filters.Sort) + ` at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from memory_entries e where ` + where + ` order by ` + memoryEntryListSortColumn(filters.Sort) + ` ` + filters.SortDir + `, e.id ` + filters.SortDir + ` limit $` + itoa(limitPos)
	if offset > 0 {
		args = append(args, offset)
		query += ` offset $` + itoa(len(args))
	}
	rows, err := api.pool.Query(r.Context(), query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	entries := []memoryEntryRecord{}
	sortValues := []string{}
	for rows.Next() {
		var sortValue string
		entry, scanErr := scanMemoryEntry(rows, &sortValue)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		entries = append(entries, entry)
		sortValues = append(sortValues, sortValue)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasMore := len(entries) > limit
	if hasMore {
		entries = entries[:limit]
		sortValues = sortValues[:limit]
	}
	var nextCursor *string
	if hasMore && len(entries) > 0 {
		encoded := encodeMemoryEntryListCursor(filters, sortValues[len(sortValues)-1], entries[len(entries)-1].ID)
		nextCursor = &encoded
	}
	var total int
	if err := api.pool.QueryRow(r.Context(), `select count(*) from memory_entries e where `+filterWhere, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"memoryEntries": entries,
		"total":         total,
		"nextCursor":    nextCursor,
		"pagination": map[string]any{
			"limit":    limit,
			"returned": len(entries),
			"hasMore":  hasMore,
		},
	}, 200, nil
}

func parseMemoryEntryListFilters(query url.Values) (memoryEntryListFilters, error) {
	filters := memoryEntryListFilters{
		Search:          trimMemoryInput(query.Get("search")),
		SourceLocale:    strings.ReplaceAll(trimMemoryInput(query.Get("sourceLocale")), "_", "-"),
		TargetLocale:    strings.ReplaceAll(trimMemoryInput(query.Get("targetLocale")), "_", "-"),
		ReviewStatus:    trimMemoryInput(query.Get("reviewStatus")),
		SameAsSource:    trimMemoryInput(query.Get("sameAsSource")),
		Origin:          trimMemoryInput(query.Get("origin")),
		Provider:        trimMemoryInput(query.Get("provider")),
		CreatedByUserID: strings.ToLower(trimMemoryInput(query.Get("createdByUserId"))),
		ModifiedFrom:    trimMemoryInput(query.Get("modifiedFrom")),
		ModifiedTo:      trimMemoryInput(query.Get("modifiedTo")),
		ImportBatchID:   strings.ToLower(trimMemoryInput(query.Get("importBatchId"))),
		Sort:            trimMemoryInput(query.Get("sort")),
		SortDir:         strings.ToLower(trimMemoryInput(query.Get("sortDir"))),
	}
	if len(filters.Search) > 200 {
		return filters, invalidMemory()
	}
	if filters.ReviewStatus != "" && filters.ReviewStatus != "approved" && filters.ReviewStatus != "pending" && filters.ReviewStatus != "rejected" {
		return filters, invalidMemory()
	}
	if filters.SameAsSource != "" && filters.SameAsSource != "true" {
		return filters, invalidMemory()
	}
	if filters.CreatedByUserID != "" && !validMemoryID(filters.CreatedByUserID) {
		return filters, invalidMemory()
	}
	if filters.ImportBatchID != "" && !validMemoryID(filters.ImportBatchID) {
		return filters, invalidMemory()
	}
	if filters.Sort == "" {
		filters.Sort = "created_at"
	}
	if filters.Sort != "created_at" && filters.Sort != "updated_at" {
		return filters, invalidMemory()
	}
	if filters.SortDir == "" {
		filters.SortDir = "desc"
	}
	if filters.SortDir != "asc" && filters.SortDir != "desc" {
		return filters, invalidMemory()
	}
	modifiedFrom, ok := parseMemoryEntryListTime(filters.ModifiedFrom)
	if !ok {
		return filters, invalidMemory()
	}
	modifiedTo, ok := parseMemoryEntryListTime(filters.ModifiedTo)
	if !ok {
		return filters, invalidMemory()
	}
	if !modifiedFrom.IsZero() && !modifiedTo.IsZero() && modifiedFrom.After(modifiedTo) {
		return filters, invalidMemory()
	}
	return filters, nil
}

// An empty value yields the zero time. RFC3339Nano parsing also accepts
// timestamps without fractional seconds.
func parseMemoryEntryListTime(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, true
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func memoryEntryListWhere(memoryID string, filters memoryEntryListFilters) (string, []any, error) {
	where := `e.memory_id=$1`
	args := []any{memoryID}
	add := func(clause string, value any) {
		args = append(args, value)
		where += ` and ` + strings.ReplaceAll(clause, "?", "$"+itoa(len(args)))
	}
	if filters.SourceLocale != "" {
		add(`e.source_locale=?`, filters.SourceLocale)
	}
	if filters.TargetLocale != "" {
		add(`e.target_locale=?`, filters.TargetLocale)
	}
	if filters.ReviewStatus != "" {
		add(`e.review_status=?`, filters.ReviewStatus)
	}
	if filters.SameAsSource == "true" {
		where += ` and e.source_text=e.target_text`
	}
	if filters.Origin != "" {
		add(`e.provenance=?`, filters.Origin)
	}
	if filters.Provider != "" {
		args = append(args, filters.Provider)
		pos := itoa(len(args))
		where += ` and (e.provenance=$` + pos + ` or e.metadata->>'provider'=$` + pos + `)`
	}
	if filters.CreatedByUserID != "" {
		add(`e.created_by_user_id=?::uuid`, filters.CreatedByUserID)
	}
	if filters.ImportBatchID != "" {
		add(`e.import_batch_id=?::uuid`, filters.ImportBatchID)
	}
	if filters.ModifiedFrom != "" {
		add(`e.updated_at>=?::timestamptz`, filters.ModifiedFrom)
	}
	if filters.ModifiedTo != "" {
		add(`e.updated_at<=?::timestamptz`, filters.ModifiedTo)
	}
	if filters.Search != "" {
		searchWhere, searchArgs := memoryEntrySearchWhere(filters.Search, len(args))
		if searchWhere != "" {
			where += ` and (` + searchWhere + `)`
			args = append(args, searchArgs...)
		}
	}
	return where, args, nil
}

func memoryEntrySearchWhere(search string, argOffset int) (string, []any) {
	clauses := []string{}
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		clauses = append(clauses, strings.ReplaceAll(clause, "?", "$"+itoa(argOffset+len(args))))
	}
	if validMemoryID(strings.ToLower(search)) {
		add(`e.id=?::uuid`, strings.ToLower(search))
	}
	add(`e.external_key=?`, search)
	if tsQuery := buildMemoryEntryTsQuery(search); tsQuery != "" {
		add(`e.management_search_vector @@ to_tsquery('simple', ?)`, tsQuery)
	}
	return strings.Join(clauses, " or "), args
}

const (
	memoryEntryTsQueryMaxTokens = 50
	memoryEntryTsQueryPrefix    = ":*"
	memoryEntryTsQuerySeparator = " & "
)

func isMemoryEntryTsDelimiter(r rune) bool {
	switch r {
	case '&', '|', '!', '(', ')', ':', '*', '<', '>', '\'', '"', '-':
		return true
	}
	if r < utf8.RuneSelf {
		return r == ' ' || ('\t' <= r && r <= '\r')
	}
	return unicode.IsSpace(r)
}

func buildMemoryEntryTsQuery(input string) string {
	if !utf8.ValidString(input) {
		// An identity strings.Map rewrites each invalid byte as U+FFFD, so Postgres
		// never receives an invalid UTF-8 tsquery.
		input = strings.Map(func(r rune) rune { return r }, input)
	}

	var spans [memoryEntryTsQueryMaxTokens][2]int
	count, tokenBytes, start := 0, 0, -1
	for i := 0; i < len(input) && count < len(spans); {
		r, width := rune(input[i]), 1
		if r >= utf8.RuneSelf {
			r, width = utf8.DecodeRuneInString(input[i:])
		}
		if isMemoryEntryTsDelimiter(r) {
			if start >= 0 {
				spans[count] = [2]int{start, i}
				tokenBytes += i - start
				count++
				start = -1
			}
		} else if start < 0 {
			start = i
		}
		i += width
	}
	if start >= 0 && count < len(spans) {
		spans[count] = [2]int{start, len(input)}
		tokenBytes += len(input) - start
		count++
	}
	if count == 0 {
		return ""
	}

	var b strings.Builder
	b.Grow(tokenBytes + count*len(memoryEntryTsQueryPrefix) + (count-1)*len(memoryEntryTsQuerySeparator))
	for i, span := range spans[:count] {
		if i > 0 {
			b.WriteString(memoryEntryTsQuerySeparator)
		}
		b.WriteString(input[span[0]:span[1]])
		b.WriteString(memoryEntryTsQueryPrefix)
	}
	return b.String()
}

func memoryEntryListSortColumn(sort string) string {
	if sort == "updated_at" {
		return "e.updated_at"
	}
	return "e.created_at"
}

func hashMemoryEntryListFilters(filters memoryEntryListFilters) string {
	payload, _ := json.Marshal(memoryEntryFilterHashFields{
		CreatedByUserID: filters.CreatedByUserID,
		ImportBatchID:   filters.ImportBatchID,
		ModifiedFrom:    filters.ModifiedFrom,
		ModifiedTo:      filters.ModifiedTo,
		Origin:          filters.Origin,
		Provider:        filters.Provider,
		ReviewStatus:    filters.ReviewStatus,
		SameAsSource:    filters.SameAsSource,
		Search:          filters.Search,
		Sort:            filters.Sort,
		SortDir:         filters.SortDir,
		SourceLocale:    filters.SourceLocale,
		TargetLocale:    filters.TargetLocale,
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])[:16]
}

func encodeMemoryEntryListCursor(filters memoryEntryListFilters, sortValue, id string) string {
	raw, _ := json.Marshal(memoryEntryCursorPayload{
		Sort:       filters.Sort,
		Dir:        filters.SortDir,
		SortValue:  sortValue,
		ID:         id,
		FilterHash: hashMemoryEntryListFilters(filters),
	})
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeMemoryEntryListCursor(cursor string, filters memoryEntryListFilters) (memoryEntryCursorPayload, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		raw, err = base64.URLEncoding.DecodeString(cursor)
	}
	if err != nil {
		return memoryEntryCursorPayload{}, invalidMemoryEntryCursor()
	}
	var payload memoryEntryCursorPayload
	if json.Unmarshal(raw, &payload) != nil || payload.SortValue == "" || !validMemoryID(payload.ID) {
		return memoryEntryCursorPayload{}, invalidMemoryEntryCursor()
	}
	if payload.Sort != filters.Sort || payload.Dir != filters.SortDir || payload.FilterHash != hashMemoryEntryListFilters(filters) {
		return memoryEntryCursorPayload{}, invalidMemoryEntryCursor()
	}
	if _, parseErr := time.Parse(time.RFC3339Nano, payload.SortValue); parseErr != nil {
		if _, parseErr = time.Parse("2006-01-02T15:04:05.000000Z", payload.SortValue); parseErr != nil {
			return memoryEntryCursorPayload{}, invalidMemoryEntryCursor()
		}
	}
	return payload, nil
}

func invalidMemoryEntryCursor() error {
	return memoryFailure(400, "invalid_cursor", "Cursor is invalid")
}
