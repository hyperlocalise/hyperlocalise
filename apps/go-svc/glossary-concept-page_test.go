package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

type glossaryConceptPageResponse struct {
	Concepts   []glossaryConceptPageRow `json:"concepts"`
	NextCursor *string                  `json:"nextCursor"`
	Total      int                      `json:"total"`
	Pagination struct {
		Limit    int  `json:"limit"`
		Returned int  `json:"returned"`
		HasMore  bool `json:"hasMore"`
	} `json:"pagination"`
}

func decodeGlossaryConceptPage(t *testing.T, rec *httptest.ResponseRecorder) glossaryConceptPageResponse {
	t.Helper()
	var payload glossaryConceptPageResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	return payload
}

func TestGlossaryConceptPageFiltersAndSort(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
	checkout := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "Commerce", "Payment step")
	mustGlossaryTerm(t, scope, glossaryID, checkout, "en-US", "Checkout")
	frID := mustGlossaryTerm(t, scope, glossaryID, checkout, "fr-FR", "Paiement")
	_, err := scope.Pool.Exec(t.Context(), `update glossary_terms set part_of_speech='noun', gender='feminine', term_type='full form', created_by_user_id=$2 where id=$1`, frID, scope.UserID)
	require.NoError(t, err)

	cart := mustGlossaryConcept(t, scope, glossaryID, "Cart", "", "")
	mustGlossaryTerm(t, scope, glossaryID, cart, "en-US", "Cart")

	archived := mustGlossaryConcept(t, scope, glossaryID, "Archived", "", "")
	mustGlossaryTerm(t, scope, glossaryID, archived, "en-US", "Archived")
	_, err = scope.Pool.Exec(t.Context(), `update glossary_concepts set archived_at=now() where id=$1`, archived)
	require.NoError(t, err)

	base := scope.OrgPath("/glossaries/" + glossaryID + "/concepts/page")

	t.Run("search matches term text", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base+"?search="+url.QueryEscape("Paiement"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		page := decodeGlossaryConceptPage(t, rec)
		require.Equal(t, 1, page.Total)
		require.Equal(t, checkout, page.Concepts[0].ID)
	})

	t.Run("locale filter", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base+"?locale=fr-FR", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		page := decodeGlossaryConceptPage(t, rec)
		require.Equal(t, 1, page.Total)
		require.Equal(t, checkout, page.Concepts[0].ID)
	})

	t.Run("part of speech and author", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base+"?partOfSpeech=noun&createdByUserId="+scope.UserID, "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		page := decodeGlossaryConceptPage(t, rec)
		require.Equal(t, 1, page.Total)
		require.Equal(t, checkout, page.Concepts[0].ID)
	})

	t.Run("hides archived unless requested", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base, "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		page := decodeGlossaryConceptPage(t, rec)
		require.Equal(t, 2, page.Total)

		rec = glossaryRequest(api, scope, http.MethodGet, base+"?includeArchived=true", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		page = decodeGlossaryConceptPage(t, rec)
		require.Equal(t, 3, page.Total)
	})

	t.Run("sorts by primary term and pages", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base+"?sort=primary_term&sortDir=asc&limit=1", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		first := decodeGlossaryConceptPage(t, rec)
		require.True(t, first.Pagination.HasMore)
		require.Equal(t, "Cart", first.Concepts[0].PrimaryTerm)
		require.NotNil(t, first.NextCursor)

		rec = glossaryRequest(api, scope, http.MethodGet, base+"?sort=primary_term&sortDir=asc&limit=1&cursor="+url.QueryEscape(*first.NextCursor), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		second := decodeGlossaryConceptPage(t, rec)
		require.Equal(t, "Checkout", second.Concepts[0].PrimaryTerm)

		rec = glossaryRequest(api, scope, http.MethodGet, base+"?sort=primary_term&sortDir=desc&limit=1&cursor="+url.QueryEscape(*first.NextCursor), "")
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "invalid_glossary_concept_cursor")
	})

	t.Run("rejects unknown filters", func(t *testing.T) {
		rec := glossaryRequest(api, scope, http.MethodGet, base+"?partOfSpeech=nouns", "")
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "invalid_glossary_payload")
	})
}
