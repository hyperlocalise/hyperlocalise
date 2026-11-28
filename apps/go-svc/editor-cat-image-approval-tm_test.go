package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type editorCatImageApprovalFixture struct {
	api          *editorCatAPI
	scope        *testenv.Scope
	memoryID     string
	sourceLocale string
}

// seedEditorCatImageApproval creates hero.png with a draft fr variant, a native
// memory attached to the project, and the given text layers on the source asset.
func seedEditorCatImageApproval(t *testing.T, layers *editorCatImageTextLayers) editorCatImageApprovalFixture {
	t.Helper()
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	metadata := map[string]any{}
	if layers != nil {
		raw, err := json.Marshal(layers)
		require.NoError(t, err)
		metadata["imageTextLayers"] = json.RawMessage(raw)
	}
	storedFileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), metadata)
	ctx := t.Context()
	_, err := scope.Pool.Exec(ctx, `
        insert into repository_source_file_versions (
            repository_source_file_id, organization_id, project_id, source_path, stored_file_id
        ) values ($1,$2,$3,'hero.png',$4)`,
		fileID, scope.OrganizationID, scope.ProjectID, storedFileID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status
        ) values ($1, $2, $3, 'hero.png', 'fr', 'draft')`,
		scope.OrganizationID, scope.ProjectID, fileID)
	require.NoError(t, err)
	var memoryID string
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        insert into memories (organization_id, created_by_user_id, name, description, source)
        values ($1, $2, 'Project TM', '', 'native') returning id::text`,
		scope.OrganizationID, scope.UserID).Scan(&memoryID))
	_, err = scope.Pool.Exec(ctx, `insert into project_memories (organization_id, project_id, memory_id, priority) values ($1,$2,$3,0)`,
		scope.OrganizationID, scope.ProjectID, memoryID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `update projects set source_locale='en-US' where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	return editorCatImageApprovalFixture{api: api, scope: scope, memoryID: memoryID, sourceLocale: "en-US"}
}

func editorCatApprovalLayers(sourceHash string, regions ...editorCatImageTextRegion) *editorCatImageTextLayers {
	return &editorCatImageTextLayers{
		Version: 1, SourceHash: sourceHash, Revision: uuid.NewString(),
		ExtractedAt: "2026-01-01T00:00:00Z", Regions: regions,
	}
}

func editorCatApprovalRegion(id, source, frTarget string) editorCatImageTextRegion {
	return editorCatImageTextRegion{
		ID: id, Text: source,
		Bounds:       editorCatImageTextBounds{X: 0.1, Y: 0.1, Width: 0.2, Height: 0.1},
		Translations: map[string]editorCatImageTextRegionTranslation{"fr": {Text: frTarget}},
	}
}

func (f editorCatImageApprovalFixture) setStatus(t *testing.T, status string) int {
	t.Helper()
	rec := editorCatRequestScope(f.api, f.scope, http.MethodPatch, editorCatPathFor(f.scope, "/files/detail/cat/images/status"),
		`{"sourcePath":"hero.png","targetLocale":"fr","status":"`+status+`"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ImageVariant struct {
			Status string `json:"status"`
		} `json:"imageVariant"`
		TMEntriesWritten *int `json:"tmEntriesWritten"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, status, body.ImageVariant.Status)
	require.NotNil(t, body.TMEntriesWritten, rec.Body.String())
	return *body.TMEntriesWritten
}

func (f editorCatImageApprovalFixture) memoryPairs(t *testing.T) map[string]string {
	t.Helper()
	rows, err := f.scope.Pool.Query(t.Context(), `
        select source_locale, target_locale, source_text, target_text, provenance, review_status
        from memory_entries where memory_id=$1`, f.memoryID)
	require.NoError(t, err)
	defer rows.Close()
	pairs := map[string]string{}
	for rows.Next() {
		var sourceLocale, targetLocale, sourceText, targetText, provenance, reviewStatus string
		require.NoError(t, rows.Scan(&sourceLocale, &targetLocale, &sourceText, &targetText, &provenance, &reviewStatus))
		require.Equal(t, f.sourceLocale, sourceLocale)
		require.Equal(t, "fr", targetLocale)
		require.Equal(t, "approved_job", provenance)
		require.Equal(t, "approved", reviewStatus)
		pairs[sourceText] = targetText
	}
	require.NoError(t, rows.Err())
	return pairs
}

func TestEditorCatImageApprovalWritesTM(t *testing.T) {
	t.Run("approving writes each region pair", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("abc123",
			editorCatApprovalRegion("r1", "Summer sale", "Soldes d'été"),
			editorCatApprovalRegion("r2", " Shop now ", " Acheter "),
		))
		require.Equal(t, 2, f.setStatus(t, "approved"))
		require.Equal(t, map[string]string{"Summer sale": "Soldes d'été", "Shop now": "Acheter"}, f.memoryPairs(t))
	})

	t.Run("skips regions with an empty source or target", func(t *testing.T) {
		missingLocale := editorCatApprovalRegion("r4", "Only English", "")
		missingLocale.Translations = map[string]editorCatImageTextRegionTranslation{"de": {Text: "Nur Deutsch"}}
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("abc123",
			editorCatApprovalRegion("r1", "Sale", "Soldes"),
			editorCatApprovalRegion("r2", "   ", "Nouveau"),
			editorCatApprovalRegion("r3", "Free shipping", "  "),
			missingLocale,
		))
		require.Equal(t, 1, f.setStatus(t, "approved"))
		require.Equal(t, map[string]string{"Sale": "Soldes"}, f.memoryPairs(t))
	})

	t.Run("writes duplicate pairs once", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("abc123",
			editorCatApprovalRegion("r1", "Sale", "Soldes"),
			editorCatApprovalRegion("r2", "Sale", "Soldes"),
			editorCatApprovalRegion("r3", " Sale", "Soldes "),
		))
		require.Equal(t, 1, f.setStatus(t, "approved"))
		require.Equal(t, map[string]string{"Sale": "Soldes"}, f.memoryPairs(t))
	})

	t.Run("rejecting writes nothing", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("abc123",
			editorCatApprovalRegion("r1", "Sale", "Soldes"),
		))
		require.Equal(t, 0, f.setStatus(t, "rejected"))
		require.Empty(t, f.memoryPairs(t))
	})

	t.Run("missing text layers write nothing and still approve", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, nil)
		require.Equal(t, 0, f.setStatus(t, "approved"))
		require.Empty(t, f.memoryPairs(t))
	})

	t.Run("stale text layers write nothing and still approve", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("older-source-hash",
			editorCatApprovalRegion("r1", "Sale", "Soldes"),
		))
		require.Equal(t, 0, f.setStatus(t, "approved"))
		require.Empty(t, f.memoryPairs(t))
	})

	t.Run("a TM write failure still approves", func(t *testing.T) {
		f := seedEditorCatImageApproval(t, editorCatApprovalLayers("abc123",
			editorCatApprovalRegion("r1", "Sale", "Soldes"),
		))
		// Fail inserts for this test's memory only, so parallel tests are unaffected.
		suffix := strings.ReplaceAll(f.memoryID, "-", "")
		fn, trigger := "fail_tm_"+suffix, "fail_tm_"+suffix
		_, err := f.scope.Pool.Exec(t.Context(), `create function `+fn+`() returns trigger language plpgsql as $$ begin raise exception 'tm write failed'; end $$`)
		require.NoError(t, err)
		_, err = f.scope.Pool.Exec(t.Context(), `create trigger `+trigger+` before insert on memory_entries for each row when (new.memory_id = '`+f.memoryID+`'::uuid) execute function `+fn+`()`)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, _ = f.scope.Pool.Exec(context.Background(), `drop trigger if exists `+trigger+` on memory_entries`)
			_, _ = f.scope.Pool.Exec(context.Background(), `drop function if exists `+fn+`()`)
		})
		require.Equal(t, 0, f.setStatus(t, "approved"))
		require.Empty(t, f.memoryPairs(t))
	})
}

func TestEditorCatImageApprovalPairs(t *testing.T) {
	layers := editorCatApprovalLayers("abc123",
		editorCatApprovalRegion("r1", "Sale", "Soldes"),
		editorCatApprovalRegion("r2", "Sale", "Soldes"),
		editorCatApprovalRegion("r3", "Sale", "Promo"),
		editorCatApprovalRegion("r4", "", "Vide"),
	)
	require.Equal(t, []editorCatImageApprovalPair{
		{regionID: "r1", sourceText: "Sale", targetText: "Soldes"},
		{regionID: "r3", sourceText: "Sale", targetText: "Promo"},
	}, editorCatImageApprovalPairs(layers, "fr"))
	require.Empty(t, editorCatImageApprovalPairs(layers, "de"))
}
