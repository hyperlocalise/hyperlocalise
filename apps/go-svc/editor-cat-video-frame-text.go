package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

const (
	editorCatVideoFrameBodyLimit = 4 << 20
	editorCatVideoFrameMaxDim    = 1280
)

type editorCatVideoFrameBody struct {
	Timestamp float64 `json:"timestamp"`
	Frame     string  `json:"frame"`
}

func (api *editorCatAPI) registerProjectVideoFrameText(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/projects/{projectId}/assets/{fileId}/frame-text"
	registerAuthenticated(mux, verifier, "POST "+base, http.HandlerFunc(api.postProjectVideoFrameText))
}

func (api *editorCatAPI) postProjectVideoFrameText(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	r.Body = http.MaxBytesReader(w, r.Body, editorCatVideoFrameBodyLimit)
	if denyBrowserMutation(r) {
		writeEditorCatError(w, r, "origin_guard", editorCatFailure(403, "forbidden", "Cross-origin request denied"))
		return
	}
	if api.pool == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), editorCatRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)

	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeEditorCatError(w, r, "auth", editorCatFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := api.actorFor(ctx, claims, r.PathValue("organizationSlug"), true)
	if err != nil {
		writeEditorCatError(w, r, "resolve_actor", err)
		return
	}
	if !actor.canEdit() {
		writeEditorCatError(w, r, "forbidden", editorCatFailure(403, "forbidden", "Insufficient permissions"))
		return
	}
	if api.ai == nil || api.ai.text == nil {
		writeEditorCatError(w, r, "provider", editorCatFailure(503, "provider_unavailable", "Translation is not configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY)"))
		return
	}
	if status, code, message, ok := api.ai.ensureAIAllowed(ctx, actor.organizationID); !ok {
		writeEditorCatError(w, r, "ai", editorCatFailure(status, code, message))
		return
	}
	project, file, err := api.resolveEditorCatVideoFrameFile(ctx, actor, r)
	if err != nil {
		writeEditorCatError(w, r, "resolve_file", err)
		return
	}
	var body editorCatVideoFrameBody
	if err := readEditorCatJSON(r, &body); err != nil {
		writeEditorCatError(w, r, "body", err)
		return
	}
	content, ok := decodeEditorCatVideoFramePNG(body.Frame)
	if !ok {
		writeEditorCatError(w, r, "frame", editorCatFailure(400, "invalid_video_frame", "Invalid video frame"))
		return
	}
	regions, reply, err := api.extractEditorCatImageTextRegions(r, content, "image/png")
	if err != nil {
		writeEditorCatError(w, r, "extract", err)
		return
	}
	api.ai.charge(ctx, irisOrgScope{OrganizationID: actor.organizationID, UserID: actor.userID, Role: actor.role}, irisCharge{
		OperationKey: irisOperationKey("editor-cat-video-frame-text:" + file.ID),
		Source:       "image_text_extraction",
		Track: autumn.TrackTokensRequest{
			ModelID:      reply.Model,
			InputTokens:  reply.InputTokens,
			OutputTokens: reply.OutputTokens,
			Properties: map[string]any{
				"feature":    "video_frame_text_extraction",
				"user_id":    actor.userID,
				"project_id": project.ID,
				"file_id":    file.ID,
			},
		},
	})
	editorJSON(ctx, w, http.StatusOK, map[string]any{
		"frameText": map[string]any{
			"timestamp": body.Timestamp,
			"regions":   regions,
		},
	})
}

func decodeEditorCatVideoFramePNG(frame string) ([]byte, bool) {
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(frame, prefix) {
		return nil, false
	}
	content, err := base64.StdEncoding.DecodeString(frame[len(prefix):])
	if err != nil || len(content) < 33 {
		return nil, false
	}
	if content[0] != 0x89 || content[1] != 0x50 || content[2] != 0x4e || content[3] != 0x47 {
		return nil, false
	}
	if string(content[12:16]) != "IHDR" {
		return nil, false
	}
	width := int(content[16])<<24 | int(content[17])<<16 | int(content[18])<<8 | int(content[19])
	height := int(content[20])<<24 | int(content[21])<<16 | int(content[22])<<8 | int(content[23])
	if width < 1 || height < 1 || width > editorCatVideoFrameMaxDim || height > editorCatVideoFrameMaxDim {
		return nil, false
	}
	return content, true
}

func (api *editorCatAPI) resolveEditorCatVideoFrameFile(ctx context.Context, actor editorCatActor, r *http.Request) (editorCatProject, editorCatStoredAssetFile, error) {
	fileID := strings.TrimSpace(r.PathValue("fileId"))
	if fileID == "" {
		return editorCatProject{}, editorCatStoredAssetFile{}, editorCatFailure(404, "file_not_found", "File not found")
	}
	var project editorCatProject
	var err error
	if actor.isVendor() {
		project, err = api.resolveEditorCatVendorProjectAsset(ctx, actor, r.PathValue("projectId"), fileID)
	} else {
		project, err = api.resolveEditorCatTeamProjectAsset(ctx, actor, r.PathValue("projectId"), fileID)
	}
	if err != nil {
		return editorCatProject{}, editorCatStoredAssetFile{}, err
	}
	var file editorCatStoredAssetFile
	err = api.pool.QueryRow(ctx, `
        select id, organization_id, coalesce(project_id::text, ''), content_type, coalesce(sha256, ''), byte_size,
               coalesce(metadata, '{}'::jsonb)
        from stored_files where id=$1 and organization_id=$2 limit 1`,
		fileID, actor.organizationID,
	).Scan(&file.ID, &file.OrganizationID, &file.ProjectID, &file.ContentType, &file.SHA256, &file.ByteSize, &file.Metadata)
	if err != nil {
		return editorCatProject{}, editorCatStoredAssetFile{}, editorCatFailure(404, "file_not_found", "File not found")
	}
	if file.ContentType != "video/mp4" {
		return editorCatProject{}, editorCatStoredAssetFile{}, editorCatFailure(400, "unsupported_video_type", "Unsupported video type")
	}
	return project, file, nil
}
