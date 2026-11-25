package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
	"github.com/jackc/pgx/v5"
)

// Brand voices are the first part of a workspace's brand kit: speech voices
// cloned from a speaker's recordings or kept from a designed preview.
//
// Every workspace shares one ElevenLabs account, so a voice belongs to a
// workspace only through its brand_voices row. Generation resolves a brand
// voice's id or name to its ElevenLabs voice id for the workspace's own
// members, and refuses the ElevenLabs id of another workspace's voice.

const (
	irisBrandVoicesPath = irisGenerationPath + "/brand/voices"

	irisBrandVoiceProvider     = "elevenlabs"
	irisBrandVoiceSourceClone  = "clone"
	irisBrandVoiceSourceDesign = "design"

	// irisVoiceConsentVersion names the consent wording the client shows
	// before a clone. Bump it when the wording changes; clients must send
	// the version they showed.
	irisVoiceConsentVersion = "2026-11-22"

	irisDefaultBrandVoiceLimit  = 10
	irisMaxBrandVoiceSamples    = 10
	irisMaxBrandVoiceSampleSize = 100 << 20
	irisMaxBrandVoiceName       = 100
	irisMaxBrandVoiceDesc       = 500
	irisMaxBrandVoiceLabels     = 20
	irisMaxBrandVoiceLabelRunes = 100
	irisBrandVoiceManageCap     = "workspace:update"
)

// irisVoiceLibrary keeps voices on the provider account.
type irisVoiceLibrary interface {
	CloneVoice(context.Context, elevenlabs.CloneVoiceRequest) (string, error)
	SaveVoice(context.Context, elevenlabs.SaveVoiceRequest) (string, error)
	DeleteVoice(context.Context, string) error
}

// irisVoiceLibraryFrom returns the provider's ElevenLabs client, or nil when
// ElevenLabs is not configured.
func irisVoiceLibraryFrom(provider irisGenerationProvider) irisVoiceLibrary {
	composite, ok := provider.(*irisCompositeProvider)
	if !ok || composite == nil || composite.elevenlabs == nil {
		return nil
	}
	return composite.elevenlabs
}

type irisBrandVoice struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Source          string            `json:"source"`
	Provider        string            `json:"provider"`
	Labels          map[string]string `json:"labels"`
	Language        *string           `json:"language"`
	CreatedByUserID *string           `json:"createdByUserId"`
	ConsentedAt     *string           `json:"consentedAt"`
	CreatedAt       string            `json:"createdAt"`
	UpdatedAt       string            `json:"updatedAt"`
}

type irisBrandVoiceFields struct {
	Name        *string            `json:"name"`
	Description *string            `json:"description"`
	Language    *string            `json:"language"`
	Labels      *map[string]string `json:"labels"`
}

type irisCloneVoiceBody struct {
	irisBrandVoiceFields
	Samples               []irisAssetRef `json:"samples"`
	RemoveBackgroundNoise bool           `json:"removeBackgroundNoise"`
	// ConsentVersion is the consent wording the member accepted: that the
	// speaker agreed to have their voice cloned for this workspace.
	ConsentVersion string `json:"consentVersion"`
}

type irisSaveDesignedVoiceBody struct {
	irisBrandVoiceFields
	GeneratedVoiceID string `json:"generatedVoiceId"`
}

// irisBrandVoiceInput is a validated name, description, language and labels.
type irisBrandVoiceInput struct {
	Name        string
	NameKey     string
	Description string
	Language    *string
	Labels      map[string]string
}

func (api *irisGenerationAPI) registerBrandVoices(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "GET "+irisBrandVoicesPath, http.HandlerFunc(api.listBrandVoices))
	registerAuthenticated(mux, verifier, "POST "+irisBrandVoicesPath+"/clone", http.HandlerFunc(api.cloneBrandVoice))
	registerAuthenticated(mux, verifier, "POST "+irisBrandVoicesPath+"/designed", http.HandlerFunc(api.saveDesignedBrandVoice))
	registerAuthenticated(mux, verifier, "PATCH "+irisBrandVoicesPath+"/{voiceId}", http.HandlerFunc(api.updateBrandVoice))
	registerAuthenticated(mux, verifier, "DELETE "+irisBrandVoicesPath+"/{voiceId}", http.HandlerFunc(api.deleteBrandVoice))
}

func (api *irisGenerationAPI) brandVoiceScope(w http.ResponseWriter, r *http.Request, manage bool) (irisOrgScope, bool) {
	scope, ok := api.scope(w, r)
	if !ok {
		return scope, false
	}
	if manage && !authz.HasCapability(scope.Role, irisBrandVoiceManageCap) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only workspace admins and localisation managers can change brand voices"})
		return scope, false
	}
	if api.pool == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "service_unavailable", "message": "The workspace database is not configured"})
		return scope, false
	}
	return scope, true
}

func (api *irisGenerationAPI) brandVoiceLibrary(w http.ResponseWriter) (irisVoiceLibrary, bool) {
	if api.voices == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "service_unavailable", "message": "Brand voices need ELEVENLABS_API_KEY"})
		return nil, false
	}
	return api.voices, true
}

func (api *irisGenerationAPI) listBrandVoices(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.brandVoiceScope(w, r, false)
	if !ok {
		return
	}
	rows, err := api.pool.Query(r.Context(), `select `+irisBrandVoiceColumns+`
from brand_voices
where organization_id = $1 and archived_at is null
order by lower(name), created_at`, scope.OrganizationID)
	if err != nil {
		logRequestFailure(r, "iris_brand_voices_list_failed", "list", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not list brand voices"})
		return
	}
	defer rows.Close()
	voices := []irisBrandVoice{}
	for rows.Next() {
		voice, err := scanIrisBrandVoice(rows)
		if err != nil {
			logRequestFailure(r, "iris_brand_voices_scan_failed", "list", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not list brand voices"})
			return
		}
		voices = append(voices, voice)
	}
	if err := rows.Err(); err != nil {
		logRequestFailure(r, "iris_brand_voices_list_failed", "list", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not list brand voices"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"voices": voices, "limit": irisBrandVoiceLimit(), "consentVersion": irisVoiceConsentVersion})
}

func (api *irisGenerationAPI) cloneBrandVoice(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.brandVoiceScope(w, r, true)
	if !ok {
		return
	}
	library, ok := api.brandVoiceLibrary(w)
	if !ok {
		return
	}
	var body irisCloneVoiceBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "Invalid clone request"})
		return
	}
	input, err := validateIrisBrandVoiceInput(body.irisBrandVoiceFields)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	if strings.TrimSpace(body.ConsentVersion) != irisVoiceConsentVersion {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":          "consent_required",
			"message":        "Confirm that the speaker agreed to have their voice cloned",
			"consentVersion": irisVoiceConsentVersion,
		})
		return
	}
	if len(body.Samples) == 0 || len(body.Samples) > irisMaxBrandVoiceSamples {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": fmt.Sprintf("samples takes 1 to %d uploaded recordings", irisMaxBrandVoiceSamples)})
		return
	}
	if !api.brandVoiceRoom(w, r, scope, input) {
		return
	}
	samples := make([]elevenlabs.VoiceSample, 0, len(body.Samples))
	sampleIDs := make([]string, 0, len(body.Samples))
	total := 0
	for i, ref := range body.Samples {
		ref.ID = strings.ToLower(strings.TrimSpace(ref.ID))
		data, contentType, err := api.readRef(r.Context(), scope.OrganizationID, ref)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": fmt.Sprintf("samples[%d] is not an uploaded file", i)})
			return
		}
		if !strings.HasPrefix(contentType, "audio/") && !strings.HasPrefix(contentType, "video/") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": fmt.Sprintf("samples[%d] must be audio or video", i)})
			return
		}
		total += len(data)
		if total > irisMaxBrandVoiceSampleSize {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "samples take at most 100MiB together"})
			return
		}
		samples = append(samples, elevenlabs.VoiceSample{Bytes: data, ContentType: contentType})
		sampleIDs = append(sampleIDs, ref.ID)
	}
	providerID, err := library.CloneVoice(r.Context(), elevenlabs.CloneVoiceRequest{
		Name:                  input.Name,
		Description:           input.Description,
		Labels:                irisProviderVoiceLabels(scope, irisBrandVoiceSourceClone),
		Samples:               samples,
		RemoveBackgroundNoise: body.RemoveBackgroundNoise,
	})
	if err != nil {
		writeIrisVoiceProviderError(w, r, "clone", err)
		return
	}
	consentedAt := api.clock()
	api.insertBrandVoice(w, r, library, scope, input, irisBrandVoiceRow{
		Source:          irisBrandVoiceSourceClone,
		ProviderVoiceID: providerID,
		SampleAssetIDs:  sampleIDs,
		ConsentedAt:     &consentedAt,
		ConsentVersion:  irisVoiceConsentVersion,
	})
}

func (api *irisGenerationAPI) saveDesignedBrandVoice(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.brandVoiceScope(w, r, true)
	if !ok {
		return
	}
	library, ok := api.brandVoiceLibrary(w)
	if !ok {
		return
	}
	var body irisSaveDesignedVoiceBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "Invalid voice request"})
		return
	}
	input, err := validateIrisBrandVoiceInput(body.irisBrandVoiceFields)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	generated := strings.TrimSpace(body.GeneratedVoiceID)
	if generated == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "generatedVoiceId is required: the id of an elevenlabs-voice-design preview"})
		return
	}
	if !api.brandVoiceRoom(w, r, scope, input) {
		return
	}
	providerID, err := library.SaveVoice(r.Context(), elevenlabs.SaveVoiceRequest{
		GeneratedVoiceID: generated,
		Name:             input.Name,
		Description:      input.Description,
		Labels:           irisProviderVoiceLabels(scope, irisBrandVoiceSourceDesign),
	})
	if err != nil {
		writeIrisVoiceProviderError(w, r, "save_design", err)
		return
	}
	api.insertBrandVoice(w, r, library, scope, input, irisBrandVoiceRow{
		Source:          irisBrandVoiceSourceDesign,
		ProviderVoiceID: providerID,
	})
}

func (api *irisGenerationAPI) updateBrandVoice(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.brandVoiceScope(w, r, true)
	if !ok {
		return
	}
	voiceID := strings.TrimSpace(r.PathValue("voiceId"))
	var body irisBrandVoiceFields
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": "Invalid voice update"})
		return
	}
	current, err := api.loadBrandVoice(r.Context(), scope.OrganizationID, voiceID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "voice_not_found", "message": "Brand voice not found"})
		return
	}
	if err != nil {
		logRequestFailure(r, "iris_brand_voice_load_failed", "update", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not update the brand voice"})
		return
	}
	merged := irisBrandVoiceFields{Name: &current.Name, Description: &current.Description, Language: current.Language, Labels: &current.Labels}
	if body.Name != nil {
		merged.Name = body.Name
	}
	if body.Description != nil {
		merged.Description = body.Description
	}
	if body.Language != nil {
		merged.Language = body.Language
	}
	if body.Labels != nil {
		merged.Labels = body.Labels
	}
	input, err := validateIrisBrandVoiceInput(merged)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	labels, _ := json.Marshal(input.Labels)
	row := api.pool.QueryRow(r.Context(), `update brand_voices
set name = $3, name_key = $4, description = $5, language = $6, labels = $7::jsonb, updated_at = now()
where organization_id = $1 and id::text = $2 and archived_at is null
returning `+irisBrandVoiceColumns, scope.OrganizationID, voiceID, input.Name, input.NameKey, input.Description, input.Language, string(labels))
	voice, err := scanIrisBrandVoice(row)
	switch {
	case isUniqueViolation(err):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "voice_name_taken", "message": "The workspace already has a voice with that name"})
	case errors.Is(err, pgx.ErrNoRows):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "voice_not_found", "message": "Brand voice not found"})
	case err != nil:
		logRequestFailure(r, "iris_brand_voice_update_failed", "update", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not update the brand voice"})
	default:
		writeJSON(w, http.StatusOK, voice)
	}
}

func (api *irisGenerationAPI) deleteBrandVoice(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.brandVoiceScope(w, r, true)
	if !ok {
		return
	}
	library, ok := api.brandVoiceLibrary(w)
	if !ok {
		return
	}
	voiceID := strings.TrimSpace(r.PathValue("voiceId"))
	var providerID string
	err := api.pool.QueryRow(r.Context(), `select provider_voice_id from brand_voices
where organization_id = $1 and id::text = $2 and archived_at is null`, scope.OrganizationID, voiceID).Scan(&providerID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "voice_not_found", "message": "Brand voice not found"})
		return
	}
	if err != nil {
		logRequestFailure(r, "iris_brand_voice_load_failed", "delete", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not delete the brand voice"})
		return
	}
	// The provider voice goes first: a row archived while its voice lives
	// on would leave a clone of someone's voice nobody can remove.
	if err := library.DeleteVoice(r.Context(), providerID); err != nil {
		writeIrisVoiceProviderError(w, r, "delete", err)
		return
	}
	if _, err := api.pool.Exec(r.Context(), `update brand_voices set archived_at = now(), updated_at = now()
where organization_id = $1 and id::text = $2 and archived_at is null`, scope.OrganizationID, voiceID); err != nil {
		logRequestFailure(r, "iris_brand_voice_archive_failed", "delete", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not delete the brand voice"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// brandVoiceRoom answers false, having written the response, when the name
// is taken or the workspace has used its voices. The checks run before the
// provider voice is made so a refused request leaves nothing behind.
func (api *irisGenerationAPI) brandVoiceRoom(w http.ResponseWriter, r *http.Request, scope irisOrgScope, input irisBrandVoiceInput) bool {
	var active int
	var taken bool
	err := api.pool.QueryRow(r.Context(), `select count(*)::int, coalesce(bool_or(name_key = $2), false)
from brand_voices where organization_id = $1 and archived_at is null`, scope.OrganizationID, input.NameKey).Scan(&active, &taken)
	if err != nil {
		logRequestFailure(r, "iris_brand_voice_room_failed", "create", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not check the workspace's voices"})
		return false
	}
	if taken {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "voice_name_taken", "message": "The workspace already has a voice with that name"})
		return false
	}
	if limit := irisBrandVoiceLimit(); active >= limit {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "brand_voice_limit_reached", "message": fmt.Sprintf("The workspace has %d of %d brand voices; delete one first", active, limit)})
		return false
	}
	return true
}

type irisBrandVoiceRow struct {
	Source          string
	ProviderVoiceID string
	SampleAssetIDs  []string
	ConsentedAt     *time.Time
	ConsentVersion  string
}

// insertBrandVoice keeps the provider voice as the workspace's. When the row
// cannot be written the provider voice is deleted again.
func (api *irisGenerationAPI) insertBrandVoice(w http.ResponseWriter, r *http.Request, library irisVoiceLibrary, scope irisOrgScope, input irisBrandVoiceInput, row irisBrandVoiceRow) {
	labels, _ := json.Marshal(input.Labels)
	samples := row.SampleAssetIDs
	if samples == nil {
		samples = []string{}
	}
	var consentBy, consentVersion *string
	if row.ConsentedAt != nil {
		consentBy = nullableUUIDText(scope.UserID)
		consentVersion = &row.ConsentVersion
	}
	voice, err := scanIrisBrandVoice(api.pool.QueryRow(r.Context(), `insert into brand_voices
(organization_id, created_by_user_id, name, name_key, description, provider, provider_voice_id, source, labels, language, sample_asset_ids, consent_by_user_id, consented_at, consent_version)
values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::uuid, $13, $14)
returning `+irisBrandVoiceColumns,
		scope.OrganizationID, nullableUUIDText(scope.UserID), input.Name, input.NameKey, input.Description,
		irisBrandVoiceProvider, row.ProviderVoiceID, row.Source, string(labels), input.Language, samples,
		consentBy, row.ConsentedAt, consentVersion))
	if err != nil {
		cleanupCtx, cancel := irisCleanupContext(r.Context())
		defer cancel()
		if deleteErr := library.DeleteVoice(cleanupCtx, row.ProviderVoiceID); deleteErr != nil {
			logRequestFailure(r, "iris_brand_voice_orphaned", "create", deleteErr, "provider_voice_id", row.ProviderVoiceID)
		}
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "voice_name_taken", "message": "The workspace already has a voice with that name"})
			return
		}
		logRequestFailure(r, "iris_brand_voice_insert_failed", "create", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error", "message": "Could not save the brand voice"})
		return
	}
	writeJSON(w, http.StatusCreated, voice)
}

func (api *irisGenerationAPI) loadBrandVoice(ctx context.Context, orgID, voiceID string) (irisBrandVoice, error) {
	return scanIrisBrandVoice(api.pool.QueryRow(ctx, `select `+irisBrandVoiceColumns+`
from brand_voices where organization_id = $1 and id::text = $2 and archived_at is null`, orgID, voiceID))
}

const irisBrandVoiceColumns = `id::text, name, description, source, provider, labels, language,
created_by_user_id::text, consented_at, created_at, updated_at`

func scanIrisBrandVoice(row pgx.Row) (irisBrandVoice, error) {
	var voice irisBrandVoice
	var labels []byte
	var consentedAt *time.Time
	var createdAt, updatedAt time.Time
	if err := row.Scan(&voice.ID, &voice.Name, &voice.Description, &voice.Source, &voice.Provider, &labels,
		&voice.Language, &voice.CreatedByUserID, &consentedAt, &createdAt, &updatedAt); err != nil {
		return irisBrandVoice{}, err
	}
	voice.Labels = map[string]string{}
	if len(labels) > 0 {
		if err := json.Unmarshal(labels, &voice.Labels); err != nil {
			return irisBrandVoice{}, err
		}
	}
	if consentedAt != nil {
		formatted := consentedAt.UTC().Format(time.RFC3339)
		voice.ConsentedAt = &formatted
	}
	voice.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	voice.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return voice, nil
}

func validateIrisBrandVoiceInput(fields irisBrandVoiceFields) (irisBrandVoiceInput, error) {
	var input irisBrandVoiceInput
	if fields.Name != nil {
		input.Name = strings.Join(strings.Fields(*fields.Name), " ")
	}
	input.NameKey = elevenlabs.NormalizeVoiceName(input.Name)
	if input.NameKey == "" {
		return input, errors.New("name is required and needs a letter or digit")
	}
	if utf8.RuneCountInString(input.Name) > irisMaxBrandVoiceName {
		return input, fmt.Errorf("name takes at most %d characters", irisMaxBrandVoiceName)
	}
	if fields.Description != nil {
		input.Description = strings.TrimSpace(*fields.Description)
	}
	if utf8.RuneCountInString(input.Description) > irisMaxBrandVoiceDesc {
		return input, fmt.Errorf("description takes at most %d characters", irisMaxBrandVoiceDesc)
	}
	if fields.Language != nil {
		if language := strings.TrimSpace(*fields.Language); language != "" {
			if len(language) > 35 {
				return input, errors.New("language is a BCP 47 tag such as en-US")
			}
			input.Language = &language
		}
	}
	input.Labels = map[string]string{}
	if fields.Labels != nil {
		if len(*fields.Labels) > irisMaxBrandVoiceLabels {
			return input, fmt.Errorf("labels takes at most %d entries", irisMaxBrandVoiceLabels)
		}
		for key, value := range *fields.Labels {
			key, value = strings.TrimSpace(key), strings.TrimSpace(value)
			if key == "" || utf8.RuneCountInString(key) > irisMaxBrandVoiceLabelRunes || utf8.RuneCountInString(value) > irisMaxBrandVoiceLabelRunes {
				return input, fmt.Errorf("label keys and values take 1 to %d characters", irisMaxBrandVoiceLabelRunes)
			}
			input.Labels[key] = value
		}
	}
	return input, nil
}

// irisProviderVoiceLabels tag the provider voice with its workspace, so a
// voice on the shared account can be traced back if its row is lost.
func irisProviderVoiceLabels(scope irisOrgScope, source string) map[string]string {
	return map[string]string{"workspace": scope.OrganizationID, "source": source, "app": "iris"}
}

func irisBrandVoiceLimit() int {
	if raw := strings.TrimSpace(os.Getenv("IRIS_BRAND_VOICE_LIMIT")); raw != "" {
		if limit, err := strconv.Atoi(raw); err == nil && limit >= 0 {
			return limit
		}
	}
	return irisDefaultBrandVoiceLimit
}

func nullableUUIDText(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func writeIrisVoiceProviderError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	if typed, ok := elevenlabs.AsError(err); ok {
		switch typed.Code {
		case elevenlabs.ErrorCodeValidation:
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": typed.Message})
			return
		case elevenlabs.ErrorCodeRateLimited:
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited", "message": "ElevenLabs is busy; try again shortly"})
			return
		}
	}
	logRequestFailure(r, "iris_brand_voice_provider_failed", phase, err)
	writeJSON(w, http.StatusBadGateway, map[string]string{"error": "provider_error", "message": "ElevenLabs could not complete the request"})
}

// irisVoiceError is a voice the request may not use; the client gets its
// message.
type irisVoiceError struct{ voice string }

func (e *irisVoiceError) Error() string {
	return fmt.Sprintf("voice %q is not available in this workspace", e.voice)
}

// irisRequestedVoices lists the voices an ElevenLabs request names: its
// voice, and the voice of each dialogue line.
func irisRequestedVoices(req irisGenerateRequest) []string {
	seen := map[string]bool{}
	var voices []string
	add := func(voice string) {
		voice = strings.TrimSpace(voice)
		if voice != "" && !seen[voice] {
			seen[voice] = true
			voices = append(voices, voice)
		}
	}
	add(req.voice())
	for _, line := range req.dialogueLines() {
		add(line.Voice)
	}
	return voices
}

// resolveBrandVoices maps each brand voice the request names, by id or by
// name, to its ElevenLabs voice id. Voices it does not map go to ElevenLabs
// as given, where only premade voices resolve by name. The ElevenLabs id of
// another workspace's voice, or of an archived one, is an irisVoiceError.
func (api *irisGenerationAPI) resolveBrandVoices(ctx context.Context, orgID string, model irisModelInfo, req irisGenerateRequest) (map[string]string, error) {
	if model.Provider != irisProviderElevenLabs || api.pool == nil {
		return nil, nil
	}
	requested := irisRequestedVoices(req)
	if len(requested) == 0 {
		return nil, nil
	}
	keys := make([]string, 0, len(requested))
	for _, voice := range requested {
		keys = append(keys, elevenlabs.NormalizeVoiceName(voice))
	}
	rows, err := api.pool.Query(ctx, `select id::text, name_key, provider_voice_id, organization_id::text = $1 and archived_at is null
from brand_voices
where provider = $2 and (
  (organization_id::text = $1 and archived_at is null and (id::text = any($3::text[]) or name_key = any($4::text[])))
  or provider_voice_id = any($3::text[]))`, orgID, irisBrandVoiceProvider, requested, keys)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]string{}
	byName := map[string]string{}
	provider := map[string]bool{}
	for rows.Next() {
		var id, nameKey, providerID string
		var usable bool
		if err := rows.Scan(&id, &nameKey, &providerID, &usable); err != nil {
			return nil, err
		}
		if usable {
			byID[id] = providerID
			byName[nameKey] = providerID
		}
		if _, ok := provider[providerID]; !ok || usable {
			provider[providerID] = usable
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	resolved := map[string]string{}
	for i, voice := range requested {
		if id, ok := byID[voice]; ok {
			resolved[voice] = id
			continue
		}
		if usable, ok := provider[voice]; ok {
			if !usable {
				return nil, &irisVoiceError{voice: voice}
			}
			resolved[voice] = voice
			continue
		}
		if id, ok := byName[keys[i]]; ok {
			resolved[voice] = id
		}
	}
	if len(resolved) == 0 {
		return nil, nil
	}
	return resolved, nil
}

// irisProviderVoice is the provider voice id a request's voice resolved to,
// or the voice as given.
func irisProviderVoice(voices map[string]string, voice string) string {
	trimmed := strings.TrimSpace(voice)
	if id, ok := voices[trimmed]; ok {
		return id
	}
	return voice
}
