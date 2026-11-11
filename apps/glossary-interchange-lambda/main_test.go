package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

const unreachableDatabaseURL = "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1"

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), unreachableDatabaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func sampleConcepts() []interchangeConcept {
	updated := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	return []interchangeConcept{
		{
			ID: "concept-1", PrimaryTerm: "Checkout", Subject: "Commerce", Definition: "=SUM(A1)", Note: "Concept note", URL: "https://example.com/c", Figure: "fig.png", Translatable: true, UpdatedAt: updated,
			Terms: []interchangeTerm{
				{ID: "term-1", Locale: "en-US", Term: "Checkout", Description: "Pay", Note: "+note", PartOfSpeech: "noun", Gender: "neuter", TermType: "fullForm", URL: "https://example.com/t", Lemma: "checkout", Status: "approved", Provenance: "manual", ReviewStatus: "approved", CaseSensitive: true, UpdatedAt: updated, CreatedByUserID: "user-a"},
				{ID: "term-2", Locale: "fr-FR", Term: "Paiement", Status: "draft", Forbidden: true, Gender: "masculine", UpdatedAt: updated},
			},
		},
		{
			ID: "concept-2", PrimaryTerm: "Cart", Translatable: false, UpdatedAt: updated.AddDate(0, 1, 0), CreatedByUserID: "user-b",
			Terms: []interchangeTerm{
				{ID: "term-3", Locale: "en_US", Term: "Cart", PartOfSpeech: "noun", TermType: "abbreviation", UpdatedAt: updated.AddDate(0, 1, 0)},
			},
		},
	}
}

func TestCSVFormulaEscapingRoundTrips(t *testing.T) {
	tests := []struct {
		value   string
		escaped string
	}{
		{value: "plain", escaped: "plain"},
		{value: "", escaped: ""},
		{value: "=SUM(A1)", escaped: csvFormulaEscapePrefix + "=SUM(A1)"},
		{value: "  +1", escaped: csvFormulaEscapePrefix + "  +1"},
		{value: "-minus", escaped: csvFormulaEscapePrefix + "-minus"},
		{value: "@mention", escaped: csvFormulaEscapePrefix + "@mention"},
		{value: csvFormulaEscapePrefix + "literal", escaped: csvFormulaEscapePrefix + csvFormulaEscapePrefix + "literal"},
	}
	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			require.Equal(t, tt.escaped, escapeCSVFormula(tt.value))
			require.Equal(t, tt.value, unescapeCSVFormula(tt.escaped))
		})
	}
	require.Equal(t, csvFormulaEscapePrefix+"safe", unescapeCSVFormula(csvFormulaEscapePrefix+"safe"))
}

func TestEncodeDocumentCSVRoundTrips(t *testing.T) {
	body, contentType, ext, err := encodeDocument("csv", sampleConcepts())
	require.NoError(t, err)
	require.Equal(t, "text/csv; charset=utf-8", contentType)
	require.Equal(t, "csv", ext)
	require.Contains(t, string(body), csvFormulaEscapePrefix+"=SUM(A1)")

	concepts, diagnostics, err := decodeDocument("csv", body)
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 2)
	require.Equal(t, "concept-1", concepts[0].ID)
	require.Equal(t, "=SUM(A1)", concepts[0].Definition)
	require.Equal(t, "Commerce", concepts[0].Subject)
	require.Equal(t, "https://example.com/c", concepts[0].URL)
	require.True(t, concepts[0].Translatable)
	require.False(t, concepts[1].Translatable)
	require.Len(t, concepts[0].Terms, 2)
	first := concepts[0].Terms[0]
	require.Equal(t, interchangeTerm{ID: "term-1", Locale: "en-US", Term: "Checkout", Description: "Pay", Note: "+note", PartOfSpeech: "noun", Gender: "neuter", TermType: "fullForm", URL: "https://example.com/t", Lemma: "checkout", Status: "approved", Provenance: "manual", ReviewStatus: "approved", CaseSensitive: true}, first)
	require.True(t, concepts[0].Terms[1].Forbidden)
	require.Equal(t, "en-US", concepts[1].Terms[0].Locale)
}

func TestEncodeDocumentXLSXRoundTrips(t *testing.T) {
	body, contentType, ext, err := encodeDocument("xlsx", sampleConcepts())
	require.NoError(t, err)
	require.Equal(t, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentType)
	require.Equal(t, "xlsx", ext)

	concepts, diagnostics, err := decodeDocument("xlsx", body)
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 2)
	require.Equal(t, "Checkout", concepts[0].PrimaryTerm)
	require.Equal(t, "fig.png", concepts[0].Figure)
	require.False(t, concepts[1].Translatable)
	require.True(t, concepts[1].Present.Translatable)
	require.Len(t, concepts[0].Terms, 2)
	require.Equal(t, "Paiement", concepts[0].Terms[1].Term)
	require.True(t, concepts[0].Terms[0].CaseSensitive)
	require.True(t, concepts[0].Terms[1].Forbidden)
	require.Equal(t, "en-US", concepts[1].Terms[0].Locale)
}

func TestDecodeXLSXRequiresSheets(t *testing.T) {
	_, _, err := decodeDocument("xlsx", []byte("not a workbook"))
	require.Error(t, err)

	f := excelize.NewFile()
	body, err := f.WriteToBuffer()
	require.NoError(t, err)
	_, _, err = decodeDocument("xlsx", body.Bytes())
	require.Error(t, err)

	f = excelize.NewFile()
	require.NoError(t, f.SetSheetName(f.GetSheetName(0), "Concepts"))
	require.NoError(t, f.SetSheetRow("Concepts", "A1", &[]any{"conceptId", "primaryTerm"}))
	require.NoError(t, f.SetSheetRow("Concepts", "A2", &[]any{"", "Orphan"}))
	_, err = f.NewSheet("Terms")
	require.NoError(t, err)
	require.NoError(t, f.SetSheetRow("Terms", "A1", &[]any{"conceptId", "locale", "term"}))
	body, err = f.WriteToBuffer()
	require.NoError(t, err)
	concepts, diagnostics, err := decodeDocument("xlsx", body.Bytes())
	require.NoError(t, err)
	require.Empty(t, concepts)
	require.Equal(t, []string{"Concepts sheet row 2 is missing conceptId"}, diagnostics)
}

func TestEncodeDocumentTBXRoundTrips(t *testing.T) {
	body, contentType, ext, err := encodeDocument("tbx", sampleConcepts())
	require.NoError(t, err)
	require.Equal(t, "application/xml; charset=utf-8", contentType)
	require.Equal(t, "tbx", ext)

	concepts, diagnostics, err := decodeDocument("tbx", body)
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 2)
	require.Equal(t, "concept-1", concepts[0].ID)
	require.Equal(t, "Commerce", concepts[0].Subject)
	byLocale := map[string]interchangeTerm{}
	for _, term := range concepts[0].Terms {
		byLocale[term.Locale] = term
	}
	require.Equal(t, "term-1", byLocale["en-US"].ID)
	require.Equal(t, "Checkout", byLocale["en-US"].Term)
	require.Equal(t, "Paiement", byLocale["fr-FR"].Term)
	require.True(t, byLocale["fr-FR"].Forbidden)

	empty, _, _, err := encodeDocument("tbx", nil)
	require.NoError(t, err)
	require.Contains(t, string(empty), "<martif>")
}

func TestDecodeCSVWithoutHeaderUsesPositionalColumns(t *testing.T) {
	concepts, diagnostics, err := decodeDocument("csv", []byte("c1,en,Hello\nc1,fr,Bonjour\n,de,Hallo\n"))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 2)
	require.Equal(t, "Hello", concepts[0].PrimaryTerm)
	require.Len(t, concepts[0].Terms, 2)
	require.Equal(t, "Hallo", concepts[1].ID)

	concepts, diagnostics, err = decodeDocument("csv", nil)
	require.NoError(t, err)
	require.Nil(t, concepts)
	require.Nil(t, diagnostics)

	_, _, err = decodeDocument("csv", []byte("a,\"b\n"))
	require.Error(t, err)
}

func TestFilterExportConcepts(t *testing.T) {
	concepts := sampleConcepts()
	require.Equal(t, concepts, filterExportConcepts(concepts, interchangeExportOptions{Scope: "all", Locales: []string{"fr-FR"}}))

	termIDs := func(filtered []interchangeConcept) []string {
		var ids []string
		for _, concept := range filtered {
			for _, term := range concept.Terms {
				ids = append(ids, term.ID)
			}
		}
		return ids
	}
	tests := []struct {
		name    string
		options interchangeExportOptions
		want    []string
	}{
		{name: "locales normalize underscores", options: interchangeExportOptions{Scope: "filtered", Locales: []string{"en_US"}}, want: []string{"term-1", "term-3"}},
		{name: "search concept fields", options: interchangeExportOptions{Scope: "filtered", Search: " COMMERCE "}, want: []string{"term-1", "term-2"}},
		{name: "search term fields", options: interchangeExportOptions{Scope: "filtered", Search: "paie"}, want: []string{"term-2"}},
		{name: "gender", options: interchangeExportOptions{Scope: "filtered", Gender: "masculine"}, want: []string{"term-2"}},
		{name: "part of speech", options: interchangeExportOptions{Scope: "filtered", PartOfSpeech: "noun"}, want: []string{"term-1", "term-3"}},
		{name: "term type", options: interchangeExportOptions{Scope: "filtered", TermType: "abbreviation"}, want: []string{"term-3"}},
		{name: "linguistic status", options: interchangeExportOptions{Scope: "filtered", LinguisticStatus: "approved"}, want: []string{"term-1"}},
		{name: "created by term or concept", options: interchangeExportOptions{Scope: "filtered", CreatedByUserID: "user-b"}, want: []string{"term-3"}},
		{name: "created by term", options: interchangeExportOptions{Scope: "filtered", CreatedByUserID: "user-a"}, want: []string{"term-1"}},
		{name: "modified after", options: interchangeExportOptions{ModifiedAfter: time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)}, want: []string{"term-3"}},
		{name: "no match", options: interchangeExportOptions{Scope: "filtered", Search: "missing"}, want: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, termIDs(filterExportConcepts(concepts, tt.options)))
		})
	}
}

func TestCountTerms(t *testing.T) {
	require.Equal(t, 3, countTerms(sampleConcepts()))
	require.Zero(t, countTerms(nil))
}

func TestHandleRequiresDatabase(t *testing.T) {
	_, err := (&glossaryInterchangeHandler{logger: discardLogger()}).Handle(context.Background(), events.SQSEvent{})
	require.EqualError(t, err, "database connection is not configured")
}

func TestHandleRejectsInvalidMessages(t *testing.T) {
	handler := &glossaryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "malformed", Body: `{`},
		{MessageId: "missing-run", Body: `{"schemaVersion":1,"operation":"import"}`},
		{MessageId: "unknown-operation", Body: `{"schemaVersion":1,"runId":"run-1","operation":"delete"}`},
		{MessageId: "missing-operation", Body: `{"schemaVersion":1,"runId":"run-1"}`},
		{MessageId: "unknown-version", Body: `{"schemaVersion":2,"runId":"run-1","operation":"import"}`},
		{MessageId: "missing-version", Body: `{"runId":"run-1","operation":"import"}`},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{
		{ItemIdentifier: "malformed"},
		{ItemIdentifier: "missing-run"},
		{ItemIdentifier: "unknown-operation"},
		{ItemIdentifier: "missing-operation"},
		{ItemIdentifier: "unknown-version"},
		{ItemIdentifier: "missing-version"},
	}, response.BatchItemFailures)

	response, err = handler.Handle(context.Background(), events.SQSEvent{})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestDecodeInterchangeMessage(t *testing.T) {
	var message interchangeMessage
	require.NoError(t, decodeInterchangeMessage(`{"schemaVersion":1,"runId":"run-1","operation":"export"}`, &message))
	require.Equal(t, interchangeMessage{SchemaVersion: 1, RunID: "run-1", Operation: "export"}, message)

	require.EqualError(t, decodeInterchangeMessage(`{`, &interchangeMessage{}), "invalid glossary interchange message")
	require.EqualError(t, decodeInterchangeMessage(`{"schemaVersion":2,"runId":"run-1","operation":"import"}`, &interchangeMessage{}), "unsupported glossary interchange message")
}

func TestPermanentGlossaryInterchangeFailureUnwraps(t *testing.T) {
	cause := errors.New("invalid workbook")
	err := fmt.Errorf("run: %w", permanentGlossaryInterchangeFailure(cause))
	require.ErrorIs(t, err, cause)
	require.True(t, isPermanentGlossaryInterchangeFailure(err))
	require.Equal(t, "run: invalid workbook", err.Error())
	require.False(t, isPermanentGlossaryInterchangeFailure(cause))
}

func TestSafeFailureMessageTrimsAndTruncates(t *testing.T) {
	require.Equal(t, "boom", safeFailureMessage(errors.New("  boom \n")))
	require.Len(t, safeFailureMessage(errors.New(strings.Repeat("x", 600))), 500)
}

func TestProcessRunReturnsClaimErrorsAsRetryable(t *testing.T) {
	err := processRun(context.Background(), unreachablePool(t), nil, interchangeMessage{SchemaVersion: 1, RunID: "a1b2c3d4-0000-4000-8000-000000000001", Operation: "import"})
	require.Error(t, err)
	require.False(t, isPermanentGlossaryInterchangeFailure(err))
}

func TestHandleReportsRetryableRunFailures(t *testing.T) {
	handler := &glossaryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{pool: unreachablePool(t)}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "import", Body: `{"schemaVersion":1,"runId":"a1b2c3d4-0000-4000-8000-000000000001","operation":"import"}`},
		{MessageId: "export", Body: `{"schemaVersion":1,"runId":"a1b2c3d4-0000-4000-8000-000000000002","operation":"export"}`},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "import"}, {ItemIdentifier: "export"}}, response.BatchItemFailures)
}

func TestDatabaseConnectionPoolLifecycle(t *testing.T) {
	pool := unreachablePool(t)
	got, err := (&databaseConnection{pool: pool}).currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)

	got, err = (&databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}, pool: pool, databaseURL: unreachableDatabaseURL}).currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)

	database := &databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}}
	_, err = database.currentPool(context.Background())
	require.ErrorContains(t, err, "database connection failed")
	require.Nil(t, database.pool)
}

func TestSummarizeDatabaseURLDefaultsAndInvalidInput(t *testing.T) {
	require.Equal(t, "postgres://db.internal:5432/app", summarizeDatabaseURL("postgres://user:secret@db.internal/app"))
	require.Equal(t, "invalid", summarizeDatabaseURL("::not a url"))
	require.Equal(t, "invalid", summarizeDatabaseURL("postgres:///app"))
}

func TestNewRegistryFromEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("OBJECT_STORAGE_S3_FILES_REGION", "eu-west-1")
	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "")

	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", " ")
	_, err := newRegistry(context.Background())
	require.EqualError(t, err, "OBJECT_STORAGE_S3_FILES_BUCKET is required")

	t.Setenv("OBJECT_STORAGE_S3_FILES_BUCKET", "glossaries")
	registry, err := newRegistry(context.Background())
	require.NoError(t, err)
	require.Equal(t, "s3-files", registry.DefaultLocationID())

	t.Setenv("OBJECT_STORAGE_S3_FILES_ENDPOINT", "http://insecure.example.com")
	_, err = newRegistry(context.Background())
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}
