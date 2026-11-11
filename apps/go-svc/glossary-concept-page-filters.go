package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"strings"
	"time"
)

type glossaryConceptPageFilters struct {
	Search           string
	Locale           string
	ReviewStatus     string
	TermReviewStatus string
	LinguisticStatus string
	Provenance       string
	CaseSensitive    *bool
	Forbidden        *bool
	CreatedByUserID  string
	ReviewedByUserID string
	ImportBatchID    string
	PartOfSpeech     string
	TermType         string
	Gender           string
	ModifiedFrom     string
	ModifiedTo       string
	IncludeArchived  bool
	Sort             string
	SortDir          string
}

type glossaryConceptPageCursor struct {
	Sort       string `json:"sort"`
	Dir        string `json:"dir"`
	SortValue  string `json:"sortValue"`
	ID         string `json:"id"`
	FilterHash string `json:"filterHash"`
}

type glossaryConceptPageFilterHash struct {
	Search           string `json:"search"`
	Locale           string `json:"locale"`
	ReviewStatus     string `json:"reviewStatus"`
	TermReviewStatus string `json:"termReviewStatus"`
	LinguisticStatus string `json:"linguisticStatus"`
	Provenance       string `json:"provenance"`
	CaseSensitive    string `json:"caseSensitive"`
	Forbidden        string `json:"forbidden"`
	CreatedByUserID  string `json:"createdByUserId"`
	ReviewedByUserID string `json:"reviewedByUserId"`
	ImportBatchID    string `json:"importBatchId"`
	PartOfSpeech     string `json:"partOfSpeech"`
	TermType         string `json:"termType"`
	Gender           string `json:"gender"`
	ModifiedFrom     string `json:"modifiedFrom"`
	ModifiedTo       string `json:"modifiedTo"`
	IncludeArchived  bool   `json:"includeArchived"`
	Sort             string `json:"sort"`
	SortDir          string `json:"sortDir"`
}

var (
	glossaryConceptReviewStatuses     = []string{"proposed", "approved", "rejected", "superseded"}
	glossaryConceptLinguisticStatuses = []string{"preferred", "admitted", "draft", "not_recommended", "obsolete"}
	glossaryConceptProvenances        = []string{"manual", "sync"}
	glossaryConceptPartsOfSpeech      = []string{
		"adjective", "adposition", "adverb", "auxiliary", "coordinating conjunction",
		"determiner", "interjection", "noun", "numeral", "particle", "pronoun",
		"proper noun", "subordinating conjunction", "verb", "other",
	}
	glossaryConceptTermTypes = []string{"full form", "acronym", "abbreviation", "short form", "phrase", "variant"}
	glossaryConceptGenders   = []string{"masculine", "feminine", "neuter", "other"}
	glossaryConceptSorts     = []string{"created_at", "updated_at", "primary_term"}
)

func parseGlossaryConceptPageFilters(query url.Values) (glossaryConceptPageFilters, error) {
	filters := glossaryConceptPageFilters{
		Search:           trimGlossaryInput(query.Get("search")),
		Locale:           strings.ReplaceAll(trimGlossaryInput(query.Get("locale")), "_", "-"),
		ReviewStatus:     trimGlossaryInput(query.Get("reviewStatus")),
		TermReviewStatus: trimGlossaryInput(query.Get("termReviewStatus")),
		LinguisticStatus: trimGlossaryInput(query.Get("linguisticStatus")),
		Provenance:       trimGlossaryInput(query.Get("provenance")),
		CreatedByUserID:  strings.ToLower(trimGlossaryInput(query.Get("createdByUserId"))),
		ReviewedByUserID: strings.ToLower(trimGlossaryInput(query.Get("reviewedByUserId"))),
		ImportBatchID:    strings.ToLower(trimGlossaryInput(query.Get("importBatchId"))),
		PartOfSpeech:     trimGlossaryInput(query.Get("partOfSpeech")),
		TermType:         trimGlossaryInput(query.Get("termType")),
		Gender:           trimGlossaryInput(query.Get("gender")),
		ModifiedFrom:     trimGlossaryInput(query.Get("modifiedFrom")),
		ModifiedTo:       trimGlossaryInput(query.Get("modifiedTo")),
		Sort:             trimGlossaryInput(query.Get("sort")),
		SortDir:          strings.ToLower(trimGlossaryInput(query.Get("sortDir"))),
	}
	if len(filters.Search) > 200 {
		return filters, invalidGlossary()
	}
	if filters.Locale != "" && utf16Length(filters.Locale) > 50 {
		return filters, invalidGlossary()
	}
	if filters.TermReviewStatus != "" && utf16Length(filters.TermReviewStatus) > 50 {
		return filters, invalidGlossary()
	}
	caseSensitive, err := parseGlossaryQueryBoolPtr(query.Get("caseSensitive"))
	if err != nil {
		return filters, err
	}
	filters.CaseSensitive = caseSensitive
	forbidden, err := parseGlossaryQueryBoolPtr(query.Get("forbidden"))
	if err != nil {
		return filters, err
	}
	filters.Forbidden = forbidden
	includeArchived, includeSet, err := parseGlossaryQueryBool(query.Get("includeArchived"))
	if err != nil {
		return filters, err
	}
	filters.IncludeArchived = includeSet && includeArchived
	if filters.CreatedByUserID != "" && !validGlossaryID(filters.CreatedByUserID) {
		return filters, invalidGlossary()
	}
	if filters.ReviewedByUserID != "" && !validGlossaryID(filters.ReviewedByUserID) {
		return filters, invalidGlossary()
	}
	if filters.ImportBatchID != "" && !validGlossaryID(filters.ImportBatchID) {
		return filters, invalidGlossary()
	}
	if err := glossaryQueryOneOf(filters.ReviewStatus, glossaryConceptReviewStatuses); err != nil {
		return filters, err
	}
	if err := glossaryQueryOneOf(filters.LinguisticStatus, glossaryConceptLinguisticStatuses); err != nil {
		return filters, err
	}
	if err := glossaryQueryOneOf(filters.Provenance, glossaryConceptProvenances); err != nil {
		return filters, err
	}
	if err := glossaryQueryOneOf(filters.PartOfSpeech, glossaryConceptPartsOfSpeech); err != nil {
		return filters, err
	}
	if err := glossaryQueryOneOf(filters.TermType, glossaryConceptTermTypes); err != nil {
		return filters, err
	}
	if err := glossaryQueryOneOf(filters.Gender, glossaryConceptGenders); err != nil {
		return filters, err
	}
	if filters.Sort == "" {
		filters.Sort = "updated_at"
	}
	if err := glossaryQueryOneOf(filters.Sort, glossaryConceptSorts); err != nil {
		return filters, err
	}
	if filters.SortDir == "" {
		filters.SortDir = "desc"
	}
	if filters.SortDir != "asc" && filters.SortDir != "desc" {
		return filters, invalidGlossary()
	}
	modifiedFrom, ok := parseMemoryEntryListTime(filters.ModifiedFrom)
	if !ok {
		return filters, invalidGlossary()
	}
	modifiedTo, ok := parseMemoryEntryListTime(filters.ModifiedTo)
	if !ok {
		return filters, invalidGlossary()
	}
	if !modifiedFrom.IsZero() && !modifiedTo.IsZero() && modifiedFrom.After(modifiedTo) {
		return filters, invalidGlossary()
	}
	return filters, nil
}

func parseGlossaryQueryBool(raw string) (value bool, set bool, err error) {
	raw = strings.ToLower(trimGlossaryInput(raw))
	if raw == "" {
		return false, false, nil
	}
	if raw == "true" {
		return true, true, nil
	}
	if raw == "false" {
		return false, true, nil
	}
	return false, false, invalidGlossary()
}

func parseGlossaryQueryBoolPtr(raw string) (*bool, error) {
	value, set, err := parseGlossaryQueryBool(raw)
	if err != nil || !set {
		return nil, err
	}
	return &value, nil
}

func glossaryQueryOneOf(value string, allowed []string) error {
	if value == "" {
		return nil
	}
	for _, item := range allowed {
		if value == item {
			return nil
		}
	}
	return invalidGlossary()
}

func (filters glossaryConceptPageFilters) hasTermPredicate() bool {
	return filters.Locale != "" ||
		filters.TermReviewStatus != "" ||
		filters.LinguisticStatus != "" ||
		filters.Provenance != "" ||
		filters.CaseSensitive != nil ||
		filters.Forbidden != nil ||
		filters.PartOfSpeech != "" ||
		filters.TermType != "" ||
		filters.Gender != "" ||
		filters.CreatedByUserID != "" ||
		filters.ReviewedByUserID != "" ||
		filters.ImportBatchID != ""
}

func glossaryConceptPageWhere(glossaryID string, filters glossaryConceptPageFilters) (string, []any) {
	where := `c.glossary_id=$1`
	args := []any{glossaryID}
	add := func(clause string, value any) {
		args = append(args, value)
		where += ` and ` + strings.ReplaceAll(clause, "?", "$"+itoa(len(args)))
	}
	if !filters.IncludeArchived {
		where += ` and c.archived_at is null`
	}
	if filters.ReviewStatus != "" {
		add(`c.review_status=?`, filters.ReviewStatus)
	}
	if filters.ModifiedFrom != "" {
		add(`c.updated_at>=?::timestamptz`, filters.ModifiedFrom)
	}
	if filters.ModifiedTo != "" {
		add(`c.updated_at<=?::timestamptz`, filters.ModifiedTo)
	}
	if filters.hasTermPredicate() {
		termWhere, termArgs := glossaryConceptTermExists(filters, len(args))
		where += ` and exists (select 1 from glossary_terms t where ` + termWhere + `)`
		args = append(args, termArgs...)
	}
	if filters.Search != "" {
		searchWhere, searchArgs := glossaryConceptSearchWhere(filters.Search, len(args))
		if searchWhere != "" {
			where += ` and (` + searchWhere + `)`
			args = append(args, searchArgs...)
		}
	}
	return where, args
}

func glossaryConceptTermExists(filters glossaryConceptPageFilters, argOffset int) (string, []any) {
	where := `t.concept_id=c.id and t.glossary_id=c.glossary_id`
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		where += ` and ` + strings.ReplaceAll(clause, "?", "$"+itoa(argOffset+len(args)))
	}
	if filters.Locale != "" {
		add(`t.locale=?`, filters.Locale)
	}
	if filters.TermReviewStatus != "" {
		add(`t.review_status=?`, filters.TermReviewStatus)
	}
	if filters.LinguisticStatus != "" {
		add(`t.status=?`, filters.LinguisticStatus)
	}
	if filters.Provenance != "" {
		add(`t.provenance=?`, filters.Provenance)
	}
	if filters.CaseSensitive != nil {
		add(`t.case_sensitive=?`, *filters.CaseSensitive)
	}
	if filters.Forbidden != nil {
		add(`t.forbidden=?`, *filters.Forbidden)
	}
	if filters.PartOfSpeech != "" {
		add(`t.part_of_speech=?`, filters.PartOfSpeech)
	}
	if filters.TermType != "" {
		add(`t.term_type=?`, filters.TermType)
	}
	if filters.Gender != "" {
		add(`t.gender=?`, filters.Gender)
	}
	if filters.CreatedByUserID != "" {
		add(`t.created_by_user_id=?::uuid`, filters.CreatedByUserID)
	}
	if filters.ReviewedByUserID != "" {
		add(`t.reviewed_by_user_id=?::uuid`, filters.ReviewedByUserID)
	}
	if filters.ImportBatchID != "" {
		add(`t.import_batch_id=?::uuid`, filters.ImportBatchID)
	}
	return where, args
}

func glossaryConceptSearchWhere(search string, argOffset int) (string, []any) {
	clauses := []string{}
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		clauses = append(clauses, strings.ReplaceAll(clause, "?", "$"+itoa(argOffset+len(args))))
	}
	pattern := "%" + search + "%"
	add(`c.primary_term ilike ?`, pattern)
	add(`c.subject ilike ?`, pattern)
	add(`c.definition ilike ?`, pattern)
	add(`c.note ilike ?`, pattern)
	if validGlossaryID(strings.ToLower(search)) {
		add(`c.id=?::uuid`, strings.ToLower(search))
	}
	termClauses := []string{`t.term ilike ?`, `t.description ilike ?`, `t.note ilike ?`, `t.metadata::text ilike ?`}
	termArgs := []any{pattern, pattern, pattern, pattern}
	if tsQuery := buildMemoryEntryTsQuery(search); tsQuery != "" {
		termClauses = append(termClauses, `t.search_vector @@ to_tsquery('simple', ?)`)
		termArgs = append(termArgs, tsQuery)
	}
	rewritten := `t.concept_id=c.id and (` + strings.Join(termClauses, " or ") + `)`
	for _, value := range termArgs {
		args = append(args, value)
		rewritten = strings.Replace(rewritten, "?", "$"+itoa(argOffset+len(args)), 1)
	}
	clauses = append(clauses, `exists (select 1 from glossary_terms t where `+rewritten+`)`)
	return strings.Join(clauses, " or "), args
}

func glossaryConceptSortColumn(sort string) string {
	switch sort {
	case "created_at":
		return "c.created_at"
	case "primary_term":
		return "c.primary_term"
	default:
		return "c.updated_at"
	}
}

func glossaryConceptSortSelect(sort string) string {
	if sort == "primary_term" {
		return "c.primary_term"
	}
	return `to_char(` + glossaryConceptSortColumn(sort) + ` at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

func glossaryConceptCursorCast(sort string) string {
	if sort == "primary_term" {
		return ""
	}
	return "::timestamptz"
}

func optionalBoolString(value *bool) string {
	if value == nil {
		return ""
	}
	if *value {
		return "true"
	}
	return "false"
}

func hashGlossaryConceptPageFilters(filters glossaryConceptPageFilters) string {
	payload, _ := json.Marshal(glossaryConceptPageFilterHash{
		Search:           filters.Search,
		Locale:           filters.Locale,
		ReviewStatus:     filters.ReviewStatus,
		TermReviewStatus: filters.TermReviewStatus,
		LinguisticStatus: filters.LinguisticStatus,
		Provenance:       filters.Provenance,
		CaseSensitive:    optionalBoolString(filters.CaseSensitive),
		Forbidden:        optionalBoolString(filters.Forbidden),
		CreatedByUserID:  filters.CreatedByUserID,
		ReviewedByUserID: filters.ReviewedByUserID,
		ImportBatchID:    filters.ImportBatchID,
		PartOfSpeech:     filters.PartOfSpeech,
		TermType:         filters.TermType,
		Gender:           filters.Gender,
		ModifiedFrom:     filters.ModifiedFrom,
		ModifiedTo:       filters.ModifiedTo,
		IncludeArchived:  filters.IncludeArchived,
		Sort:             filters.Sort,
		SortDir:          filters.SortDir,
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])[:16]
}

func encodeGlossaryConceptPageCursor(filters glossaryConceptPageFilters, sortValue, id string) string {
	raw, _ := json.Marshal(glossaryConceptPageCursor{
		Sort:       filters.Sort,
		Dir:        filters.SortDir,
		SortValue:  sortValue,
		ID:         id,
		FilterHash: hashGlossaryConceptPageFilters(filters),
	})
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeGlossaryConceptPageCursor(cursor string, filters glossaryConceptPageFilters) (glossaryConceptPageCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		raw, err = base64.URLEncoding.DecodeString(cursor)
	}
	if err != nil {
		return glossaryConceptPageCursor{}, invalidGlossaryConceptCursor()
	}
	var payload glossaryConceptPageCursor
	if json.Unmarshal(raw, &payload) != nil || payload.SortValue == "" || !validGlossaryID(payload.ID) {
		return glossaryConceptPageCursor{}, invalidGlossaryConceptCursor()
	}
	if payload.Sort != filters.Sort || payload.Dir != filters.SortDir || payload.FilterHash != hashGlossaryConceptPageFilters(filters) {
		return glossaryConceptPageCursor{}, invalidGlossaryConceptCursor()
	}
	if filters.Sort != "primary_term" {
		if _, parseErr := time.Parse(time.RFC3339Nano, payload.SortValue); parseErr != nil {
			if _, parseErr = time.Parse("2006-01-02T15:04:05.000000Z", payload.SortValue); parseErr != nil {
				return glossaryConceptPageCursor{}, invalidGlossaryConceptCursor()
			}
		}
	}
	return payload, nil
}

func invalidGlossaryConceptCursor() error {
	return glossaryFailure(400, "invalid_glossary_concept_cursor", "Glossary concept cursor is invalid")
}
