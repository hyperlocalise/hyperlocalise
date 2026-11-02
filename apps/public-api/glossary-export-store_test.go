package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGlossaryExportDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	glossaryID, conceptID := uuid.NewString(), uuid.NewString()
	f.exec(t, `INSERT INTO glossaries (id, organization_id, name, source_locale) VALUES ($1, $2, 'Exchange terms', 'en')`,
		glossaryID, f.actor.OrganizationID)
	f.exec(t, `INSERT INTO glossary_concepts (id, glossary_id, primary_term, definition) VALUES ($1, $2, 'Futures', 'Derivative contract')`,
		conceptID, glossaryID)
	f.exec(t, `INSERT INTO glossary_terms (glossary_id, concept_id, locale, term, source_term, target_term, forbidden)
		VALUES ($1, $2, 'en', 'Futures', 'Futures', 'Futures', false), ($1, $2, 'vi-VN', 'Hợp đồng tương lai', 'Futures', 'Hợp đồng tương lai', false),
			($1, $2, 'vi-VN', 'Tương lai', 'Futures', 'Tương lai', true)`, glossaryID, conceptID)

	file, err := f.store.exportGlossary(ctx, f.actor, glossaryID, "tbx")
	require.NoError(t, err)
	require.Equal(t, "Exchange-terms.tbx", file.Filename)
	body := string(file.Body)
	require.Contains(t, body, `xml:lang="en"`)
	require.Contains(t, body, "Hợp đồng tương lai")
	require.Contains(t, body, "Derivative contract")

	file, err = f.store.exportGlossary(ctx, f.actor, glossaryID, "csv")
	require.NoError(t, err)
	require.Contains(t, string(file.Body), "conceptId,termId,locale,term")
	require.Contains(t, string(file.Body), "Tương lai")

	file, err = f.store.exportGlossary(ctx, f.actor, glossaryID, "xlsx")
	require.NoError(t, err)
	require.Equal(t, "PK", string(file.Body[:2]))

	_, err = f.store.exportGlossary(ctx, f.actor, uuid.NewString(), "tbx")
	require.ErrorIs(t, err, errGlossaryNotFound)
}
