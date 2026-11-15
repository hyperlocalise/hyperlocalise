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

func TestIrisGatewayProviderGeminiImageUsesChatCompletions(t *testing.T) {
	var payloads []map[string]any
	provider := newChatImageTestServer(t, &payloads, chatImageReply)
	model, ok := irisModelByID("nano-banana-pro")
	require.True(t, ok)

	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:       model,
		Prompt:      "a red bicycle",
		AspectRatio: "16:9",
		Resolution:  "2K",
		Count:       2,
	})
	require.NoError(t, err)
	require.Len(t, outputs, 2)
	require.Equal(t, []byte("img"), outputs[0].Bytes)
	require.Equal(t, "image-1.png", outputs[0].Filename)
	require.Len(t, payloads, 2)

	payload := payloads[0]
	require.Equal(t, "google/gemini-3-pro-image", payload["model"])
	require.Equal(t, []any{"text", "image"}, payload["modalities"])
	require.Equal(t, map[string]any{
		"google": map[string]any{"imageConfig": map[string]any{"aspectRatio": "16:9", "imageSize": "2K"}},
	}, payload["providerOptions"])
	messages := payload["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	require.Equal(t, map[string]any{"type": "text", "text": "a red bicycle"}, content[0])
}

func TestIrisGatewayProviderGeminiImageSendsReferencesAsImageParts(t *testing.T) {
	var payloads []map[string]any
	provider := newChatImageTestServer(t, &payloads, chatImageReply)
	model, ok := irisModelByID("nano-banana-2")
	require.True(t, ok)

	_, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "make it blue",
		Inputs: []irisProviderInput{
			{Role: "image", Bytes: []byte("one"), ContentType: "image/jpeg"},
			{Role: "mask", Bytes: []byte("mask"), ContentType: "image/png"},
		},
	})
	require.NoError(t, err)
	content := payloads[0]["messages"].([]any)[0].(map[string]any)["content"].([]any)
	require.Len(t, content, 4)
	require.Equal(t, "data:image/jpeg;base64,b25l", content[1].(map[string]any)["image_url"].(map[string]any)["url"])
	require.Equal(t, "text", content[2].(map[string]any)["type"])
	require.Equal(t, "data:image/png;base64,bWFzaw==", content[3].(map[string]any)["image_url"].(map[string]any)["url"])
	require.NotContains(t, payloads[0], "providerOptions")
}

func TestDecodeChatImageReportsTextOnlyReply(t *testing.T) {
	_, err := decodeChatImage(t.Context(), []byte(`{"choices":[{"message":{"content":"I can't draw that."}}]}`))
	require.ErrorContains(t, err, "I can't draw that.")
}

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
		require.True(t, isIrisChatImageModel(model.GatewayID), id)
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
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{Model: model, Prompt: "x", Count: 1_000_000})
	require.NoError(t, err)
	require.Len(t, outputs, irisMaxImageCount)
	require.Len(t, payloads, irisMaxImageCount)
}

func TestIrisGatewayOnlyModelIDs(t *testing.T) {
	want := map[string]string{
		"veo-3.1":                "google/veo-3.1-generate-001",
		"veo-3.1-fast":           "google/veo-3.1-fast-generate-001",
		"grok-imagine-image-2.0": "spacexai/grok-imagine-image-2.0",
		"grok-imagine-video-1.5": "spacexai/grok-imagine-video-1.5",
		"gemini-3.8-flash-tts":   "google/gemini-3.8-flash-tts",
		"qwen3.8-omni-flash":     "alibaba/qwen3.8-omni-flash",
		"gpt-image-2.6-sunburst": "openai/gpt-image-2.6-sunburst",
	}
	for id, gatewayID := range want {
		model, ok := irisModelByID(id)
		require.True(t, ok, id)
		require.Equal(t, gatewayID, model.GatewayID, id)
	}
}
