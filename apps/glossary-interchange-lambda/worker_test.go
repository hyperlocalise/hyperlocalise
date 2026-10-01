package main

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func TestDecodeCSVReportsInvalidRows(t *testing.T) {
	csv := "conceptId,locale,term,primaryTerm,definition\n" +
		"c1,en-US,Hello,Greeting,Hi there\n" +
		"c2,,MissingLocale,Broken,\n" +
		",en-US,,,\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Len(t, concepts, 1)
	require.Equal(t, "c1", concepts[0].ID)
	require.Equal(t, "Hi there", concepts[0].Definition)
	require.Len(t, diagnostics, 2)
	require.Contains(t, diagnostics[0], "missing conceptId, locale, or term")
	require.Contains(t, diagnostics[1], "missing conceptId, locale, or term")
}

func TestDecodeCSVIgnoresBlankRows(t *testing.T) {
	csv := "conceptId,locale,term\n" +
		"c1,en-US,Hello\n" +
		",,\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Len(t, concepts, 1)
	require.Empty(t, diagnostics)
}

func TestDecodeXLSXReportsOrphanTerms(t *testing.T) {
	f := excelize.NewFile()
	require.NoError(t, f.SetSheetName(f.GetSheetName(0), "Concepts"))
	_, err := f.NewSheet("Terms")
	require.NoError(t, err)
	require.NoError(t, f.SetCellValue("Concepts", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Concepts", "B1", "primaryTerm"))
	require.NoError(t, f.SetCellValue("Concepts", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Concepts", "B2", "Alpha"))
	require.NoError(t, f.SetCellValue("Terms", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Terms", "B1", "locale"))
	require.NoError(t, f.SetCellValue("Terms", "C1", "term"))
	require.NoError(t, f.SetCellValue("Terms", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Terms", "B2", "en-US"))
	require.NoError(t, f.SetCellValue("Terms", "C2", "Alpha"))
	require.NoError(t, f.SetCellValue("Terms", "A3", "missing-concept"))
	require.NoError(t, f.SetCellValue("Terms", "B3", "en-US"))
	require.NoError(t, f.SetCellValue("Terms", "C3", "Orphan"))

	var buf bytes.Buffer
	require.NoError(t, f.Write(&buf))

	concepts, diagnostics, err := decodeDocument("xlsx", buf.Bytes())
	require.NoError(t, err)
	require.Len(t, concepts, 1)
	require.Len(t, concepts[0].Terms, 1)
	require.Equal(t, []string{`Terms sheet row 3 references unknown conceptId "missing-concept"`}, diagnostics)
}

func TestGlossaryTermBelongsToOtherConcept(t *testing.T) {
	require.True(t, glossaryTermBelongsToOtherConcept("concept-a", "concept-b"))
	require.False(t, glossaryTermBelongsToOtherConcept("concept-a", "concept-a"))
}

func TestDecodeCSVKeepsOmittedConceptFieldsUnset(t *testing.T) {
	csv := "conceptId,locale,term\n" +
		"c1,en-US,Checkout\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.Equal(t, "c1", concepts[0].ID)
	require.Equal(t, "Checkout", concepts[0].PrimaryTerm)
	require.False(t, concepts[0].Present.PrimaryTerm)
	require.False(t, concepts[0].Present.Subject)
	require.False(t, concepts[0].Present.Definition)
	require.False(t, concepts[0].Present.Translatable)
	require.False(t, concepts[0].Present.Note)
	require.False(t, concepts[0].Present.URL)
	require.False(t, concepts[0].Present.Figure)
}

func TestDecodeCSVMarksSuppliedConceptFieldsPresent(t *testing.T) {
	csv := "conceptId,locale,term,primaryTerm,subject,definition,translatable,conceptNote\n" +
		"c1,en-US,Checkout,Checkout,Commerce,Pay now,false,Keep this\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.True(t, concepts[0].Present.PrimaryTerm)
	require.True(t, concepts[0].Present.Subject)
	require.True(t, concepts[0].Present.Definition)
	require.True(t, concepts[0].Present.Translatable)
	require.True(t, concepts[0].Present.Note)
	require.False(t, concepts[0].Translatable)
	require.Equal(t, "Commerce", concepts[0].Subject)
}

func TestDecodeCSVMarksEmptyConceptFieldsPresent(t *testing.T) {
	csv := "conceptId,locale,term,primaryTerm,subject,definition,conceptNote,conceptUrl,figure\n" +
		"c1,en-US,Checkout,,,,,,\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.Equal(t, "Checkout", concepts[0].PrimaryTerm)
	require.False(t, concepts[0].Present.PrimaryTerm)
	require.True(t, concepts[0].Present.Subject)
	require.True(t, concepts[0].Present.Definition)
	require.True(t, concepts[0].Present.Note)
	require.True(t, concepts[0].Present.URL)
	require.True(t, concepts[0].Present.Figure)
	require.Empty(t, concepts[0].Subject)
	require.Empty(t, concepts[0].Definition)
	require.Empty(t, concepts[0].Note)
	require.Empty(t, concepts[0].URL)
	require.Empty(t, concepts[0].Figure)
}

func TestDecodeCSVKeepsConceptFieldsFromFirstTermRow(t *testing.T) {
	csv := "conceptId,locale,term,conceptUrl,figure\n" +
		"c1,en-US,Checkout,https://example.com/checkout,checkout.png\n" +
		"c1,fr-FR,Payer,,\n"

	concepts, diagnostics, err := decodeDocument("csv", []byte(csv))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.Len(t, concepts[0].Terms, 2)
	require.Equal(t, "https://example.com/checkout", concepts[0].URL)
	require.Equal(t, "checkout.png", concepts[0].Figure)
	require.True(t, concepts[0].Present.URL)
	require.True(t, concepts[0].Present.Figure)
}

func TestDecodeXLSXKeepsOmittedConceptFieldsUnset(t *testing.T) {
	f := excelize.NewFile()
	require.NoError(t, f.SetSheetName(f.GetSheetName(0), "Concepts"))
	_, err := f.NewSheet("Terms")
	require.NoError(t, err)
	require.NoError(t, f.SetCellValue("Concepts", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Concepts", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Terms", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Terms", "B1", "locale"))
	require.NoError(t, f.SetCellValue("Terms", "C1", "term"))
	require.NoError(t, f.SetCellValue("Terms", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Terms", "B2", "en-US"))
	require.NoError(t, f.SetCellValue("Terms", "C2", "Alpha"))

	var buf bytes.Buffer
	require.NoError(t, f.Write(&buf))

	concepts, diagnostics, err := decodeDocument("xlsx", buf.Bytes())
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.False(t, concepts[0].Present.PrimaryTerm)
	require.False(t, concepts[0].Present.Subject)
	require.False(t, concepts[0].Present.Definition)
	require.False(t, concepts[0].Present.Translatable)
	require.False(t, concepts[0].Present.Note)
}

func TestDecodeXLSXMarksEmptyConceptFieldsPresent(t *testing.T) {
	f := excelize.NewFile()
	require.NoError(t, f.SetSheetName(f.GetSheetName(0), "Concepts"))
	_, err := f.NewSheet("Terms")
	require.NoError(t, err)
	require.NoError(t, f.SetCellValue("Concepts", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Concepts", "B1", "primaryTerm"))
	require.NoError(t, f.SetCellValue("Concepts", "C1", "subject"))
	require.NoError(t, f.SetCellValue("Concepts", "D1", "definition"))
	require.NoError(t, f.SetCellValue("Concepts", "E1", "note"))
	require.NoError(t, f.SetCellValue("Concepts", "F1", "url"))
	require.NoError(t, f.SetCellValue("Concepts", "G1", "figure"))
	require.NoError(t, f.SetCellValue("Concepts", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Terms", "A1", "conceptId"))
	require.NoError(t, f.SetCellValue("Terms", "B1", "locale"))
	require.NoError(t, f.SetCellValue("Terms", "C1", "term"))
	require.NoError(t, f.SetCellValue("Terms", "A2", "concept-a"))
	require.NoError(t, f.SetCellValue("Terms", "B2", "en-US"))
	require.NoError(t, f.SetCellValue("Terms", "C2", "Alpha"))

	var buf bytes.Buffer
	require.NoError(t, f.Write(&buf))

	concepts, diagnostics, err := decodeDocument("xlsx", buf.Bytes())
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 1)
	require.False(t, concepts[0].Present.PrimaryTerm)
	require.True(t, concepts[0].Present.Subject)
	require.True(t, concepts[0].Present.Definition)
	require.True(t, concepts[0].Present.Note)
	require.True(t, concepts[0].Present.URL)
	require.True(t, concepts[0].Present.Figure)
	require.Empty(t, concepts[0].Subject)
	require.Empty(t, concepts[0].Definition)
	require.Empty(t, concepts[0].Note)
	require.Empty(t, concepts[0].URL)
	require.Empty(t, concepts[0].Figure)
}

func TestConceptMergeUpdateWritesOnlyPresentFields(t *testing.T) {
	query, args := conceptMergeUpdate("concept-1", interchangeConcept{
		PrimaryTerm:  "Derived",
		Subject:      "",
		Definition:   "",
		Translatable: true,
		Present: conceptFieldPresence{
			Definition: true,
		},
	})
	require.Equal(t, "update glossary_concepts set definition=$2,updated_at=now() where id=$1", query)
	require.Equal(t, []any{"concept-1", ""}, args)
}

func TestConceptMergeUpdateSkipsOmittedMetadata(t *testing.T) {
	query, args := conceptMergeUpdate("concept-1", interchangeConcept{
		PrimaryTerm:  "Checkout",
		Subject:      "",
		Definition:   "",
		Translatable: true,
	})
	require.Equal(t, "update glossary_concepts set updated_at=now() where id=$1", query)
	require.Equal(t, []any{"concept-1"}, args)
}
