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
