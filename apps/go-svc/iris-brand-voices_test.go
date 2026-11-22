package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/stretchr/testify/require"
)

type fakeVoiceLibrary struct {
	mu      sync.Mutex
	nextID  string
	clones  []elevenlabs.CloneVoiceRequest
	saves   []elevenlabs.SaveVoiceRequest
	deleted []string
	err     error
}

func (f *fakeVoiceLibrary) CloneVoice(_ context.Context, req elevenlabs.CloneVoiceRequest) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return "", f.err
	}
	f.clones = append(f.clones, req)
	return f.nextID, nil
}

func (f *fakeVoiceLibrary) SaveVoice(_ context.Context, req elevenlabs.SaveVoiceRequest) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return "", f.err
	}
	f.saves = append(f.saves, req)
	return f.nextID, nil
}

func (f *fakeVoiceLibrary) DeleteVoice(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.deleted = append(f.deleted, id)
	return nil
}

// brandVoiceFixture is an Iris API on a seeded workspace with the given
// role, at irisTestPath.
func brandVoiceFixture(t *testing.T, role string) (*irisGenerationAPI, *testenv.Scope, *fakeVoiceLibrary, *stubIrisProvider) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{Filename: "speech.mp3", ContentType: "audio/mpeg", Bytes: []byte("mp3")}}}
	api := newIrisGenerationFixture(t, provider)
	api.pool = scope.Pool
	library := &fakeVoiceLibrary{nextID: "c38kUX8pkfYO2kHyqfFy"}
	api.voices = library
	api.resolve = func(_ context.Context, _ AuthClaims, slug string) (irisOrgScope, error) {
		if slug != "acme" {
			return irisOrgScope{}, publicauth.AccessDenied()
		}
		return irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: role}, nil
	}
	return api, scope, library, provider
}

func putIrisSample(t *testing.T, api *irisGenerationAPI, orgID, contentType, body string) irisAssetRef {
	t.Helper()
	sum := sha256.Sum256([]byte(body))
	sha := hex.EncodeToString(sum[:])
	require.NoError(t, api.putBytes(t.Context(), irisUploadKey(orgID, sha), contentType, []byte(body)))
	return irisAssetRef{Kind: "asset", ID: sha}
}

func decodeBrandVoice(t *testing.T, body string) irisBrandVoice {
	t.Helper()
	var voice irisBrandVoice
	require.NoError(t, json.Unmarshal([]byte(body), &voice))
	return voice
}

func TestValidateIrisBrandVoiceInput(t *testing.T) {
	name := func(value string) *string { return &value }

	input, err := validateIrisBrandVoiceInput(irisBrandVoiceFields{
		Name:        name("  Acme   CEO "),
		Description: name(" Warm "),
		Language:    name(" en-US "),
		Labels:      &map[string]string{" accent ": " Australian "},
	})
	require.NoError(t, err)
	require.Equal(t, "Acme CEO", input.Name)
	require.Equal(t, "acmeceo", input.NameKey)
	require.Equal(t, "Warm", input.Description)
	require.Equal(t, "en-US", *input.Language)
	require.Equal(t, map[string]string{"accent": "Australian"}, input.Labels)

	_, err = validateIrisBrandVoiceInput(irisBrandVoiceFields{})
	require.ErrorContains(t, err, "name is required")
	_, err = validateIrisBrandVoiceInput(irisBrandVoiceFields{Name: name("---")})
	require.ErrorContains(t, err, "name is required")
	_, err = validateIrisBrandVoiceInput(irisBrandVoiceFields{Name: name(strings.Repeat("a", irisMaxBrandVoiceName+1))})
	require.ErrorContains(t, err, "name takes at most")
	_, err = validateIrisBrandVoiceInput(irisBrandVoiceFields{Name: name("Voice"), Labels: &map[string]string{"": "x"}})
	require.ErrorContains(t, err, "label keys")
}

func TestIrisRequestedVoicesAndProviderVoice(t *testing.T) {
	req := irisGenerateRequest{
		"voice": " Acme CEO ",
		"lines": []any{
			map[string]any{"text": "Hi", "voice": "Acme CEO"},
			map[string]any{"text": "Hey", "voice": "Roger"},
		},
	}
	require.Equal(t, []string{"Acme CEO", "Roger"}, irisRequestedVoices(req))

	voices := map[string]string{"Acme CEO": "c38kUX8pkfYO2kHyqfFy"}
	require.Equal(t, "c38kUX8pkfYO2kHyqfFy", irisProviderVoice(voices, " Acme CEO "))
	require.Equal(t, "Roger", irisProviderVoice(voices, "Roger"))
	require.Equal(t, "Roger", irisProviderVoice(nil, "Roger"))
}

func TestResolveBrandVoicesSkipsWithoutDatabaseOrElevenLabs(t *testing.T) {
	api := &irisGenerationAPI{}
	model, ok := irisModelByID("elevenlabs-v3")
	require.True(t, ok)
	voices, err := api.resolveBrandVoices(t.Context(), "org", model, irisGenerateRequest{"voice": "Acme CEO"})
	require.NoError(t, err)
	require.Nil(t, voices)
}

func TestBrandVoicesRequireManagerToChange(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})
	api.voices = &fakeVoiceLibrary{}
	api.resolve = func(context.Context, AuthClaims, string) (irisOrgScope, error) {
		return irisOrgScope{OrganizationID: "org", UserID: "user", Role: "translator"}, nil
	}
	for _, call := range []struct{ method, path string }{
		{http.MethodPost, irisTestPath + "/brand/voices/clone"},
		{http.MethodPost, irisTestPath + "/brand/voices/designed"},
		{http.MethodPatch, irisTestPath + "/brand/voices/abc"},
		{http.MethodDelete, irisTestPath + "/brand/voices/abc"},
	} {
		rec := irisRequest(api, call.method, call.path, map[string]any{})
		require.Equal(t, http.StatusForbidden, rec.Code, call.path)
	}
}

func TestBrandVoiceCloneLifecycle(t *testing.T) {
	api, scope, library, _ := brandVoiceFixture(t, "admin")
	sample := putIrisSample(t, api, scope.OrganizationID, "audio/mpeg", "speaker-recording")

	t.Run("refuses a clone without consent", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/clone", map[string]any{
			"name": "Acme CEO", "samples": []irisAssetRef{sample},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), `"consent_required"`)
		require.Contains(t, rec.Body.String(), irisVoiceConsentVersion)
		require.Empty(t, library.clones)
	})

	t.Run("refuses samples that are not audio or video", func(t *testing.T) {
		text := putIrisSample(t, api, scope.OrganizationID, "text/plain", "not audio")
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/clone", map[string]any{
			"name": "Acme CEO", "samples": []irisAssetRef{text}, "consentVersion": irisVoiceConsentVersion,
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "must be audio or video")
	})

	var voice irisBrandVoice
	t.Run("clones from uploaded samples", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/clone", map[string]any{
			"name":           "Acme CEO",
			"description":    "Warm, measured",
			"language":       "en-AU",
			"labels":         map[string]string{"accent": "Australian"},
			"samples":        []irisAssetRef{sample},
			"consentVersion": irisVoiceConsentVersion,
		})
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		voice = decodeBrandVoice(t, rec.Body.String())
		require.Equal(t, "Acme CEO", voice.Name)
		require.Equal(t, irisBrandVoiceSourceClone, voice.Source)
		require.Equal(t, "en-AU", *voice.Language)
		require.NotNil(t, voice.ConsentedAt)
		require.NotContains(t, rec.Body.String(), "c38kUX8pkfYO2kHyqfFy", "the provider voice id stays on the server")

		require.Len(t, library.clones, 1)
		clone := library.clones[0]
		require.Equal(t, "Acme CEO", clone.Name)
		require.Equal(t, scope.OrganizationID, clone.Labels["workspace"])
		require.Equal(t, []elevenlabs.VoiceSample{{Bytes: []byte("speaker-recording"), ContentType: "audio/mpeg"}}, clone.Samples)

		var consentBy, consentVersion string
		var samples []string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select consent_by_user_id::text, consent_version, sample_asset_ids from brand_voices where id = $1`, voice.ID).
			Scan(&consentBy, &consentVersion, &samples))
		require.Equal(t, scope.UserID, consentBy)
		require.Equal(t, irisVoiceConsentVersion, consentVersion)
		require.Equal(t, []string{sample.ID}, samples)
	})

	t.Run("refuses a second voice with the same name", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/clone", map[string]any{
			"name": "acme-ceo", "samples": []irisAssetRef{sample}, "consentVersion": irisVoiceConsentVersion,
		})
		require.Equal(t, http.StatusConflict, rec.Code)
		require.Len(t, library.clones, 1)
	})

	t.Run("refuses voices past the workspace limit", func(t *testing.T) {
		t.Setenv("IRIS_BRAND_VOICE_LIMIT", "1")
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/clone", map[string]any{
			"name": "Narrator", "samples": []irisAssetRef{sample}, "consentVersion": irisVoiceConsentVersion,
		})
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "brand_voice_limit_reached")
		require.Len(t, library.clones, 1)
	})

	t.Run("lists the workspace's voices", func(t *testing.T) {
		rec := irisRequest(api, http.MethodGet, irisTestPath+"/brand/voices", nil)
		require.Equal(t, http.StatusOK, rec.Code)
		var body struct {
			Voices         []irisBrandVoice `json:"voices"`
			Limit          int              `json:"limit"`
			ConsentVersion string           `json:"consentVersion"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Voices, 1)
		require.Equal(t, voice.ID, body.Voices[0].ID)
		require.Equal(t, irisDefaultBrandVoiceLimit, body.Limit)
		require.Equal(t, irisVoiceConsentVersion, body.ConsentVersion)
	})

	t.Run("renames the voice", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPatch, irisTestPath+"/brand/voices/"+voice.ID, map[string]any{"name": "Founder"})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		renamed := decodeBrandVoice(t, rec.Body.String())
		require.Equal(t, "Founder", renamed.Name)
		require.Equal(t, "Warm, measured", renamed.Description)
		require.Equal(t, map[string]string{"accent": "Australian"}, renamed.Labels)
	})

	t.Run("deletes the provider voice and archives the row", func(t *testing.T) {
		rec := irisRequest(api, http.MethodDelete, irisTestPath+"/brand/voices/"+voice.ID, nil)
		require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
		require.Equal(t, []string{"c38kUX8pkfYO2kHyqfFy"}, library.deleted)

		rec = irisRequest(api, http.MethodGet, irisTestPath+"/brand/voices", nil)
		require.Contains(t, rec.Body.String(), `"voices":[]`)
		rec = irisRequest(api, http.MethodDelete, irisTestPath+"/brand/voices/"+voice.ID, nil)
		require.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestBrandVoiceSavesDesignedPreview(t *testing.T) {
	api, scope, library, _ := brandVoiceFixture(t, "localization_manager")
	library.nextID = "d48kUX8pkfYO2kHyqfFy"

	rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/designed", map[string]any{"name": "Robot"})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "generatedVoiceId is required")

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/designed", map[string]any{
		"name": "Robot", "generatedVoiceId": "preview-1",
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	voice := decodeBrandVoice(t, rec.Body.String())
	require.Equal(t, irisBrandVoiceSourceDesign, voice.Source)
	require.Nil(t, voice.ConsentedAt)
	require.Len(t, library.saves, 1)
	require.Equal(t, "preview-1", library.saves[0].GeneratedVoiceID)
	require.Equal(t, scope.OrganizationID, library.saves[0].Labels["workspace"])
}

func TestBrandVoiceRemovesProviderVoiceWhenRowFails(t *testing.T) {
	api, scope, library, _ := brandVoiceFixture(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	_, err := scope.Pool.Exec(t.Context(), `insert into brand_voices (organization_id, name, name_key, provider, provider_voice_id, source)
values ($1, 'Taken', 'taken', 'elevenlabs', 'e58kUX8pkfYO2kHyqfFy', 'design')`, other.OrganizationID)
	require.NoError(t, err)
	library.nextID = "e58kUX8pkfYO2kHyqfFy"

	rec := irisRequest(api, http.MethodPost, irisTestPath+"/brand/voices/designed", map[string]any{
		"name": "Mine", "generatedVoiceId": "preview-2",
	})
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Equal(t, []string{"e58kUX8pkfYO2kHyqfFy"}, library.deleted)
}

func TestGenerateResolvesBrandVoicesForTheirWorkspaceOnly(t *testing.T) {
	api, scope, _, provider := brandVoiceFixture(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})

	var ownID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `insert into brand_voices (organization_id, name, name_key, provider, provider_voice_id, source)
values ($1, 'Acme CEO', 'acmeceo', 'elevenlabs', 'c38kUX8pkfYO2kHyqfFy', 'design') returning id::text`, scope.OrganizationID).Scan(&ownID))
	_, err := scope.Pool.Exec(t.Context(), `insert into brand_voices (organization_id, name, name_key, provider, provider_voice_id, source, archived_at)
values ($1, 'Old', 'old', 'elevenlabs', 'f68kUX8pkfYO2kHyqfFy', 'design', now())`, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `insert into brand_voices (organization_id, name, name_key, provider, provider_voice_id, source)
values ($1, 'Rival CEO', 'rivalceo', 'elevenlabs', 'g78kUX8pkfYO2kHyqfFy', 'design')`, other.OrganizationID)
	require.NoError(t, err)

	generate := func(t *testing.T, key string, request irisGenerateRequest) int {
		t.Helper()
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{"request": request, "idempotencyKey": key})
		return rec.Code
	}

	t.Run("by name", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "by-name", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "acme ceo"}))
		require.Equal(t, "c38kUX8pkfYO2kHyqfFy", provider.last.Voice)
	})

	t.Run("by id", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "by-id", irisGenerateRequest{"model": "elevenlabs-v4", "prompt": "Hello", "voice": ownID}))
		require.Equal(t, "c38kUX8pkfYO2kHyqfFy", provider.last.Voice)
	})

	t.Run("in dialogue lines", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "dialogue", irisGenerateRequest{
			"model":  "elevenlabs-dialogue",
			"prompt": "Dialogue",
			"lines": []any{
				map[string]any{"text": "Hi", "voice": "Acme CEO"},
				map[string]any{"text": "Hey", "voice": "Roger"},
			},
		}))
		require.Equal(t, map[string]string{"Acme CEO": "c38kUX8pkfYO2kHyqfFy"}, provider.last.Voices)
	})

	t.Run("stock voices pass through", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "stock", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "JBFqnCBsd6RMkjVDRZzb"}))
		require.Equal(t, "JBFqnCBsd6RMkjVDRZzb", provider.last.Voice)
	})

	t.Run("another workspace's voice name is not resolved", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "rival-name", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "Rival CEO"}))
		require.Equal(t, "Rival CEO", provider.last.Voice, "left to ElevenLabs, which resolves premade names only")
	})

	t.Run("another workspace's provider voice id is refused", func(t *testing.T) {
		calls := provider.calls
		require.Equal(t, http.StatusBadRequest, generate(t, "rival-id", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "g78kUX8pkfYO2kHyqfFy"}))
		require.Equal(t, http.StatusBadRequest, generate(t, "rival-line", irisGenerateRequest{
			"model":  "elevenlabs-dialogue",
			"prompt": "Dialogue",
			"lines":  []any{map[string]any{"text": "Hi", "voice": "g78kUX8pkfYO2kHyqfFy"}},
		}))
		require.Equal(t, calls, provider.calls)
	})

	t.Run("an archived voice's provider id is refused", func(t *testing.T) {
		require.Equal(t, http.StatusBadRequest, generate(t, "archived", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "f68kUX8pkfYO2kHyqfFy"}))
	})

	t.Run("its own provider voice id is allowed", func(t *testing.T) {
		require.Equal(t, http.StatusOK, generate(t, "own-id", irisGenerateRequest{"model": "elevenlabs-v3", "prompt": "Hello", "voice": "c38kUX8pkfYO2kHyqfFy"}))
		require.Equal(t, "c38kUX8pkfYO2kHyqfFy", provider.last.Voice)
	})
}
