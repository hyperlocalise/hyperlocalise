package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func glossaryConceptDefaultFilters() glossaryConceptPageFilters {
	return glossaryConceptPageFilters{Sort: "updated_at", SortDir: "desc"}
}

func requireGlossaryFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *glossaryError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}

func TestParseGlossaryConceptPageFilters(t *testing.T) {
	filters, err := parseGlossaryConceptPageFilters(url.Values{})
	require.NoError(t, err)
	require.Equal(t, glossaryConceptDefaultFilters(), filters)

	trueValue := true
	filters, err = parseGlossaryConceptPageFilters(url.Values{
		"search":           {"  Checkout "},
		"locale":           {" fr_FR "},
		"reviewStatus":     {"proposed"},
		"termReviewStatus": {"approved"},
		"linguisticStatus": {"preferred"},
		"provenance":       {"manual"},
		"caseSensitive":    {"true"},
		"forbidden":        {"false"},
		"createdByUserId":  {strings.ToUpper(testGlossaryID)},
		"reviewedByUserId": {testGlossaryID},
		"importBatchId":    {testGlossaryID},
		"partOfSpeech":     {"noun"},
		"termType":         {"full form"},
		"gender":           {"feminine"},
		"modifiedFrom":     {"2026-01-01T00:00:00Z"},
		"modifiedTo":       {"2026-01-02T00:00:00.123456Z"},
		"includeArchived":  {"true"},
		"sort":             {"primary_term"},
		"sortDir":          {"ASC"},
	})
	require.NoError(t, err)
	require.Equal(t, glossaryConceptPageFilters{
		Search: "Checkout", Locale: "fr-FR", ReviewStatus: "proposed", TermReviewStatus: "approved",
		LinguisticStatus: "preferred", Provenance: "manual", CaseSensitive: &trueValue, Forbidden: boolPtr(false),
		CreatedByUserID: testGlossaryID, ReviewedByUserID: testGlossaryID, ImportBatchID: testGlossaryID,
		PartOfSpeech: "noun", TermType: "full form", Gender: "feminine",
		ModifiedFrom: "2026-01-01T00:00:00Z", ModifiedTo: "2026-01-02T00:00:00.123456Z",
		IncludeArchived: true, Sort: "primary_term", SortDir: "asc",
	}, filters)

	for name, query := range map[string]url.Values{
		"long search":      {"search": {strings.Repeat("a", 201)}},
		"review status":    {"reviewStatus": {"draft"}},
		"linguistic":       {"linguisticStatus": {"preferred_term"}},
		"provenance":       {"provenance": {"import"}},
		"case sensitive":   {"caseSensitive": {"yes"}},
		"forbidden":        {"forbidden": {"1"}},
		"created by":       {"createdByUserId": {"user_1"}},
		"reviewed by":      {"reviewedByUserId": {"reviewer"}},
		"import batch":     {"importBatchId": {"batch"}},
		"part of speech":   {"partOfSpeech": {"nouns"}},
		"term type":        {"termType": {"full_form"}},
		"gender":           {"gender": {"male"}},
		"sort":             {"sort": {"term"}},
		"sort dir":         {"sortDir": {"up"}},
		"include archived": {"includeArchived": {"maybe"}},
		"modified from":    {"modifiedFrom": {"2026-01-01"}},
		"inverted":         {"modifiedFrom": {"2026-01-02T00:00:00Z"}, "modifiedTo": {"2026-01-01T00:00:00Z"}},
	} {
		t.Run(name, func(t *testing.T) {
			_, parseErr := parseGlossaryConceptPageFilters(query)
			requireGlossaryFailure(t, parseErr, http.StatusBadRequest, "invalid_glossary_payload")
		})
	}
}

func TestGlossaryConceptPageWhere(t *testing.T) {
	where, args := glossaryConceptPageWhere(testGlossaryID, glossaryConceptDefaultFilters())
	require.Equal(t, `c.glossary_id=$1 and c.archived_at is null`, where)
	require.Equal(t, []any{testGlossaryID}, args)

	trueValue := true
	where, args = glossaryConceptPageWhere(testGlossaryID, glossaryConceptPageFilters{
		Locale: "fr-FR", ReviewStatus: "proposed", TermReviewStatus: "approved", LinguisticStatus: "preferred",
		Provenance: "manual", CaseSensitive: &trueValue, Forbidden: boolPtr(false), CreatedByUserID: testGlossaryID,
		PartOfSpeech: "noun", TermType: "phrase", Gender: "feminine", ModifiedFrom: "2026-01-01T00:00:00Z",
		ModifiedTo: "2026-01-02T00:00:00Z", IncludeArchived: true, Sort: "primary_term", SortDir: "asc",
		Search: "Checkout",
	})
	require.Equal(t, `c.glossary_id=$1`+
		` and c.review_status=$2`+
		` and c.updated_at>=$3::timestamptz`+
		` and c.updated_at<=$4::timestamptz`+
		` and exists (select 1 from glossary_terms t where t.concept_id=c.id and t.glossary_id=c.glossary_id`+
		` and t.locale=$5`+
		` and t.review_status=$6`+
		` and t.status=$7`+
		` and t.provenance=$8`+
		` and t.case_sensitive=$9`+
		` and t.forbidden=$10`+
		` and t.part_of_speech=$11`+
		` and t.term_type=$12`+
		` and t.gender=$13`+
		` and t.created_by_user_id=$14::uuid)`+
		` and (c.primary_term ilike $15 or c.subject ilike $16 or c.definition ilike $17 or c.note ilike $18`+
		` or exists (select 1 from glossary_terms t where t.concept_id=c.id and (t.term ilike $19 or t.description ilike $20 or t.note ilike $21 or t.metadata::text ilike $22 or t.search_vector @@ to_tsquery('simple', $23))))`, where)
	require.Equal(t, []any{
		testGlossaryID, "proposed", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z",
		"fr-FR", "approved", "preferred", "manual", true, false, "noun", "phrase", "feminine", testGlossaryID,
		"%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%",
		"%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "Checkout:*",
	}, args)
}

func TestGlossaryConceptSearchWhere(t *testing.T) {
	where, args := glossaryConceptSearchWhere("Checkout", 1)
	require.Equal(t, `c.primary_term ilike $2 or c.subject ilike $3 or c.definition ilike $4 or c.note ilike $5 or exists (select 1 from glossary_terms t where t.concept_id=c.id and (t.term ilike $6 or t.description ilike $7 or t.note ilike $8 or t.metadata::text ilike $9 or t.search_vector @@ to_tsquery('simple', $10)))`, where)
	require.Equal(t, []any{"%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "%Checkout%", "Checkout:*"}, args)

	mixed := "ABCDEF12-3456-4ABC-8DEF-0123456789AB"
	where, args = glossaryConceptSearchWhere(mixed, 0)
	require.Contains(t, where, `c.id=$5::uuid`)
	require.Equal(t, strings.ToLower(mixed), args[4])
}

func TestGlossaryConceptPageCursorRoundTrip(t *testing.T) {
	filters := glossaryConceptDefaultFilters()
	encoded := encodeGlossaryConceptPageCursor(filters, "2026-01-01T00:00:00.000000Z", testGlossaryID)
	payload, err := decodeGlossaryConceptPageCursor(encoded, filters)
	require.NoError(t, err)
	require.Equal(t, "updated_at", payload.Sort)
	require.Equal(t, "desc", payload.Dir)
	require.Equal(t, testGlossaryID, payload.ID)

	_, err = decodeGlossaryConceptPageCursor(encoded, glossaryConceptPageFilters{Sort: "primary_term", SortDir: "desc"})
	requireGlossaryFailure(t, err, http.StatusBadRequest, "invalid_glossary_concept_cursor")

	_, err = decodeGlossaryConceptPageCursor("not-a-cursor", filters)
	requireGlossaryFailure(t, err, http.StatusBadRequest, "invalid_glossary_concept_cursor")

	raw, _ := json.Marshal(glossaryConceptPageCursor{Sort: "updated_at", Dir: "desc", SortValue: "nope", ID: testGlossaryID, FilterHash: hashGlossaryConceptPageFilters(filters)})
	_, err = decodeGlossaryConceptPageCursor(base64.RawURLEncoding.EncodeToString(raw), filters)
	requireGlossaryFailure(t, err, http.StatusBadRequest, "invalid_glossary_concept_cursor")
}

func TestGlossaryPageDigestIncludesFilters(t *testing.T) {
	empty := httptestRequest("/concepts/page")
	filtered := httptestRequest("/concepts/page?search=Checkout&partOfSpeech=noun&locale=fr-FR")
	require.NotEqual(t, glossaryPageDigest(empty), glossaryPageDigest(filtered))
	require.Equal(t, glossaryPageDigest(filtered), glossaryPageDigest(httptestRequest("/concepts/page?locale=fr-FR&partOfSpeech=noun&search=Checkout")))
}

func httptestRequest(path string) *http.Request {
	req, err := http.NewRequest(http.MethodGet, path, nil)
	if err != nil {
		panic(err)
	}
	return req
}

func boolPtr(value bool) *bool { return &value }
