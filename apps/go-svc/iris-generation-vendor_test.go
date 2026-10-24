package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
	"github.com/hyperlocalise/hyperlocalise/internal/fal"
	"github.com/stretchr/testify/require"
)

func TestIrisModelsAssignNativeProviders(t *testing.T) {
	for _, model := range irisModels() {
		switch model.Provider {
		case irisProviderElevenLabs, irisProviderFal:
			require.NotEmpty(t, model.NativeID, model.ID)
		}
	}
	voice, ok := irisModelByID("elevenlabs-v4")
	require.True(t, ok)
	require.Equal(t, irisProviderElevenLabs, voice.Provider)
	require.Equal(t, "eleven_v4", voice.NativeID)
	omni, ok := irisModelByID("kling-o3-pro")
	require.True(t, ok)
	require.Equal(t, "fal-ai/kling-video/o3/pro/text-to-video", omni.NativeID)
	require.Equal(t, "fal-ai/kling-video/o3/pro/image-to-video", omni.FalRefID)
	require.Equal(t, "fal-ai/kling-video/o3/pro/video-to-video/edit", omni.FalVideoID)
	flux, ok := irisModelByID("flux-2-pro")
	require.True(t, ok)
	require.Equal(t, irisProviderFal, flux.Provider)
	require.Equal(t, "fal-ai/flux-2-pro", flux.NativeID)
}

func TestIrisCompositeProviderUsesElevenLabs(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "xi-test", r.Header.Get("xi-api-key"))
		switch r.URL.Path {
		case "/v1/voices":
			_, _ = w.Write([]byte(`{"voices":[{"voice_id":"21m00Tcm4TlvDq8ikWAM","name":"Roger"}]}`))
		case "/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM":
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("native-mp3"))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "xi-test", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	provider := &irisCompositeProvider{elevenlabs: client, gateway: &stubIrisProvider{}}
	model, ok := irisModelByID("elevenlabs-v4")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "hello",
		Voice:  "Roger",
	})
	require.NoError(t, err)
	require.Equal(t, []byte("native-mp3"), outputs[0].Bytes)
	require.Equal(t, "eleven_v4", payload["model_id"])
}

func TestIrisCompositeProviderUsesFal(t *testing.T) {
	var submitted map[string]any
	var endpoint string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			endpoint = r.URL.Path
			require.NoError(t, json.NewDecoder(r.Body).Decode(&submitted))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"request_id":   "req_1",
				"status_url":   "http://" + r.Host + "/status",
				"response_url": "http://" + r.Host + "/result",
			})
		case r.URL.Path == "/status":
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "COMPLETED", "request_id": "req_1"})
		case r.URL.Path == "/result":
			_ = json.NewEncoder(w).Encode(map[string]any{"images": []map[string]any{{"url": "https://cdn.fal.ai/out.png"}}})
		default:
			t.Fatalf("unexpected %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := fal.NewClientWithHTTPClient(fal.Config{
		APIKey:       "fal-test",
		QueueBaseURL: server.URL,
		PollInterval: time.Millisecond,
	}, server.Client())
	require.NoError(t, err)
	provider := &irisCompositeProvider{
		fal: client,
		fetch: func(_ context.Context, rawURL string) ([]byte, string, error) {
			require.Equal(t, "https://cdn.fal.ai/out.png", rawURL)
			return []byte("png"), "image/png", nil
		},
	}
	model, ok := irisModelByID("flux-2-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:       model,
		Prompt:      "a fox",
		AspectRatio: "16:9",
		Count:       2,
	})
	require.NoError(t, err)
	require.Equal(t, []byte("png"), outputs[0].Bytes)
	require.Equal(t, "/fal-ai/flux-2-pro", endpoint)
	require.Equal(t, "a fox", submitted["prompt"])
	require.Equal(t, "landscape_16_9", submitted["image_size"])
	require.Equal(t, float64(2), submitted["num_images"])
}

func TestIrisCompositeProviderFalUsesReferenceEndpoint(t *testing.T) {
	var endpoint string
	var submitted map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			endpoint = r.URL.Path
			require.NoError(t, json.NewDecoder(r.Body).Decode(&submitted))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"request_id":   "req_1",
				"status_url":   "http://" + r.Host + "/status",
				"response_url": "http://" + r.Host + "/result",
			})
			return
		}
		if r.URL.Path == "/status" {
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "COMPLETED"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"video": map[string]any{"url": "https://cdn.fal.ai/clip.mp4"}})
	}))
	t.Cleanup(server.Close)

	client, err := fal.NewClientWithHTTPClient(fal.Config{
		APIKey:       "fal-test",
		QueueBaseURL: server.URL,
		PollInterval: time.Millisecond,
	}, server.Client())
	require.NoError(t, err)
	provider := &irisCompositeProvider{
		fal: client,
		fetch: func(_ context.Context, _ string) ([]byte, string, error) {
			return []byte("mp4"), "video/mp4", nil
		},
	}
	model, ok := irisModelByID("kling-3-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "walk",
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("frame"), ContentType: "image/png"}},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("mp4"), outputs[0].Bytes)
	require.Equal(t, "/fal-ai/kling-video/v3/pro/image-to-video", endpoint)
	require.Equal(t, "data:image/png;base64,"+base64.StdEncoding.EncodeToString([]byte("frame")), submitted["image_url"])
}

func TestIrisCompositeProviderFallsBackToGateway(t *testing.T) {
	gateway := &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("gw"), Filename: "speech.mp3", ContentType: "audio/mpeg"}}}
	provider := &irisCompositeProvider{gateway: gateway}
	model, ok := irisModelByID("elevenlabs-v4")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{Model: model, Prompt: "hello", Voice: "Roger"})
	require.NoError(t, err)
	require.Equal(t, []byte("gw"), outputs[0].Bytes)
	require.Equal(t, 1, gateway.calls)
}

func TestIrisCompositeProviderRequiresSomeBackend(t *testing.T) {
	provider := &irisCompositeProvider{}
	model, ok := irisModelByID("flux-2-pro")
	require.True(t, ok)
	_, err := provider.Generate(t.Context(), irisProviderRequest{Model: model, Prompt: "x"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "FAL_KEY")
}

func TestFalEndpointSelectsKlingO3ByInputKind(t *testing.T) {
	model, ok := irisModelByID("kling-o3-pro")
	require.True(t, ok)
	require.Equal(t, "fal-ai/kling-video/o3/pro/text-to-video", falEndpoint(irisProviderRequest{Model: model}))
	require.Equal(t, "fal-ai/kling-video/o3/pro/image-to-video", falEndpoint(irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("frame")}},
	}))
	require.Equal(t, "fal-ai/kling-video/o3/pro/image-to-video", falEndpoint(irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "start", Bytes: []byte("frame")}},
	}))
	require.Equal(t, "fal-ai/kling-video/o3/pro/video-to-video/edit", falEndpoint(irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "video", Bytes: []byte("clip")}},
	}))
	require.Equal(t, "fal-ai/kling-video/o3/pro/video-to-video/edit", falEndpoint(irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{
			{Role: "image", Bytes: []byte("frame")},
			{Role: "video", Bytes: []byte("clip")},
		},
	}))
}

func TestFalDurationSerializesPerEndpoint(t *testing.T) {
	kling, ok := irisModelByID("kling-3-pro")
	require.True(t, ok)
	input := falInput(irisProviderRequest{Model: kling, Prompt: "walk", Duration: 8})
	require.Equal(t, "8", input["duration"])

	omni, ok := irisModelByID("kling-o3-pro")
	require.True(t, ok)
	input = falInput(irisProviderRequest{Model: omni, Prompt: "walk", Duration: 10.4})
	require.Equal(t, "10", input["duration"])

	seedance, ok := irisModelByID("seedance-2.5")
	require.True(t, ok)
	input = falInput(irisProviderRequest{Model: seedance, Prompt: "walk", Duration: 12})
	require.Equal(t, "12", input["duration"])

	wan, ok := irisModelByID("wan-3.0")
	require.True(t, ok)
	input = falInput(irisProviderRequest{Model: wan, Prompt: "walk", Duration: 5})
	require.Equal(t, 5, input["duration"])

	minimax, ok := irisModelByID("minimax-h3")
	require.True(t, ok)
	input = falInput(irisProviderRequest{Model: minimax, Prompt: "walk", Duration: 7})
	require.Equal(t, 7, input["duration"])

	_, ok = falDuration("fal-ai/flux-2-pro", 0)
	require.False(t, ok)
}

func TestFalInputMapsEndFrame(t *testing.T) {
	model, ok := irisModelByID("kling-o3-pro")
	require.True(t, ok)
	startURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("start"))
	endURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("end"))
	input := falInput(irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{
			{Role: "start", Bytes: []byte("start"), ContentType: "image/png"},
			{Role: "end", Bytes: []byte("end"), ContentType: "image/png"},
		},
	})
	require.Equal(t, startURI, input["image_url"])
	require.Equal(t, endURI, input["end_image_url"])
	_, hasList := input["image_urls"]
	require.False(t, hasList)
}

func TestFalInputOmitsEmptyPrompt(t *testing.T) {
	input := falInput(irisProviderRequest{
		Model:  irisModelInfo{Kind: irisKindTool},
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("x"), ContentType: "image/png"}},
	})
	_, hasPrompt := input["prompt"]
	require.False(t, hasPrompt)
	require.Contains(t, input["image_url"], "data:image/png;base64,")
}

func TestNewIrisGenerationProviderReadsEnv(t *testing.T) {
	t.Setenv("AI_GATEWAY_API_KEY", "")
	t.Setenv("ELEVENLABS_API_KEY", "")
	t.Setenv("FAL_KEY", "")
	empty, ok := newIrisGenerationProvider().(*irisCompositeProvider)
	require.True(t, ok)
	require.Nil(t, empty.gateway)
	require.Nil(t, empty.elevenlabs)
	require.Nil(t, empty.fal)

	t.Setenv("ELEVENLABS_API_KEY", "xi")
	provider := newIrisGenerationProvider()
	composite, ok := provider.(*irisCompositeProvider)
	require.True(t, ok)
	require.NotNil(t, composite.elevenlabs)
	require.Nil(t, composite.gateway)
}

func TestGenerateElevenLabsMusicUsesNativeClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/music", r.URL.Path)
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.Contains(t, string(body), `"music_length_ms":12000`)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("song"))
	}))
	t.Cleanup(server.Close)
	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "k", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	model, ok := irisModelByID("elevenlabs-music")
	require.True(t, ok)
	outputs, err := generateElevenLabs(t.Context(), client, irisProviderRequest{
		Model:    model,
		Prompt:   "score",
		Duration: 12,
	})
	require.NoError(t, err)
	require.Equal(t, []byte("song"), outputs[0].Bytes)
}
