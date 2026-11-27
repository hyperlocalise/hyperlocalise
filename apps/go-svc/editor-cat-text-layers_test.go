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
}

func TestDecodeEditorCatVideoFramePNG(t *testing.T) {
	_, ok := decodeEditorCatVideoFramePNG("not-data-url")
	require.False(t, ok)
	_, ok = decodeEditorCatVideoFramePNG("data:image/png;base64," + strings.Repeat("AA", 20))
	require.False(t, ok)
}
