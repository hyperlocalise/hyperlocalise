package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func sampleGlossaryExportConcepts(n int) []glossaryExportConcept {
	now := testGlossaryTime
	concepts := make([]glossaryExportConcept, 0, n)
	for i := 0; i < n; i++ {
		id := fmt.Sprintf("cccccccc-cccc-4ccc-8ccc-%012d", i)
		termID := fmt.Sprintf("tttttttt-tttt-4ttt-8ttt-%012d", i)
		frTermID := fmt.Sprintf("ffffffff-ffff-4fff-8fff-%012d", i)
		primary := fmt.Sprintf("Term%04d", i)
		concepts = append(concepts, glossaryExportConcept{
			ID: id, PrimaryTerm: primary, Subject: "Subject", Definition: "Definition",
			Translatable: true, Note: "note", CreatedAt: now, UpdatedAt: now,
			Terms: []glossaryExportTerm{
				{
					ID: termID, ConceptID: id, Locale: "en-US", Term: primary,
					Status: "preferred", Provenance: "manual", ReviewStatus: "approved",
					CreatedAt: now, UpdatedAt: now,
				},
				{
					ID: frTermID, ConceptID: id, Locale: "fr-FR", Term: primary + "-fr",
					Status: "preferred", Provenance: "manual", ReviewStatus: "approved",
					CreatedAt: now, UpdatedAt: now,
				},
			},
		})
	}
	return concepts
}

func TestParseGlossaryCSV(t *testing.T) {
	content := "conceptId,locale,term,primaryTerm,subject,definition,status\n" +
		"c1,en-US,Checkout,Checkout,Commerce,Payment step,preferred\n" +
		"c1,fr-FR,Paiement,Checkout,Commerce,Payment step,preferred\n"
	concepts, diagnostics := parseGlossaryCSV(content)
	require.Len(t, concepts, 1)
	require.Equal(t, "Checkout", concepts[0].PrimaryTerm)
	require.Len(t, concepts[0].Terms, 2)
	require.Empty(t, diagnostics)
}

func TestParseGlossaryTBX(t *testing.T) {
	content := `<?xml version="1.0"?><tbx><text><body>
<conceptEntry id="c-abc">
  <descrip type="subjectField">Commerce</descrip>
  <descrip type="definition">Payment step</descrip>
  <langSec xml:lang="en-US"><termSec id="t-1"><term>Checkout</term></termSec></langSec>
  <langSec xml:lang="fr-FR"><termSec id="t-2"><term>Paiement</term></termSec></langSec>
</conceptEntry>
</body></text></tbx>`
	concepts, diagnostics := parseGlossaryTBX(content)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.Equal(t, "abc", concepts[0].ID)
	require.Equal(t, "Commerce", concepts[0].Subject)
	require.Equal(t, "Payment step", concepts[0].Definition)
	require.Equal(t, "Checkout", concepts[0].PrimaryTerm)
	require.Len(t, concepts[0].Terms, 2)
}

func TestParseGlossaryTBXInvalid(t *testing.T) {
	concepts, diagnostics := parseGlossaryTBX("<not-xml")
	require.Nil(t, concepts)
	require.NotEmpty(t, diagnostics)
	require.Equal(t, "invalid_tbx", diagnostics[0].Code)
}

func TestSerializeGlossaryFormatsRoundTrip(t *testing.T) {
	concepts := sampleGlossaryExportConcepts(3)
	g := glossaryRecord{ID: testGlossaryID, Name: "Product terms", SourceLocale: "en-US"}

	csvBody, err := serializeGlossaryCSV(concepts)
	require.NoError(t, err)
	require.Contains(t, string(csvBody), "conceptId")
	require.Contains(t, string(csvBody), "Term")
	parsed, _ := parseGlossaryCSV(string(csvBody))
	require.GreaterOrEqual(t, len(parsed), 1)

	tbxBody, err := serializeGlossaryTBX(g, concepts)
	require.NoError(t, err)
	require.Contains(t, string(tbxBody), "<tbx")
	require.Contains(t, string(tbxBody), "conceptEntry")
	tbxParsed, diagnostics := parseGlossaryTBX(string(tbxBody))
	require.Empty(t, diagnostics)
	require.Len(t, tbxParsed, 3)

	xlsxBody, err := serializeGlossaryXLSX(concepts)
	require.NoError(t, err)
	require.Greater(t, len(xlsxBody), 100)
	require.Equal(t, byte('P'), xlsxBody[0]) // ZIP/XLSX magic starts with PK
	require.Equal(t, byte('K'), xlsxBody[1])
}

func TestGlossaryExportSlug(t *testing.T) {
	require.Equal(t, "Product-terms", glossaryExportSlug("Product terms"))
	require.Equal(t, "glossary", glossaryExportSlug("@@@"))
}

func TestGlossaryPageCursorRoundTrip(t *testing.T) {
	cursor := encodeGlossaryPageCursor("2026-01-01T00:00:00.000000Z", testGlossaryID)
	updatedAt, id, err := decodeGlossaryPageCursor(cursor)
	require.NoError(t, err)
	require.Equal(t, "2026-01-01T00:00:00.000000Z", updatedAt)
	require.Equal(t, testGlossaryID, id)

	_, _, err = decodeGlossaryPageCursor("!!!")
	require.Error(t, err)
	_, _, err = decodeGlossaryPageCursor(encodeGlossaryPageCursor("only-one-part", ""))
	require.Error(t, err)
}

func TestSerializeGlossaryCSVEscapesFormulas(t *testing.T) {
	concepts := []glossaryExportConcept{{
		ID: "c1", PrimaryTerm: "=1+1", Subject: "+cmd", Definition: "@SUM(A1)",
		Note: "-1", CreatedAt: testGlossaryTime, UpdatedAt: testGlossaryTime,
		Terms: []glossaryExportTerm{{
			ID: "t1", ConceptID: "c1", Locale: "en-US", Term: "=HYPERLINK(\"x\")",
			Status: "draft", Provenance: "manual", ReviewStatus: "proposed",
			CreatedAt: testGlossaryTime, UpdatedAt: testGlossaryTime,
		}},
	}}
	body, err := serializeGlossaryCSV(concepts)
	require.NoError(t, err)
	csvText := string(body)
	require.Contains(t, csvText, glossaryCSVFormulaEscapePrefix+"=1+1")
	require.Contains(t, csvText, glossaryCSVFormulaEscapePrefix+"=HYPERLINK")
	parsed, diagnostics := parseGlossaryCSV(csvText)
	require.Empty(t, diagnostics)
	require.Len(t, parsed, 1)
	require.Equal(t, "=1+1", parsed[0].PrimaryTerm)
	require.Equal(t, "=HYPERLINK(\"x\")", parsed[0].Terms[0].Term)
}

func TestApplyGlossaryImportLocaleOptions(t *testing.T) {
	g := glossaryRecord{SourceLocale: "en-US", LocaleCoverage: []string{"fr-FR"}}
	strict := true
	payload := glossaryImportPayload{
		StrictLocale:  &strict,
		LocaleMapping: map[string]string{"fr": "fr-FR"},
	}
	concepts := []glossaryImportConcept{{
		ID: "c1", PrimaryTerm: "Checkout",
		Terms: []glossaryImportTerm{
			{ID: "t1", Locale: "en-US", Term: "Checkout"},
			{ID: "t2", Locale: "fr", Term: "Paiement"},
			{ID: "t3", Locale: "de", Term: "Kasse"},
		},
	}}
	out, diagnostics := applyGlossaryImportLocaleOptions(g, payload, concepts, nil)
	require.Len(t, out, 1)
	require.Len(t, out[0].Terms, 2)
	require.Equal(t, "fr-FR", out[0].Terms[1].Locale)
	require.NotEmpty(t, diagnostics)
	require.Equal(t, "unknown_locale", diagnostics[0].Code)
}

func TestGlossaryImportReplaceRejectsParserErrors(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	body := `{"format":"csv","content":"conceptId,locale,term\n,,","mode":"replace"}`
	rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries/"+id+"/concepts/import"), body)
	require.Equal(t, 400, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"diagnostics"`)
	require.Contains(t, rec.Body.String(), "invalid_csv_row")
	require.NotContains(t, rec.Body.String(), `"concepts"`)
}

func TestGlossaryExportTBXHTTP(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	concept := mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment step")
	mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/export?format=tbx"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "xml")
	require.Contains(t, rec.Body.String(), "<tbx")
	require.Contains(t, rec.Header().Get("Content-Disposition"), ".tbx")
}

func TestGlossaryExportXLSXHTTP(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	concept := mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment")
	mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/export?format=xlsx"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "spreadsheetml")
	require.Greater(t, rec.Body.Len(), 100)
}

func TestGlossaryImportXLSXStill501(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	body := `{"format":"xlsx","content":"AAAA","mode":"preview"}`
	rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries/"+id+"/concepts/import"), body)
	require.Equal(t, 501, rec.Code)
	require.Contains(t, rec.Body.String(), "not_implemented")
}

func TestGlossaryAuthorsAndHistory(t *testing.T) {
	t.Run("authors", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		_, err := scope.Pool.Exec(t.Context(), `update users set first_name='Ada', last_name='Lovelace' where id=$1`, scope.UserID)
		require.NoError(t, err)
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		mustGlossaryConcept(t, scope, id, "Checkout", "Commerce", "Payment")
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/concepts/authors"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"authors"`)
		require.Contains(t, rec.Body.String(), "Ada Lovelace")
	})
	t.Run("history", func(t *testing.T) {
		api, scope := glossaryTestAPI(t, "admin")
		id := scope.MustGlossary(t, "", "Product terms", "en-US")
		_, err := scope.Pool.Exec(t.Context(), `
            insert into glossary_history_events (
                organization_id, glossary_id, event_type, actor_kind, actor_user_id
            ) values ($1, $2, 'concept_created', 'user', $3)`,
			scope.OrganizationID, id, scope.UserID)
		require.NoError(t, err)
		rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/concepts/history"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"events"`)
		require.Contains(t, rec.Body.String(), "concept_created")
	})
}

func TestGlossaryImportReportGet(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	reportID := "ffffffff-ffff-4fff-8fff-ffffffffffff"
	_, err := scope.Pool.Exec(t.Context(), `
        insert into glossary_import_runs (
            id, organization_id, glossary_id, created_by_user_id, format, mode, status, counts, completed_at
        ) values ($1, $2, $3, $4, 'csv', 'preview', 'completed', '{"skipped":0}'::jsonb, now())`,
		reportID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/import-reports/"+reportID), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"report"`)
	require.Contains(t, rec.Body.String(), reportID)
}

func TestGlossaryInvalidExportFormat(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/export?format=pdf"), "")
	require.Equal(t, 400, rec.Code)
}

func TestGlossaryImportCounts(t *testing.T) {
	counts := glossaryImportCounts(
		[]glossaryImportConcept{{Terms: []glossaryImportTerm{{}, {}}}},
		[]glossaryImportDiagnostic{{Severity: "warning"}, {Severity: "error"}, {Severity: "info"}},
	)
	require.Equal(t, 1, counts["conceptsRead"])
	require.Equal(t, 2, counts["termsRead"])
	require.Equal(t, 1, counts["warned"])
	require.Equal(t, 1, counts["failed"])
}

func TestSampleExportConceptIDsAreStableShape(t *testing.T) {
	// Ensure helper IDs stay UUID-shaped for HTTP fixtures that reuse them.
	concepts := sampleGlossaryExportConcepts(1)
	require.Len(t, concepts[0].ID, 36)
	require.WithinDuration(t, testGlossaryTime, concepts[0].CreatedAt, time.Second)
}

func TestLookupImportGlossaryTermPrefersStableID(t *testing.T) {
	_, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
	conceptID := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "", "")
	termID := mustGlossaryTerm(t, scope, glossaryID, conceptID, "en-US", "Checkout")
	found, matchedByID, err := lookupImportGlossaryTerm(t.Context(), scope.Pool, glossaryID, conceptID, termID, "en-US", "Changed text")
	require.NoError(t, err)
	require.True(t, matchedByID)
	require.Equal(t, termID, found)
}

func TestLookupImportGlossaryTermFallsBackToLocaleText(t *testing.T) {
	_, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
	conceptID := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "", "")
	termID := mustGlossaryTerm(t, scope, glossaryID, conceptID, "en-US", "Checkout")
	missingID := "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
	found, matchedByID, err := lookupImportGlossaryTerm(t.Context(), scope.Pool, glossaryID, conceptID, missingID, "en-US", "Checkout")
	require.NoError(t, err)
	require.False(t, matchedByID)
	require.Equal(t, termID, found)
}

func TestLookupImportGlossaryTermDetectsCrossConceptConflict(t *testing.T) {
	_, scope := glossaryTestAPI(t, "admin")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en-US")
	conceptID := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "", "")
	other := mustGlossaryConcept(t, scope, glossaryID, "Other", "", "")
	termID := mustGlossaryTerm(t, scope, glossaryID, other, "en-US", "Checkout")
	_, _, err := lookupImportGlossaryTerm(t.Context(), scope.Pool, glossaryID, conceptID, termID, "en-US", "Checkout")
	require.Error(t, err)
	require.True(t, isGlossaryImportTermConflict(err))
}

func TestCreateGlossaryTermRequiresOwnedConcept(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	rec := glossaryRequest(api, scope, "POST", scope.OrgPath("/glossaries/"+id+"/concepts/"+testGlossaryConceptID+"/terms"), `{"locale":"en-US","term":"Checkout"}`)
	require.Equal(t, 404, rec.Code, rec.Body.String())
}

func TestGlossaryTermPageTotalRespectsLocaleFilter(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	concept := mustGlossaryConcept(t, scope, id, "Checkout", "", "")
	mustGlossaryTerm(t, scope, id, concept, "fr-FR", "Paiement")
	mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+"/concepts/"+concept+"/terms/page?locale=fr-FR"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"total":1`)
	require.Contains(t, rec.Body.String(), "Paiement")
}
