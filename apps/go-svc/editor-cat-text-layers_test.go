package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func editorCatTextLayersPath(scope *testenv.Scope, fileID string) string {
	return editorCatPathFor(scope, "/assets/"+url.PathEscape(fileID)+"/text-layers")
}

func mustEditorCatImageWithMetadata(t *testing.T, api *editorCatAPI, scope *testenv.Scope, projectID, filename, contentType string, body []byte, metadata map[string]any) string {
	t.Helper()
	fileID := mustEditorCatProjectAsset(t, api, scope, projectID, filename, contentType, body)
	encoded, err := json.Marshal(metadata)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `update stored_files set metadata=$2::jsonb, sha256='abc123' where id=$1`, fileID, string(encoded))
	require.NoError(t, err)
	return fileID
}

func TestEditorCatImageTextLayers(t *testing.T) {
	t.Run("GET returns stored layers", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		layers := editorCatImageTextLayers{
			Version: 1, SourceHash: "abc123", Revision: uuid.NewString(),
			ExtractedAt: "2026-01-01T00:00:00Z",
			Regions:     []editorCatImageTextRegion{{ID: "r1", Text: "Sale", Bounds: editorCatImageTextBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1}}},
		}
		raw, _ := json.Marshal(layers)
		fileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), map[string]any{"imageTextLayers": json.RawMessage(raw)})

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var resp struct {
			TextLayers editorCatImageTextLayers `json:"textLayers"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.NotNil(t, resp.TextLayers)
		require.Equal(t, "Sale", resp.TextLayers.Regions[0].Text)
	})

	t.Run("POST extracts when layers missing", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.objects = visualContextObjectRegistry(t)
		meter := &stubIrisMeter{features: true, tokens: true}
		text := &stubIrisText{reply: `{"language":"en","texts":[{"text":"Hello","bounds":{"x":0.1,"y":0.1,"width":0.2,"height":0.1}}]}`}
		api.ai = &irisGenerationAPI{text: text, meter: meter}
		png := []byte("png-bytes")
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "hero.png", "image/png", png)
		attachEditorCatAssetObject(t, api, scope, fileID, "hero.png", "image/png", png)
		_, err := scope.Pool.Exec(t.Context(), `update stored_files set sha256='abc123', metadata='{}'::jsonb where id=$1`, fileID)
		require.NoError(t, err)

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Hello")
	})

	t.Run("PATCH rejects stale revision", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		layers := editorCatImageTextLayers{
			Version: 1, SourceHash: "abc123", Revision: uuid.NewString(),
			ExtractedAt: "2026-01-01T00:00:00Z",
			Regions: []editorCatImageTextRegion{{
				ID: "r1", Text: "Sale",
				Bounds:       editorCatImageTextBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1},
				Translations: map[string]editorCatImageTextRegionTranslation{},
			}},
		}
		raw, _ := json.Marshal(layers)
		fileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), map[string]any{"imageTextLayers": json.RawMessage(raw)})

		body, _ := json.Marshal(layers)
		rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		rec = editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "text_layers_conflict")
	})

	t.Run("rejects unsupported image types", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "hero.gif", "image/gif", []byte("gif"))
		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "unsupported_image_type")
	})

	t.Run("lets members read layers but not extract or save", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		api.ai = &irisGenerationAPI{text: &stubIrisText{reply: `{"language":"en","texts":[{"text":"Hello","bounds":{"x":0.1,"y":0.1,"width":0.2,"height":0.1}}]}`}, meter: &stubIrisMeter{features: true, tokens: true}}
		layers := editorCatImageTextLayers{
			Version: 1, SourceHash: "abc123", Revision: uuid.NewString(),
			ExtractedAt: "2026-01-01T00:00:00Z",
			Regions:     []editorCatImageTextRegion{{ID: "r1", Text: "Sale", Bounds: editorCatImageTextBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1}}},
		}
		raw, _ := json.Marshal(layers)
		fileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), map[string]any{"imageTextLayers": json.RawMessage(raw)})

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatTextLayersPath(scope, fileID), "")
		requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")

		body, _ := json.Marshal(layers)
		rec = editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")
	})

	t.Run("hides a file from another workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		foreign, foreignScope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatProjectAsset(t, foreign, foreignScope, foreignScope.ProjectID, "hero.png", "image/png", []byte("png"))

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")
	})

	t.Run("rejects invalid region bounds", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		revision := uuid.NewString()
		layers := editorCatImageTextLayers{
			Version: 1, SourceHash: "abc123", Revision: revision,
			ExtractedAt: "2026-01-01T00:00:00Z",
			Regions:     []editorCatImageTextRegion{{ID: "r1", Text: "Sale", Bounds: editorCatImageTextBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1}}},
		}
		raw, _ := json.Marshal(layers)
		fileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), map[string]any{"imageTextLayers": json.RawMessage(raw)})

		layers.Regions[0].Bounds.Width = 0
		body, _ := json.Marshal(layers)
		rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_text_layers")
	})
}

func TestEditorCatImageTextLayersTargetBoxes(t *testing.T) {
	seed := func(t *testing.T) (*editorCatAPI, *testenv.Scope, string, editorCatImageTextLayers) {
		t.Helper()
		api, scope := editorCatTestAPI(t, "translator")
		layers := editorCatImageTextLayers{
			Version: 1, SourceHash: "abc123", Revision: uuid.NewString(),
			ExtractedAt: "2026-01-01T00:00:00Z",
			Regions: []editorCatImageTextRegion{{
				ID: "r1", Text: "Sale",
				Bounds:       editorCatImageTextBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1},
				Translations: map[string]editorCatImageTextRegionTranslation{"fr": {Text: "Soldes"}},
			}},
		}
		raw, _ := json.Marshal(layers)
		fileID := mustEditorCatImageWithMetadata(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"), map[string]any{"imageTextLayers": json.RawMessage(raw)})
		return api, scope, fileID, layers
	}

	t.Run("PATCH round-trips target box fields", func(t *testing.T) {
		api, scope, fileID, layers := seed(t)
		layers.Regions = append(layers.Regions, editorCatImageTextRegion{
			ID: "r2", Text: "",
			Bounds: editorCatImageTextBounds{X: 0.5, Y: 0.5, Width: 0.2, Height: 0.1},
			Translations: map[string]editorCatImageTextRegionTranslation{"fr": {
				Text: "Nouveau", Status: "detected", TargetText: "Nouveau",
				Bounds: &editorCatImageTextBounds{X: 0.5, Y: 0.5, Width: 0.2, Height: 0.1},
			}},
		})
		layers.Regions[0].Translations["fr"] = editorCatImageTextRegionTranslation{
			Text: "Soldes", Instructions: "Keep it bold",
			Bounds:     &editorCatImageTextBounds{X: 0.12, Y: 0.21, Width: 0.28, Height: 0.09},
			TargetText: "Solde", Status: "mismatch", TargetHash: "sha256:feedface",
		}
		body, _ := json.Marshal(layers)
		rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var resp struct {
			TextLayers editorCatImageTextLayers `json:"textLayers"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Len(t, resp.TextLayers.Regions, 2)
		require.Equal(t, layers.Regions[0].Translations["fr"], resp.TextLayers.Regions[0].Translations["fr"])
		require.Equal(t, "", resp.TextLayers.Regions[1].Text)
		require.Equal(t, layers.Regions[1].Translations["fr"], resp.TextLayers.Regions[1].Translations["fr"])
	})

	t.Run("rejects an unknown target status", func(t *testing.T) {
		api, scope, fileID, layers := seed(t)
		layers.Regions[0].Translations["fr"] = editorCatImageTextRegionTranslation{Text: "Soldes", Status: "done"}
		body, _ := json.Marshal(layers)
		rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatTextLayersPath(scope, fileID), string(body))
		requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_text_layers")
	})

	t.Run("loads layers without target fields", func(t *testing.T) {
		api, scope, fileID, _ := seed(t)
		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTextLayersPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"translations":{"fr":{"text":"Soldes","instructions":""}}`)
	})
}

func TestValidateEditorCatImageTextLayersTargetFields(t *testing.T) {
	base := func(translation editorCatImageTextRegionTranslation) *editorCatImageTextLayers {
		return &editorCatImageTextLayers{Regions: []editorCatImageTextRegion{{
			ID: "r1", Text: "Sale",
			Bounds:       editorCatImageTextBounds{X: 0.1, Y: 0.1, Width: 0.2, Height: 0.2},
			Translations: map[string]editorCatImageTextRegionTranslation{"fr": translation},
		}}}
	}
	valid := []editorCatImageTextRegionTranslation{
		{},
		{Status: "detected"},
		{Status: "queued"},
		{Status: "applied"},
		{Status: "verified"},
		{Status: "mismatch"},
		{Bounds: &editorCatImageTextBounds{X: 0, Y: 0, Width: 1, Height: 1}},
		{TargetText: strings.Repeat("a", editorCatTextLayerMaxTranslationLen), TargetHash: strings.Repeat("h", 128)},
	}
	for _, translation := range valid {
		require.NoError(t, validateEditorCatImageTextLayers(base(translation)), "%+v", translation)
	}
	invalid := []editorCatImageTextRegionTranslation{
		{Status: "approved"},
		{Bounds: &editorCatImageTextBounds{X: 0.1, Y: 0.1, Width: 0, Height: 0.1}},
		{Bounds: &editorCatImageTextBounds{X: -0.1, Y: 0.1, Width: 0.1, Height: 0.1}},
		{Bounds: &editorCatImageTextBounds{X: 0.9, Y: 0.1, Width: 0.2, Height: 0.1}},
		{Bounds: &editorCatImageTextBounds{X: 0.1, Y: 0.95, Width: 0.1, Height: 0.1}},
		{TargetText: strings.Repeat("a", editorCatTextLayerMaxTranslationLen+1)},
		{TargetHash: strings.Repeat("h", 129)},
	}
	for _, translation := range invalid {
		require.Error(t, validateEditorCatImageTextLayers(base(translation)), "%+v", translation)
	}
}

func TestEditorCatImageTextRegionTranslationOmitsEmptyTargetFields(t *testing.T) {
	encoded, err := json.Marshal(editorCatImageTextRegionTranslation{Text: "Soldes"})
	require.NoError(t, err)
	require.JSONEq(t, `{"text":"Soldes","instructions":""}`, string(encoded))
}

func TestDecodeEditorCatVideoFramePNG(t *testing.T) {
	_, ok := decodeEditorCatVideoFramePNG("not-data-url")
	require.False(t, ok)
	_, ok = decodeEditorCatVideoFramePNG("data:image/png;base64," + strings.Repeat("AA", 20))
	require.False(t, ok)
}
