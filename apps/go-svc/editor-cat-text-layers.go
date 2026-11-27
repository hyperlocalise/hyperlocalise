package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/jackc/pgx/v5"
)

const (
	editorCatTextLayerImageBytesLimit   = 20 << 20
	editorCatTextLayerPatchBodyBytes    = 2 << 20
	editorCatTextLayerMaxRegions        = 100
	editorCatTextLayerMaxRegionText     = 4000
	editorCatTextLayerMaxTranslationLen = 4000
)

type editorCatImageTextBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type editorCatImageTextRegion struct {
	ID           string                                         `json:"id"`
	Text         string                                         `json:"text"`
	Bounds       editorCatImageTextBounds                       `json:"bounds"`
	Translations map[string]editorCatImageTextRegionTranslation `json:"translations"`
}

type editorCatImageTextRegionTranslation struct {
	Text         string `json:"text"`
	Instructions string `json:"instructions"`
}

type editorCatImageTextLayers struct {
	Version     int                        `json:"version"`
	SourceHash  string                     `json:"sourceHash"`
	Revision    string                     `json:"revision"`
	ExtractedAt string                     `json:"extractedAt"`
	Regions     []editorCatImageTextRegion `json:"regions"`
}

func readEditorCatImageTextLayers(metadataJSON []byte, sourceHash string) *editorCatImageTextLayers {
	if len(metadataJSON) == 0 {
		return nil
	}
	var metadata map[string]json.RawMessage
	if err := json.Unmarshal(metadataJSON, &metadata); err != nil {
		return nil
	}
	raw, ok := metadata["imageTextLayers"]
	if !ok || len(raw) == 0 {
		return nil
	}
	var layers editorCatImageTextLayers
	if err := json.Unmarshal(raw, &layers); err != nil {
		return nil
	}
	if layers.Version != 1 || layers.SourceHash != sourceHash || layers.Revision == "" {
		return nil
	}
	return &layers
}

func (api *editorCatAPI) registerProjectImageTextLayers(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/projects/{projectId}/assets/{fileId}/text-layers"
	registerAuthenticated(mux, verifier, "GET "+base, http.HandlerFunc(api.getProjectImageTextLayers))
	registerAuthenticated(mux, verifier, "POST "+base, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		api.handleProjectImageTextLayersJSON(w, r, api.postProjectImageTextLayers)
	}))
	registerAuthenticated(mux, verifier, "PATCH "+base, api.patchProjectImageTextLayersHandler())
}

func (api *editorCatAPI) patchProjectImageTextLayersHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		r.Body = http.MaxBytesReader(w, r.Body, editorCatTextLayerPatchBodyBytes)
		api.handleProjectImageTextLayersJSON(w, r, api.patchProjectImageTextLayers)
	})
}

func (api *editorCatAPI) handleProjectImageTextLayersJSON(
	w http.ResponseWriter,
	r *http.Request,
	fn func(*http.Request, editorCatActor, editorCatProject, editorCatStoredAssetFile) (any, int, error),
) {
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
	project, file, err := api.resolveEditorCatImageTextLayerFile(ctx, actor, r)
	if err != nil {
		writeEditorCatError(w, r, "resolve_file", err)
		return
	}
	result, status, err := fn(r, actor, project, file)
	if err != nil {
		writeEditorCatError(w, r, "text_layers", err)
		return
	}
	editorJSON(ctx, w, status, result)
}

func (api *editorCatAPI) getProjectImageTextLayers(w http.ResponseWriter, r *http.Request) {
	api.handleProjectImageTextLayersJSON(w, r, func(_ *http.Request, _ editorCatActor, _ editorCatProject, file editorCatStoredAssetFile) (any, int, error) {
		return map[string]any{
			"textLayers": readEditorCatImageTextLayers(file.Metadata, file.SHA256),
		}, http.StatusOK, nil
	})
}

func (api *editorCatAPI) postProjectImageTextLayers(r *http.Request, actor editorCatActor, project editorCatProject, file editorCatStoredAssetFile) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.ai == nil || api.ai.text == nil {
		return nil, 0, editorCatFailure(503, "provider_unavailable", "Translation is not configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY)")
	}
	if status, code, message, ok := api.ai.ensureAIAllowed(r.Context(), actor.organizationID); !ok {
		return nil, 0, editorCatFailure(status, code, message)
	}
	existing := readEditorCatImageTextLayers(file.Metadata, file.SHA256)
	if existing != nil {
		return map[string]any{"textLayers": existing}, http.StatusOK, nil
	}
	if file.ByteSize > editorCatTextLayerImageBytesLimit {
		return nil, 0, editorCatFailure(400, "image_too_large", "Text extraction supports images up to 20 MB.")
	}
	content, _, _, err := api.readEditorCatStoredFileForProject(r.Context(), actor.organizationID, project.ID, file.ID)
	if err != nil {
		return nil, 0, err
	}
	if len(content) > editorCatTextLayerImageBytesLimit {
		return nil, 0, editorCatFailure(400, "image_too_large", "Text extraction supports images up to 20 MB.")
	}
	regions, reply, err := api.extractEditorCatImageTextRegions(r, content, file.ContentType)
	if err != nil {
		return nil, 0, err
	}
	layers := editorCatImageTextLayers{
		Version:     1,
		SourceHash:  file.SHA256,
		Revision:    uuid.NewString(),
		ExtractedAt: time.Now().UTC().Format(time.RFC3339),
		Regions:     regions,
	}
	updated, err := api.writeEditorCatImageTextLayers(r.Context(), file, layers, nil, file.Metadata)
	if err != nil {
		return nil, 0, err
	}
	if !updated {
		return nil, 0, editorCatFailure(409, "text_layers_conflict", "Text layers changed. Reload before trying again.")
	}
	api.ai.charge(r.Context(), irisOrgScope{OrganizationID: actor.organizationID, UserID: actor.userID, Role: actor.role}, irisCharge{
		OperationKey: irisOperationKey("editor-cat-image-text-layers:" + file.ID),
		Source:       "image_text_extraction",
		Track: autumn.TrackTokensRequest{
			ModelID:      reply.Model,
			InputTokens:  reply.InputTokens,
			OutputTokens: reply.OutputTokens,
			Properties: map[string]any{
				"feature":    "image_text_extraction",
				"user_id":    actor.userID,
				"project_id": project.ID,
				"file_id":    file.ID,
			},
		},
	})
	return map[string]any{"textLayers": layers}, http.StatusOK, nil
}

func (api *editorCatAPI) patchProjectImageTextLayers(r *http.Request, actor editorCatActor, _ editorCatProject, file editorCatStoredAssetFile) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	var layers editorCatImageTextLayers
	if err := readEditorCatJSON(r, &layers); err != nil {
		return nil, 0, err
	}
	if layers.Version != 1 || layers.Revision == "" || layers.SourceHash != file.SHA256 {
		return nil, 0, editorCatFailure(409, "text_layers_conflict", "The source or its text layers changed. Reload before saving.")
	}
	existing := readEditorCatImageTextLayers(file.Metadata, file.SHA256)
	if existing == nil || existing.Revision != layers.Revision {
		return nil, 0, editorCatFailure(409, "text_layers_conflict", "The source or its text layers changed. Reload before saving.")
	}
	if err := validateEditorCatImageTextLayers(&layers); err != nil {
		return nil, 0, err
	}
	layers.ExtractedAt = existing.ExtractedAt
	layers.Revision = uuid.NewString()
	updated, err := api.writeEditorCatImageTextLayers(r.Context(), file, layers, &existing.Revision, file.Metadata)
	if err != nil {
		return nil, 0, err
	}
	if !updated {
		return nil, 0, editorCatFailure(409, "text_layers_conflict", "Text layers changed. Reload before saving.")
	}
	return map[string]any{"textLayers": layers}, http.StatusOK, nil
}

func validateEditorCatImageTextLayers(layers *editorCatImageTextLayers) error {
	if len(layers.Regions) > editorCatTextLayerMaxRegions {
		return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
	}
	seen := map[string]bool{}
	for _, region := range layers.Regions {
		if region.ID == "" || len(region.ID) > 128 || len(region.Text) > editorCatTextLayerMaxRegionText {
			return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
		}
		if seen[region.ID] {
			return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
		}
		seen[region.ID] = true
		if region.Bounds.Width <= 0 || region.Bounds.Height <= 0 ||
			region.Bounds.X < 0 || region.Bounds.Y < 0 ||
			region.Bounds.X+region.Bounds.Width > 1.001 ||
			region.Bounds.Y+region.Bounds.Height > 1.001 {
			return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
		}
		if len(region.Translations) > 100 {
			return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
		}
		for locale, translation := range region.Translations {
			if locale == "" || len(locale) > 64 ||
				len(translation.Text) > editorCatTextLayerMaxTranslationLen ||
				len(translation.Instructions) > 2000 {
				return editorCatFailure(400, "invalid_text_layers", "Invalid text layers payload")
			}
		}
	}
	return nil
}

type editorCatStoredAssetFile struct {
	ID             string
	OrganizationID string
	ProjectID      string
	ContentType    string
	SHA256         string
	ByteSize       int
	Metadata       []byte
}

func (api *editorCatAPI) resolveEditorCatImageTextLayerFile(ctx context.Context, actor editorCatActor, r *http.Request) (editorCatProject, editorCatStoredAssetFile, error) {
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
        from stored_files
        where id=$1 and organization_id=$2
        limit 1`, fileID, actor.organizationID,
	).Scan(&file.ID, &file.OrganizationID, &file.ProjectID, &file.ContentType, &file.SHA256, &file.ByteSize, &file.Metadata)
	if errors.Is(err, pgx.ErrNoRows) {
		return editorCatProject{}, editorCatStoredAssetFile{}, editorCatFailure(404, "file_not_found", "File not found")
	}
	if err != nil {
		return editorCatProject{}, editorCatStoredAssetFile{}, err
	}
	switch file.ContentType {
	case "image/png", "image/jpeg", "image/webp":
	default:
		return editorCatProject{}, editorCatStoredAssetFile{}, editorCatFailure(400, "unsupported_image_type", "Text extraction supports PNG, JPEG, and WebP images.")
	}
	return project, file, nil
}

func (api *editorCatAPI) writeEditorCatImageTextLayers(ctx context.Context, file editorCatStoredAssetFile, layers editorCatImageTextLayers, expectRevision *string, priorMetadata []byte) (bool, error) {
	encoded, err := json.Marshal(layers)
	if err != nil {
		return false, err
	}
	var priorLayer json.RawMessage
	if len(priorMetadata) > 0 {
		var metadata map[string]json.RawMessage
		if json.Unmarshal(priorMetadata, &metadata) == nil {
			priorLayer = metadata["imageTextLayers"]
		}
	}
	if priorLayer == nil {
		priorLayer = json.RawMessage("null")
	}
	var tag int64
	if expectRevision == nil {
		err = api.pool.QueryRow(ctx, `
            update stored_files
            set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{imageTextLayers}', $4::jsonb),
                updated_at = now()
            where id=$1 and organization_id=$2 and sha256=$3
              and coalesce(metadata->'imageTextLayers', 'null'::jsonb) is not distinct from $5::jsonb
            returning 1`,
			file.ID, file.OrganizationID, file.SHA256, string(encoded), string(priorLayer),
		).Scan(&tag)
	} else {
		err = api.pool.QueryRow(ctx, `
            update stored_files
            set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{imageTextLayers}', $4::jsonb),
                updated_at = now()
            where id=$1 and organization_id=$2 and sha256=$3
              and metadata->'imageTextLayers'->>'revision' = $5
            returning 1`,
			file.ID, file.OrganizationID, file.SHA256, string(encoded), *expectRevision,
		).Scan(&tag)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (api *editorCatAPI) extractEditorCatImageTextRegions(
	r *http.Request,
	content []byte,
	contentType string,
) ([]editorCatImageTextRegion, irisChatReply, error) {
	reply, err := api.ai.text.Complete(r.Context(), irisChatRequest{
		Model:  irisEnvOr("IRIS_VISION_MODEL", defaultIrisVisionModel),
		System: irisImageTextSystem,
		User:   "Read the text in this image.",
		Images: []irisProviderInput{{Bytes: content, ContentType: contentType}},
		JSON:   true,
	})
	if err != nil {
		return nil, irisChatReply{}, editorCatFailure(503, "image_text_extraction_failed", "Could not extract text. Please try again.")
	}
	parsed, err := parseIrisImageText(reply.Text)
	if err != nil {
		return nil, reply, editorCatFailure(503, "image_text_extraction_failed", "Could not extract text. Please try again.")
	}
	entries := parsed.Regions
	if len(entries) == 0 {
		entries = parsed.Texts
	}
	regions := make([]editorCatImageTextRegion, 0, len(entries))
	for _, entry := range entries {
		if entry.Bounds == nil {
			continue
		}
		regions = append(regions, editorCatImageTextRegion{
			ID:   entry.ID,
			Text: entry.Text,
			Bounds: editorCatImageTextBounds{
				X: entry.Bounds.X, Y: entry.Bounds.Y, Width: entry.Bounds.Width, Height: entry.Bounds.Height,
			},
			Translations: map[string]editorCatImageTextRegionTranslation{},
		})
		if len(regions) >= editorCatTextLayerMaxRegions {
			break
		}
	}
	return regions, reply, nil
}
