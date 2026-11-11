package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func figmaVisualContextRequest(t *testing.T, api *editorCatAPI, token string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	body, err := json.Marshal(payload)
	require.NoError(t, err)
	mux := http.NewServeMux()
	api.registerInternal(mux)
	req := httptest.NewRequest(http.MethodPost, "/internal/figma/visual-context/sync", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	if token == "" {
		token = serverCallToken()
	}
	req.Header.Set(serverCallTokenHeader, token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func figmaSyncPayload(orgID, projectID, nodeID string, pngBytes []byte, bindings []figmaVisualContextBinding) figmaVisualContextSyncPayload {
	name := "Checkout frame"
	return figmaVisualContextSyncPayload{
		OrganizationID: orgID,
		ProjectID:      projectID,
		FileKey:        "FILEKEY123",
		NodeID:         nodeID,
		Name:           &name,
		FigmaURL:       "https://www.figma.com/design/FILEKEY123/App?node-id=" + strings.ReplaceAll(nodeID, ":", "-"),
		ContentType:    "image/png",
		ImageBase64:    base64.StdEncoding.EncodeToString(pngBytes),
		Bindings:       bindings,
	}
}

func TestFigmaVisualContextSyncRejectsMissingToken(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	rec := figmaVisualContextRequest(t, api, "wrong", figmaSyncPayload(scope.OrganizationID, scope.ProjectID, "1:2", mustVisualContextPNG(t, 2, 2), nil))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestFigmaVisualContextSyncBindsAndReplacesFrame(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	checkoutID := mustEditorCatKey(t, scope, fileID, "checkout.title", "Checkout")
	payID := mustEditorCatKey(t, scope, fileID, "checkout.pay", "Pay now")

	first := figmaVisualContextRequest(t, api, "", figmaSyncPayload(scope.OrganizationID, scope.ProjectID, "1:2", mustVisualContextPNG(t, 4, 4), []figmaVisualContextBinding{
		{TranslationKeyID: checkoutID, Marker: &editorCatVisualContextMarker{Left: 10, Top: 10, Width: 50, Height: 10}},
		{TranslationKeyID: payID},
	}))
	require.Equal(t, http.StatusOK, first.Code, first.Body.String())
	var firstBody struct {
		VisualContext figmaVisualContextSyncResult `json:"visualContext"`
	}
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &firstBody))
	require.Equal(t, 2, firstBody.VisualContext.BoundCount)
	require.False(t, firstBody.VisualContext.ReplacedFrame)

	second := figmaVisualContextRequest(t, api, "", figmaSyncPayload(scope.OrganizationID, scope.ProjectID, "1:2", mustVisualContextPNG(t, 6, 6), []figmaVisualContextBinding{
		{TranslationKeyID: checkoutID, Marker: &editorCatVisualContextMarker{Left: 20, Top: 20, Width: 40, Height: 10}},
	}))
	require.Equal(t, http.StatusOK, second.Code, second.Body.String())
	var secondBody struct {
		VisualContext figmaVisualContextSyncResult `json:"visualContext"`
	}
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &secondBody))
	require.True(t, secondBody.VisualContext.ReplacedFrame)

	var screenshots int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select count(*) from project_visual_context_screenshots where project_id=$1 and figma_node_id='1:2'`,
		scope.ProjectID).Scan(&screenshots))
	require.Equal(t, 1, screenshots)

	lookup := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+checkoutID+`"}`)
	require.Equal(t, http.StatusOK, lookup.Code, lookup.Body.String())
	var body struct {
		VisualContext struct {
			Screenshots []editorCatVisualContextScreenshot `json:"screenshots"`
		} `json:"visualContext"`
	}
	require.NoError(t, json.Unmarshal(lookup.Body.Bytes(), &body))
	require.Len(t, body.VisualContext.Screenshots, 1)
	shot := body.VisualContext.Screenshots[0]
	require.Equal(t, secondBody.VisualContext.ScreenshotID, shot.ID)
	require.NotNil(t, shot.FigmaURL)
	require.Contains(t, *shot.FigmaURL, "node-id=1-2")
	require.Equal(t, 6, *shot.Width)
	require.Equal(t, []editorCatVisualContextMarker{{Left: 20, Top: 20, Width: 40, Height: 10}}, shot.Markers)

	var payBindings int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select count(*) from project_visual_context_bindings where translation_key_id=$1`, payID).Scan(&payBindings))
	require.Zero(t, payBindings)

	var designURL *string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select design_url from project_translation_keys where id=$1`, checkoutID).Scan(&designURL))
	require.NotNil(t, designURL)
	require.Contains(t, *designURL, "figma.com")
}

func TestFigmaVisualContextSyncKeepsNonFigmaDesignURL(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "home.title", "Home")
	_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set design_url='https://example.com/spec' where id=$1`, keyID)
	require.NoError(t, err)

	rec := figmaVisualContextRequest(t, api, "", figmaSyncPayload(scope.OrganizationID, scope.ProjectID, "3:4", mustVisualContextPNG(t, 2, 2), []figmaVisualContextBinding{{TranslationKeyID: keyID}}))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var designURL string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select design_url from project_translation_keys where id=$1`, keyID).Scan(&designURL))
	require.Equal(t, "https://example.com/spec", designURL)
}

func TestFigmaVisualContextSyncRejectsForeignKeys(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	rec := figmaVisualContextRequest(t, api, "", figmaSyncPayload(scope.OrganizationID, scope.ProjectID, "1:2", mustVisualContextPNG(t, 2, 2), []figmaVisualContextBinding{{TranslationKeyID: uuid.NewString()}}))
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "translation_key_not_found")
}

func TestFigmaVisualContextSyncRejectsWrongOrganization(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "a", "A")
	rec := figmaVisualContextRequest(t, api, "", figmaSyncPayload(uuid.NewString(), scope.ProjectID, "1:2", mustVisualContextPNG(t, 2, 2), []figmaVisualContextBinding{{TranslationKeyID: keyID}}))
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
}

func TestValidateFigmaVisualContextPayload(t *testing.T) {
	png := mustVisualContextPNG(t, 2, 2)
	keyID := uuid.NewString()
	valid := func() figmaVisualContextSyncPayload {
		return figmaSyncPayload(uuid.NewString(), "proj_1", "1:2", png, []figmaVisualContextBinding{{TranslationKeyID: keyID}})
	}

	payload := valid()
	_, err := validateFigmaVisualContextPayload(&payload)
	require.NoError(t, err)

	cases := map[string]func(*figmaVisualContextSyncPayload){
		"non-figma url": func(p *figmaVisualContextSyncPayload) { p.FigmaURL = "https://evil.example/figma.com" },
		"http url":      func(p *figmaVisualContextSyncPayload) { p.FigmaURL = "http://www.figma.com/design/x" },
		"webp":          func(p *figmaVisualContextSyncPayload) { p.ContentType = "image/webp" },
		"jpeg mismatch": func(p *figmaVisualContextSyncPayload) { p.ContentType = "image/jpeg" },
		"no bindings":   func(p *figmaVisualContextSyncPayload) { p.Bindings = nil },
		"dup bindings":  func(p *figmaVisualContextSyncPayload) { p.Bindings = append(p.Bindings, p.Bindings[0]) },
		"bad marker": func(p *figmaVisualContextSyncPayload) {
			p.Bindings[0].Marker = &editorCatVisualContextMarker{Left: 90, Top: 0, Width: 20, Height: 5}
		},
		"not an image": func(p *figmaVisualContextSyncPayload) {
			p.ImageBase64 = base64.StdEncoding.EncodeToString([]byte("nope"))
		},
		"bad base64":     func(p *figmaVisualContextSyncPayload) { p.ImageBase64 = "%%%" },
		"missing node":   func(p *figmaVisualContextSyncPayload) { p.NodeID = " " },
		"bad org":        func(p *figmaVisualContextSyncPayload) { p.OrganizationID = "org" },
		"bad key id":     func(p *figmaVisualContextSyncPayload) { p.Bindings[0].TranslationKeyID = "k" },
		"missing fileId": func(p *figmaVisualContextSyncPayload) { p.FileKey = "" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			payload := valid()
			mutate(&payload)
			_, err := validateFigmaVisualContextPayload(&payload)
			require.Error(t, err)
		})
	}
}
