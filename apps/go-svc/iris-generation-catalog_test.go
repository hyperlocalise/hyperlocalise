package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newChatImageTestServer(t *testing.T, payloads *[]map[string]any, reply string) *irisGatewayProvider {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		*payloads = append(*payloads, payload)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(server.Close)
	return &irisGatewayProvider{baseURL: server.URL, apiKey: "test-key", httpClient: server.Client()}
}

const chatImageReply = `{"choices":[{"message":{"role":"assistant","content":"","images":[{"type":"image_url","image_url":{"url":"data:image/png;base64,aW1n"}}]}}]}`

func TestIrisNanoBananaModelsAreDistinct(t *testing.T) {
	want := map[string]string{
		"nano-banana-2":   "google/gemini-3.1-flash-image",
		"nano-banana-2.1": "google/gemini-nano-banana-2.1",
		"nano-banana-pro": "google/gemini-3-pro-image",
	}
	for id, gatewayID := range want {
		model, ok := irisModelByID(id)
		require.True(t, ok, id)
		require.Equal(t, gatewayID, model.GatewayID, id)
		require.True(t, irisGatewayImageUsesChat(model.GatewayID), id)
	}
}

func TestIrisFlux3VideoUsesVideoModel(t *testing.T) {
	model, ok := irisModelByID("flux-3-video")
	require.True(t, ok)
	require.Equal(t, irisKindVideo, model.Kind)
	require.Equal(t, "bfl/flux-3-video", model.GatewayID)
}

func TestImageSizeKeepsRatio(t *testing.T) {
	tests := []struct{ resolution, aspect, want string }{
		{"", "1:1", "1024x1024"},
		{"2K", "1:1", "1536x1536"},
		{"4K", "", "2048x2048"},
		{"", "16:9", "1536x1024"},
		{"", "4:3", "1536x1024"},
		{"4K", "16:9", "1536x1024"},
		{"", "9:16", "1024x1536"},
		{"2K", "3:4", "1024x1536"},
		{"", "nonsense", "1024x1024"},
	}
	for _, tt := range tests {
		require.Equal(t, tt.want, imageSize(tt.resolution, tt.aspect), "%s %s", tt.resolution, tt.aspect)
	}
}

func TestIrisImageCountIsBounded(t *testing.T) {
	require.Equal(t, 1, irisGenerateRequest{}.count())
	require.Equal(t, 1, irisGenerateRequest{"count": float64(-3)}.count())
	require.Equal(t, 4, irisGenerateRequest{"count": float64(4)}.count())
	require.Equal(t, irisMaxImageCount, irisGenerateRequest{"count": float64(1e12)}.count())
	require.Equal(t, irisMaxImageCount, irisGenerateRequest{"count": json.Number("99999999999")}.count())
}

func TestIrisGatewayProviderGeminiImageCapsCount(t *testing.T) {
	var payloads []map[string]any
	provider := newChatImageTestServer(t, &payloads, chatImageReply)
	model, ok := irisModelByID("nano-banana-pro")
	require.True(t, ok)
	_, err := provider.Generate(t.Context(), irisProviderRequest{Model: model, Prompt: "x", Count: 1_000_000})
	require.NoError(t, err)
	require.Len(t, payloads, 1)
	require.Equal(t, float64(irisMaxImageCount), payloads[0]["n"])
}

func TestIrisGatewayOnlyModelIDs(t *testing.T) {
	want := map[string]string{
		"veo-3.1":                "google/veo-3.1-generate-001",
		"veo-3.1-fast":           "google/veo-3.1-fast-generate-001",
		"grok-imagine-image-2.0": "spacexai/grok-imagine-image-2.0",
		"grok-imagine-video-1.5": "spacexai/grok-imagine-video-1.5",
		"gemini-3.8-flash-tts":   "google/gemini-3.8-flash-tts",
		"listen":                 "google/gemini-3.8-flash",
		"gpt-image-2.6-sunburst": "openai/gpt-image-2.6-sunburst",
	}
	for id, gatewayID := range want {
		model, ok := irisModelByID(id)
		require.True(t, ok, id)
		require.Equal(t, gatewayID, model.GatewayID, id)
	}
}

func TestIrisFishAudioSlashIDsResolve(t *testing.T) {
	for alias, id := range irisModelAliases {
		model, ok := irisModelByID(alias)
		require.True(t, ok, alias)
		require.Equal(t, id, model.ID, alias)
	}
	model, err := validateIrisGenerateRequest(irisGenerateRequest{"model": "fish-audio/s2.1-pro", "prompt": "hi", "voice": "v1"})
	require.NoError(t, err)
	require.Equal(t, "fish-audio-s2.1-pro", model.ID)

	req, ok := irisSyntheticCredit(irisJobRecord{ID: "j", OrgID: "o", Model: "fish-audio/s2.1-pro", Request: irisGenerateRequest{"prompt": "hi"}}, irisCreditConfig{})
	require.True(t, ok)
	require.Equal(t, "fish-audio/s2.1-pro", req.ModelID)
}
