package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func editorCatVideoFramePath(scope *testenv.Scope, fileID string) string {
	return editorCatPathFor(scope, "/assets/"+url.PathEscape(fileID)+"/frame-text")
}

func editorCatVideoFrameJSON(t *testing.T, png []byte) string {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"timestamp": 1.25,
		"frame":     "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
	})
	require.NoError(t, err)
	return string(payload)
}

func TestEditorCatVideoFrameText(t *testing.T) {
	t.Run("extracts frame text and charges usage", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		meter := &stubIrisMeter{features: true, tokens: true}
		text := &stubIrisText{reply: `{"language":"en","texts":[{"text":"Sale","bounds":{"x":0.1,"y":0.1,"width":0.2,"height":0.1}}]}`}
		api.ai = &irisGenerationAPI{text: text, meter: meter, pool: api.pool}
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "clip.mp4", "video/mp4", []byte("mp4"))
		png := mustVisualContextPNG(t, 8, 8)

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatVideoFramePath(scope, fileID), editorCatVideoFrameJSON(t, png))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Sale")
		require.Len(t, meter.tokenTracks, 1)
		track := meter.tokenTracks[0]
		require.Equal(t, scope.OrganizationID, track.CustomerID)
		require.Equal(t, autumn.AITokens, track.FeatureID)
		require.Equal(t, "video_frame_text_extraction", track.Properties["feature"])
		require.Equal(t, scope.ProjectID, track.Properties["project_id"])
		require.Equal(t, fileID, track.Properties["file_id"])

		var source, operationKey string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select source, operation_key
              from usage_events
             where organization_id = $1 and source = 'image_text_extraction'
             order by created_at desc
             limit 1`, scope.OrganizationID).Scan(&source, &operationKey))
		require.Equal(t, "image_text_extraction", source)
		require.Contains(t, operationKey, "editor-cat-video-frame-text:")
	})

	t.Run("forbids roles that cannot edit", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: true, tokens: true}}
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "clip.mp4", "video/mp4", []byte("mp4"))
		png := mustVisualContextPNG(t, 8, 8)

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatVideoFramePath(scope, fileID), editorCatVideoFrameJSON(t, png))
		requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")
	})

	t.Run("rejects invalid frames and non-video files", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: true, tokens: true}}
		videoID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "clip.mp4", "video/mp4", []byte("mp4"))
		imageID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"))

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatVideoFramePath(scope, videoID), `{"timestamp":1,"frame":"not-a-data-url"}`)
		requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_video_frame")

		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatVideoFramePath(scope, imageID), editorCatVideoFrameJSON(t, mustVisualContextPNG(t, 8, 8)))
		requireEditorCatError(t, rec, http.StatusBadRequest, "unsupported_video_type")
	})

	t.Run("hides a file from another workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: true, tokens: true}}
		foreign, foreignScope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatProjectAsset(t, foreign, foreignScope, foreignScope.ProjectID, "clip.mp4", "video/mp4", []byte("mp4"))

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatVideoFramePath(scope, fileID), editorCatVideoFrameJSON(t, mustVisualContextPNG(t, 8, 8)))
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")
	})
}
