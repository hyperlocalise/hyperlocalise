package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEditorCatOrgFiles(t *testing.T) {
	t.Run("uploads and serves a markdown editor image", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		upload := editorCatMultipartScope(t, api, scope, http.MethodPost, "/v1/orgs/"+scope.Slug+"/files", nil, map[string][]byte{
			"file": []byte("png-bytes"),
		}, map[string]string{"file": "hero.png"})
		require.Equal(t, http.StatusCreated, upload.Code, upload.Body.String())
		require.Contains(t, upload.Body.String(), `"url":"/api/orgs/`)

		var parsed struct {
			File struct {
				ID string `json:"id"`
			} `json:"file"`
		}
		require.NoError(t, json.Unmarshal(upload.Body.Bytes(), &parsed))
		require.NotEmpty(t, parsed.File.ID)

		download := editorCatRequestScope(api, scope, http.MethodGet, "/v1/orgs/"+scope.Slug+"/files/"+parsed.File.ID, "")
		require.Equal(t, http.StatusOK, download.Code, download.Body.String())
		require.Equal(t, []byte("png-bytes"), download.Body.Bytes())
		require.Equal(t, "image/png", download.Header().Get("Content-Type"))
	})
}