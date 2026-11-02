package main

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestMemoryInterchangeDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	memoryID := uuid.NewString()
	f.exec(t, `INSERT INTO memories (id, organization_id, name, source, status) VALUES ($1, $2, 'Product UI', 'native', 'active')`,
		memoryID, f.actor.OrganizationID)

	tmx := `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4"><header srclang="en" datatype="plaintext" segtype="sentence" adminlang="en" creationtool="test" creationtoolversion="1" o-tmf="test"/>
<body>
<tu tuid="home.title"><tuv xml:lang="en"><seg>Home</seg></tuv><tuv xml:lang="fr"><seg>Accueil</seg></tuv></tu>
<tu tuid="home.cta"><tuv xml:lang="en"><seg>Start</seg></tuv><tuv xml:lang="fr"><seg>Commencer</seg></tuv></tu>
</body></tmx>`
	result, err := f.store.importMemoryEntries(ctx, f.actor, memoryID, memoryImportInput{Format: "tmx", Content: tmx})
	require.NoError(t, err)
	require.Equal(t, 2, result.Created)
	require.Equal(t, 0, result.Updated)
	require.NotEmpty(t, result.ImportAttemptID)

	// The same tuid with corrected source text updates the unit in place.
	updatedTMX := strings.Replace(strings.Replace(tmx, "<seg>Home</seg>", "<seg>Home page</seg>", 1), "Accueil", "Page d'accueil", 1)
	result, err = f.store.importMemoryEntries(ctx, f.actor, memoryID, memoryImportInput{Format: "tmx", Content: updatedTMX})
	require.NoError(t, err)
	require.Equal(t, 0, result.Created)
	require.Equal(t, 2, result.Updated)

	var count int
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM memory_entries WHERE memory_id = $1`, memoryID).Scan(&count))
	require.Equal(t, 2, count)
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT count(*) FROM memory_import_attempts WHERE memory_id = $1`, memoryID).Scan(&count))
	require.Equal(t, 2, count)

	file, err := f.store.exportMemoryEntries(ctx, f.actor, memoryID, memoryExportQuery{Format: "tmx"})
	require.NoError(t, err)
	require.Equal(t, "Product-UI.tmx", file.Filename)
	require.Contains(t, string(file.Body), "Page d")
	require.Contains(t, string(file.Body), `tuid="tmx:home.title:fr"`)

	file, err = f.store.exportMemoryEntries(ctx, f.actor, memoryID, memoryExportQuery{Format: "csv", SourceLocale: "en", TargetLocale: "fr"})
	require.NoError(t, err)
	require.Equal(t, "Product-UI-en-fr.csv", file.Filename)
	require.Contains(t, string(file.Body), "en,fr,Start,Commencer,100")

	f.exec(t, `UPDATE memories SET status = 'archived' WHERE id = $1`, memoryID)
	_, err = f.store.importMemoryEntries(ctx, f.actor, memoryID, memoryImportInput{Format: "tmx", Content: tmx})
	require.ErrorIs(t, err, errMemoryArchived)
}
