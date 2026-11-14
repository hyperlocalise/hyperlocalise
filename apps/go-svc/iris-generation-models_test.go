package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const irisTestAssetID = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

func TestIrisPublicModelsExposeCatalog(t *testing.T) {
	models := irisModels()
	public := irisPublicModels()
	require.Len(t, public, len(models))
	seen := map[string]struct{}{}
	for i, model := range models {
		require.NotEmpty(t, model.ID)
		require.NotEmpty(t, model.Name)
		require.NotEmpty(t, model.Kind)
		require.Equal(t, map[string]any{"id": model.ID, "name": model.Name}, public[i])
		_, ok := irisModelByID(model.ID)
		require.True(t, ok, model.ID)
		_, dup := seen[model.ID]
		require.False(t, dup, "duplicate model id %s", model.ID)
		seen[model.ID] = struct{}{}
	}
	_, ok := irisModelByID("missing-model")
	require.False(t, ok)
}

func TestIrisGenerateRequestFieldAccessors(t *testing.T) {
	req := irisGenerateRequest{
		"model":        "  veo-3.1  ",
		"prompt":       "  hello  ",
		"voice":        " Roger ",
		"languageCode": " en-AU ",
		"count":        json.Number("3"),
		"duration":     json.Number("12.5"),
	}
	require.Equal(t, "veo-3.1", req.modelID())
	require.Equal(t, "hello", req.prompt())
	require.Equal(t, "Roger", req.voice())
	require.Equal(t, "en-AU", req.languageCode())
	require.Equal(t, 3, req.count())
	require.Equal(t, 12.5, req.duration())
	require.Equal(t, 2, irisGenerateRequest{"count": 2}.count())
	require.Equal(t, 4, irisGenerateRequest{"count": float64(4)}.count())
	require.Equal(t, 1, irisGenerateRequest{}.count())
	require.Equal(t, 8.0, irisGenerateRequest{"duration": 8}.duration())
	require.Equal(t, 9.5, irisGenerateRequest{"duration": 9.5}.duration())
	require.Equal(t, 0.0, irisGenerateRequest{}.duration())
}

func TestDecodeAssetRef(t *testing.T) {
	ref, ok := decodeAssetRef(map[string]any{"kind": "asset", "id": strings.ToUpper(irisTestAssetID)})
	require.True(t, ok)
	require.Equal(t, irisAssetRef{Kind: "asset", ID: irisTestAssetID}, ref)

	for _, value := range []any{
		"asset",
		map[string]any{"kind": "url", "url": "https://example.com/a.png"},
		map[string]any{"kind": "asset", "id": "not-a-hash"},
		map[string]any{"kind": "asset", "id": strings.Repeat("g", 64)},
		map[string]any{"kind": "asset", "id": irisTestAssetID[:63]},
	} {
		_, ok := decodeAssetRef(value)
		require.False(t, ok, "%v", value)
	}

	req := irisGenerateRequest{
		"image": map[string]any{"kind": "asset", "id": irisTestAssetID},
		"images": []any{
			map[string]any{"kind": "asset", "id": irisTestAssetID},
			map[string]any{"kind": "url", "url": "https://example.com/a.png"},
			"skip",
		},
	}
	image, ok := req.asset("image")
	require.True(t, ok)
	require.Equal(t, irisTestAssetID, image.ID)
	require.Equal(t, []irisAssetRef{{Kind: "asset", ID: irisTestAssetID}}, req.assets("images"))
	require.Nil(t, req.assets("image"))
}

func TestIsSHA256(t *testing.T) {
	require.True(t, isSHA256(irisTestAssetID))
	require.False(t, isSHA256(""))
	require.False(t, isSHA256(strings.ToUpper(irisTestAssetID)))
	require.False(t, isSHA256(irisTestAssetID[:63]+"G"))
	require.False(t, isSHA256(irisTestAssetID+"0"))
}

func TestValidateIrisGenerateRequest(t *testing.T) {
	asset := map[string]any{"kind": "asset", "id": irisTestAssetID}
	urlAsset := map[string]any{"kind": "url", "url": "https://cdn.example.com/a.png"}

	tests := []struct {
		name    string
		req     irisGenerateRequest
		wantErr string
		wantID  string
	}{
		{
			name:    "unknown model",
			req:     irisGenerateRequest{"model": "nope", "prompt": "hello"},
			wantErr: "unknown model",
		},
		{
			name:    "image requires prompt",
			req:     irisGenerateRequest{"model": "flux-2-pro"},
			wantErr: "prompt is required",
			wantID:  "flux-2-pro",
		},
		{
			name:    "prompt too long",
			req:     irisGenerateRequest{"model": "veo-3.1", "prompt": strings.Repeat("x", 4001)},
			wantErr: "prompt is too long",
			wantID:  "veo-3.1",
		},
		{
			name:    "voice requires voice",
			req:     irisGenerateRequest{"model": "elevenlabs-v4", "prompt": "hello"},
			wantErr: "voice is required",
			wantID:  "elevenlabs-v4",
		},
		{
			name:    "fish audio voice requires voice",
			req:     irisGenerateRequest{"model": "fish-audio-s2.1-pro", "prompt": "hello"},
			wantErr: "voice is required",
			wantID:  "fish-audio-s2.1-pro",
		},
		{
			name:    "remote image url rejected",
			req:     irisGenerateRequest{"model": "flux-2-pro", "prompt": "hello", "image": urlAsset},
			wantErr: "remote asset URLs are not supported; upload the file first",
		},
		{
			name:    "remote images array rejected",
			req:     irisGenerateRequest{"model": "flux-2-pro", "prompt": "hello", "images": []any{urlAsset}},
			wantErr: "remote asset URLs are not supported; upload the file first",
		},
		{
			name:    "remote startFrame rejected",
			req:     irisGenerateRequest{"model": "kling-3-pro", "prompt": "hello", "startFrame": urlAsset},
			wantErr: "remote asset URLs are not supported; upload the file first",
		},
		{
			name:    "remote endFrame rejected",
			req:     irisGenerateRequest{"model": "kling-3-pro", "prompt": "hello", "endFrame": urlAsset},
			wantErr: "remote asset URLs are not supported; upload the file first",
		},
		{
			name:    "remote video rejected",
			req:     irisGenerateRequest{"model": "kling-o3-pro", "prompt": "hello", "video": urlAsset},
			wantErr: "remote asset URLs are not supported; upload the file first",
		},
		{
			name:    "seedvr requires image",
			req:     irisGenerateRequest{"model": "seedvr-2"},
			wantErr: "image is required",
			wantID:  "seedvr-2",
		},
		{
			name:   "prompt at max runes is accepted",
			req:    irisGenerateRequest{"model": "veo-3.1", "prompt": strings.Repeat("x", 4000)},
			wantID: "veo-3.1",
		},
		{
			name:   "valid seedvr with uploaded image",
			req:    irisGenerateRequest{"model": "seedvr-2", "image": asset},
			wantID: "seedvr-2",
		},
		{
			name:    "background removal requires image",
			req:     irisGenerateRequest{"model": "bria-rmbg-2.0"},
			wantErr: "image is required",
			wantID:  "bria-rmbg-2.0",
		},
		{
			name:    "upscaler requires video",
			req:     irisGenerateRequest{"model": "bytedance-upscaler"},
			wantErr: "video is required",
			wantID:  "bytedance-upscaler",
		},
		{
			name:    "transcribe requires audio",
			req:     irisGenerateRequest{"model": "universal-3.5-pro"},
			wantErr: "audio is required",
			wantID:  "universal-3.5-pro",
		},
		{
			name:    "fish audio transcribe requires audio",
			req:     irisGenerateRequest{"model": "fish-audio-transcribe-1"},
			wantErr: "audio is required",
			wantID:  "fish-audio-transcribe-1",
		},
		{
			name:    "transcribe rejects scene audio",
			req:     irisGenerateRequest{"model": "universal-3.5-pro", "audio": map[string]any{"scene": "intro"}},
			wantErr: "scene audio references are not supported; upload the file first",
			wantID:  "universal-3.5-pro",
		},
		{
			name:    "omni requires media",
			req:     irisGenerateRequest{"model": "qwen3.8-omni-flash"},
			wantErr: "media is required",
			wantID:  "qwen3.8-omni-flash",
		},
		{
			name:   "valid image",
			req:    irisGenerateRequest{"model": "flux-2-pro", "prompt": "a cat"},
			wantID: "flux-2-pro",
		},
		{
			name:   "valid voice",
			req:    irisGenerateRequest{"model": "elevenlabs-v4", "prompt": "hello", "voice": "Roger"},
			wantID: "elevenlabs-v4",
		},
		{
			name:   "valid fish audio voice",
			req:    irisGenerateRequest{"model": "fish-audio-drama-3", "prompt": "hello", "voice": "933563129e564b19a115bedd57b7406a"},
			wantID: "fish-audio-drama-3",
		},
		{
			name:   "valid tool with uploaded image",
			req:    irisGenerateRequest{"model": "bria-rmbg-2.0", "image": asset},
			wantID: "bria-rmbg-2.0",
		},
		{
			name:   "valid tool with uploaded video",
			req:    irisGenerateRequest{"model": "bytedance-upscaler", "video": asset},
			wantID: "bytedance-upscaler",
		},
		{
			name:   "valid tool with uploaded audio",
			req:    irisGenerateRequest{"model": "universal-3.5-pro", "audio": asset},
			wantID: "universal-3.5-pro",
		},
		{
			name:   "valid fish audio transcribe",
			req:    irisGenerateRequest{"model": "fish-audio-transcribe-1", "audio": asset},
			wantID: "fish-audio-transcribe-1",
		},
		{
			name:   "valid tool with uploaded media",
			req:    irisGenerateRequest{"model": "qwen3.8-omni-flash", "media": asset},
			wantID: "qwen3.8-omni-flash",
		},
		{
			name:   "seedance takes references",
			req:    irisGenerateRequest{"model": "seedance-2.5", "prompt": "@Image1 in @Image2", "images": []any{asset, asset}},
			wantID: "seedance-2.5",
		},
		{
			name:    "seedance takes references or frames, not both",
			req:     irisGenerateRequest{"model": "seedance-2.5", "prompt": "@Image1 wakes", "images": []any{asset}, "startFrame": asset},
			wantErr: "seedance-2.5 takes reference images or frames, not both",
			wantID:  "seedance-2.5",
		},
		{
			name:   "kling omni takes references with a start frame",
			req:    irisGenerateRequest{"model": "kling-o3-pro", "prompt": "@Image1 wakes", "images": []any{asset}, "startFrame": asset},
			wantID: "kling-o3-pro",
		},
		{
			name:    "kling omni takes at most 4 references",
			req:     irisGenerateRequest{"model": "kling-o3-pro", "prompt": "a crowd", "images": []any{asset, asset, asset, asset, asset}},
			wantErr: "kling-o3-pro takes at most 4 reference images",
			wantID:  "kling-o3-pro",
		},
		{
			name:   "valid lyria with a mood image",
			req:    irisGenerateRequest{"model": "lyria-3-pro", "prompt": "breezy pop, 48 seconds", "images": []any{asset}},
			wantID: "lyria-3-pro",
		},
		{
			name:    "lyria takes one image",
			req:     irisGenerateRequest{"model": "lyria-3-pro", "prompt": "breezy pop", "images": []any{asset, asset}},
			wantErr: "lyria-3-pro takes at most 1 image",
			wantID:  "lyria-3-pro",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			model, err := validateIrisGenerateRequest(tc.req)
			if tc.wantErr != "" {
				require.EqualError(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
			}
			if tc.wantID != "" {
				require.Equal(t, tc.wantID, model.ID)
			}
		})
	}
}

func TestEstimateIrisRequest(t *testing.T) {
	estimate, model, err := estimateIrisRequest(irisGenerateRequest{"model": "flux-2-pro", "prompt": "a cat"})
	require.NoError(t, err)
	require.Equal(t, "flux-2-pro", model.ID)
	require.True(t, estimate.Allowed)
	require.Equal(t, "ai_tokens", estimate.FeatureID)
	require.Equal(t, irisEstimateUnitUSD, estimate.Unit)
	require.Equal(t, model.ETASeconds, estimate.ETASeconds)

	_, _, err = estimateIrisRequest(irisGenerateRequest{"model": "flux-2-pro"})
	require.EqualError(t, err, "prompt is required")
}
