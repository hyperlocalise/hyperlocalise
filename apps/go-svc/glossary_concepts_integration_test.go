package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGlossaryConceptCRUD(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
	base := scope.OrgPath("/glossaries/" + glossaryID + "/concepts")

	rec := glossaryRequest(api, scope, http.MethodPost, base, `{"primaryTerm":"Checkout","definition":"Payment step","terms":[{"locale":"fr-FR","term":"Paiement","status":"preferred"}]}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	concept := created["concept"].(map[string]any)
	conceptID := concept["id"].(string)
	terms := concept["terms"].([]any)
	require.NotEmpty(t, terms)
	termID := terms[0].(map[string]any)["id"].(string)

	rec = glossaryRequest(api, scope, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"total"`)

	rec = glossaryRequest(api, scope, http.MethodGet, base+"/"+conceptID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = glossaryRequest(api, scope, http.MethodPatch, base+"/"+conceptID, `{"subject":"Commerce","url":"  "}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = glossaryRequest(api, scope, http.MethodGet, base+"/"+conceptID+"/terms", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = glossaryRequest(api, scope, http.MethodPost, base+"/"+conceptID+"/terms", `{"locale":"de-DE","term":"Kasse","status":"preferred"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var termCreated map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &termCreated))
	deTermID := termCreated["term"].(map[string]any)["id"].(string)

	rec = glossaryRequest(api, scope, http.MethodPatch, base+"/"+conceptID+"/terms/"+termID, `{"term":"Checkout updated","description":"Primary label"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = glossaryRequest(api, scope, http.MethodDelete, base+"/"+conceptID+"/terms/"+deTermID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = glossaryRequest(api, scope, http.MethodDelete, base+"/"+conceptID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = glossaryRequest(api, scope, http.MethodGet, base+"/"+conceptID, "")
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGlossaryConceptValidationAndExternal(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "External", "en-US")
	_, err := scope.Pool.Exec(t.Context(), `update glossaries set source='external_tms' where id=$1`, glossaryID)
	require.NoError(t, err)
	base := scope.OrgPath("/glossaries/" + glossaryID + "/concepts")

	rec := glossaryRequest(api, scope, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"total":0`)

	rec = glossaryRequest(api, scope, http.MethodPost, base, `{"primaryTerm":"Term"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = glossaryRequest(api, scope, http.MethodGet, base+"/not-a-valid-id", "")
	require.Equal(t, http.StatusNotFound, rec.Code)

	nativeID := scope.MustGlossary(t, "", "Native", "en-US")
	nativeBase := scope.OrgPath("/glossaries/" + nativeID + "/concepts")
	rec = glossaryRequest(api, scope, http.MethodPatch, nativeBase+"/"+uuid.NewString(), `{"subject":"x"}`)
	require.Equal(t, http.StatusNotFound, rec.Code)

	existing := mustGlossaryConcept(t, scope, nativeID, "A", "", "")
	rec = glossaryRequest(api, scope, http.MethodPatch, scope.OrgPath("/glossaries/"+nativeID+"/concepts/"+existing), `{}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
