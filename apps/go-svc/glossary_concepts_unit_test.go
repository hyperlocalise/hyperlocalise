package main

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGlossaryEmptyToNilAndListConcepts(t *testing.T) {
	empty := ""
	require.Nil(t, emptyToNil(&empty))
	value := "  trimmed  "
	got := emptyToNil(&value)
	require.NotNil(t, got)
	require.Equal(t, "trimmed", *got)

	api := &glossaryAPI{pool: &scriptPool{}}
	out, status, err := api.listConcepts(context.Background(), glossaryRecord{ID: "g1", Source: "external_tms"})
	require.NoError(t, err)
	require.Equal(t, 200, status)
	require.Equal(t, 0, out.(map[string]any)["total"])

	now := time.Now().UTC()
	conceptID := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{conceptID, "g1", "Checkout", "", "Payment", true, "", nil, nil, now, now}},
		{op: opQuery, table: [][]any{}},
	}}
	api.pool = pool
	_, status, err = api.getConcept(context.Background(), glossaryRecord{ID: "g1", Source: "native", SourceLocale: "en-US"}, conceptID)
	require.NoError(t, err)
	require.Equal(t, 200, status)

	_, _, err = api.getConcept(context.Background(), glossaryRecord{ID: "g1", Source: "external_tms"}, conceptID)
	require.EqualError(t, err, "glossary_not_found")
}

func TestScanGlossaryConceptAndTerm(t *testing.T) {
	now := time.Now().UTC()
	url := "https://example.com"
	concept, err := scanGlossaryConcept(scriptScanRow{values: []any{
		uuid.NewString(), "g1", "Checkout", "Commerce", "Payment", true, "note", &url, nil, now, now,
	}})
	require.NoError(t, err)
	require.Equal(t, "Checkout", concept.PrimaryTerm)
	require.Empty(t, concept.Terms)

	term, err := scanGlossaryTerm(scriptScanRow{values: []any{
		uuid.NewString(), "g1", concept.ID, "en-US", "Checkout", "desc", "note", "noun", nil, nil, nil, nil, "preferred", false, false, "manual", "approved", now, now,
	}}, "en-US")
	require.NoError(t, err)
	require.True(t, term.IsPrimary)
}
