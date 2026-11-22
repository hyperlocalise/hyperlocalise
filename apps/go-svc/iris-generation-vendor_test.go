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
	fish, ok := irisModelByID("fish-audio-s2.1-pro")
	require.True(t, ok)
	require.Equal(t, irisProviderGateway, fish.Provider)
	require.Equal(t, "fish-audio/s2.1-pro", fish.GatewayID)
	transcribe, ok := irisModelByID("fish-audio-transcribe-1")
	require.True(t, ok)
	require.Equal(t, irisProviderGateway, transcribe.Provider)
	require.Equal(t, "fish-audio/transcribe-1", transcribe.GatewayID)
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
			_, _ = w.Write([]byte(`{"voices":[{"voice_id":"21m00Tcm4TlvDq8ikWAM","name":"Roger","category":"premade"}]}`))
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

func TestIrisCompositeProviderSendsBrandVoicesInDialogue(t *testing.T) {
	var payload struct {
		Inputs []struct {
			Text    string `json:"text"`
			VoiceID string `json:"voice_id"`
		} `json:"inputs"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/voices":
			_, _ = w.Write([]byte(`{"voices":[{"voice_id":"21m00Tcm4TlvDq8ikWAM","name":"Roger","category":"premade"}]}`))
		case "/v1/text-to-dialogue":
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("dialogue-mp3"))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "xi-test", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	provider := &irisCompositeProvider{elevenlabs: client}
	model, ok := irisModelByID("elevenlabs-dialogue")
	require.True(t, ok)
	_, err = provider.Generate(t.Context(), irisProviderRequest{
		Model: model,
		Fields: irisGenerateRequest{"lines": []any{
			map[string]any{"text": "Hi", "voice": "Acme CEO"},
			map[string]any{"text": "Hey", "voice": "Roger"},
		}},
		Voices: map[string]string{"Acme CEO": "c38kUX8pkfYO2kHyqfFy"},
	})
	require.NoError(t, err)
	require.Len(t, payload.Inputs, 2)
	require.Equal(t, "c38kUX8pkfYO2kHyqfFy", payload.Inputs[0].VoiceID)
	require.Equal(t, "21m00Tcm4TlvDq8ikWAM", payload.Inputs[1].VoiceID)
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

func TestIrisCompositeProviderRoutesFishAudioToGateway(t *testing.T) {
	gateway := &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("fish"), Filename: "speech.mp3", ContentType: "audio/mpeg"}}}
	provider := &irisCompositeProvider{gateway: gateway, elevenlabs: &elevenlabs.Client{}}
	model, ok := irisModelByID("fish-audio-s2.1-pro")
	require.True(t, ok)
	require.Equal(t, irisProviderGateway, model.Provider)
	require.Equal(t, "fish-audio/s2.1-pro", model.GatewayID)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{Model: model, Prompt: "hello", Voice: "voice-id"})
	require.NoError(t, err)
	require.Equal(t, []byte("fish"), outputs[0].Bytes)
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
	require.Equal(t, "fal-ai/kling-video/o3/pro/reference-to-video", falEndpoint(irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("founder")}},
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

func TestFalInputSendsVideoReferences(t *testing.T) {
	uri := func(s string) string { return "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte(s)) }
	inputs := []irisProviderInput{
		{Role: "start", Bytes: []byte("keyframe"), ContentType: "image/png"},
		{Role: "image", Bytes: []byte("founder"), ContentType: "image/png"},
		{Role: "image", Bytes: []byte("bedroom"), ContentType: "image/png"},
	}

	seedance, ok := irisModelByID("seedance-2.5")
	require.True(t, ok)
	req := irisProviderRequest{Model: seedance, Prompt: "@Image1 in @Image2", Duration: 10, AspectRatio: "16:9", Inputs: inputs}
	require.Equal(t, "bytedance/seedance-2.5/reference-to-video", falEndpoint(req))
	input := falInput(req)
	require.Equal(t, []string{uri("founder"), uri("bedroom")}, input["image_urls"])
	require.Equal(t, "10", input["duration"])
	require.Equal(t, "16:9", input["aspect_ratio"])
	for _, key := range []string{"image_url", "start_image_url", "end_image_url"} {
		_, has := input[key]
		require.False(t, has, key)
	}

	omni, ok := irisModelByID("kling-o3-pro")
	require.True(t, ok)
	input = falInput(irisProviderRequest{Model: omni, Prompt: "@Image1 wakes", Inputs: inputs})
	require.Equal(t, []string{uri("founder"), uri("bedroom")}, input["image_urls"])
	require.Equal(t, uri("keyframe"), input["start_image_url"])
	_, hasImageURL := input["image_url"]
	require.False(t, hasImageURL)
}

func TestIrisCompositeProviderFalMakesLyriaMusic(t *testing.T) {
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
		_ = json.NewEncoder(w).Encode(map[string]any{
			"audio":  map[string]any{"url": "https://cdn.fal.ai/files/track", "content_type": "audio/mpeg"},
			"lyrics": "",
		})
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
			require.Equal(t, "https://cdn.fal.ai/files/track", rawURL)
			return []byte("mp3"), "", nil
		},
	}
	model, ok := irisModelByID("lyria-3-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "Breezy corporate pop at 112 BPM. A 48-second track.",
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("mood"), ContentType: "image/png"}},
	})
	require.NoError(t, err)
	require.Equal(t, "/fal-ai/lyria3/pro", endpoint)
	require.Equal(t, "Breezy corporate pop at 112 BPM. A 48-second track.", submitted["prompt"])
	require.Equal(t, "data:image/png;base64,"+base64.StdEncoding.EncodeToString([]byte("mood")), submitted["image_url"])
	_, hasDuration := submitted["duration"]
	require.False(t, hasDuration)
	require.Equal(t, []byte("mp3"), outputs[0].Bytes)
	require.Equal(t, "track", outputs[0].Filename)
	require.Equal(t, "audio/mpeg", outputs[0].ContentType)
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
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ELEVENLABS_API_KEY", "")
	t.Setenv("FAL_KEY", "")
	empty, ok := newIrisGenerationProvider().(*irisCompositeProvider)
	require.True(t, ok)
	require.Nil(t, empty.gateway)
	require.Nil(t, empty.openai)
	require.Nil(t, empty.elevenlabs)
	require.Nil(t, empty.fal)
	_, err := empty.Generate(t.Context(), irisProviderRequest{
		Model: irisModelInfo{ID: "image-text", Kind: irisKindTool, Provider: irisProviderGateway, GatewayID: defaultGuidelineCheckModel},
	})
	require.ErrorContains(t, err, "generation provider is not configured")
	require.ErrorContains(t, err, "OPENAI_API_KEY")

	t.Setenv("OPENAI_API_KEY", "sk-test")
	withOpenAI := newIrisGenerationProvider().(*irisCompositeProvider)
	require.Nil(t, withOpenAI.gateway)
	require.NotNil(t, withOpenAI.openai)
	openai, ok := withOpenAI.openai.(*irisGatewayProvider)
	require.True(t, ok)
	require.Equal(t, defaultIrisOpenAIBaseURL, openai.baseURL)
	require.Equal(t, "sk-test", openai.apiKey)

	imageText, ok := irisModelByID("image-text")
	require.True(t, ok)
	require.True(t, irisModelUsesOpenAI(imageText))
	imageLocalise, ok := irisModelByID("image-localise")
	require.True(t, ok)
	require.True(t, irisModelUsesOpenAI(imageLocalise))
	nano, ok := irisModelByID("nano-banana-2.1")
	require.True(t, ok)
	require.False(t, irisModelUsesOpenAI(nano))
	_, err = withOpenAI.Generate(t.Context(), irisProviderRequest{Model: nano})
	require.ErrorContains(t, err, "requires AI_GATEWAY_API_KEY")
	require.ErrorContains(t, err, "nano-banana-2.1")

	t.Setenv("AI_GATEWAY_API_KEY", "gw-test")
	withGateway := newIrisGenerationProvider().(*irisCompositeProvider)
	require.NotNil(t, withGateway.gateway)
	require.NotNil(t, withGateway.openai)
	gateway, ok := withGateway.gateway.(*irisGatewayProvider)
	require.True(t, ok)
	require.Equal(t, defaultIrisGatewayBaseURL, gateway.baseURL)
	require.Equal(t, "gw-test", gateway.apiKey)

	t.Setenv("AI_GATEWAY_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("ELEVENLABS_API_KEY", "xi")
	provider := newIrisGenerationProvider()
	composite, ok := provider.(*irisCompositeProvider)
	require.True(t, ok)
	require.NotNil(t, composite.elevenlabs)
	require.Nil(t, composite.gateway)
	require.Nil(t, composite.openai)
}

func TestImageLocaliseUsesGPTImage(t *testing.T) {
	model, ok := irisModelByID("image-localise")
	require.True(t, ok)
	require.Equal(t, defaultIrisOpenAIImageModel, model.GatewayID)

	for _, tc := range []struct{ name, baseURL, wantModel string }{
		{"gateway", defaultIrisGatewayBaseURL, "openai/gpt-image-2.6-flare"},
		{"direct openai", defaultIrisOpenAIBaseURL, "gpt-image-2.6-flare"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var gotModel, gotImageType string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "/v1/images/edits", r.URL.Path)
				require.NoError(t, r.ParseMultipartForm(1<<20))
				gotModel = r.FormValue("model")
				_, header, err := r.FormFile("image")
				require.NoError(t, err)
				gotImageType = header.Header.Get("Content-Type")
				_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
			}))
			t.Cleanup(server.Close)
			provider := &irisGatewayProvider{
				baseURL: tc.baseURL,
				apiKey:  "sk",
				httpClient: &http.Client{Transport: rewriteHostRoundTripper{
					host: server.URL,
					next: http.DefaultTransport,
				}},
			}
			outputs, err := provider.Generate(t.Context(), irisProviderRequest{
				Model:  model,
				Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("png"), ContentType: "application/octet-stream"}},
				Fields: irisGenerateRequest{"targetLocale": "fr-FR"},
			})
			require.NoError(t, err)
			require.Len(t, outputs, 1)
			require.Equal(t, tc.wantModel, gotModel)
			require.Equal(t, "image/png", gotImageType)
		})
	}
}

func TestImageEditSendsPromptAndMask(t *testing.T) {
	model, ok := irisModelByID("image-edit")
	require.True(t, ok)
	require.True(t, irisModelUsesOpenAI(model))

	var gotPrompt, gotMaskType string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/images/edits", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		gotPrompt = r.FormValue("prompt")
		_, header, err := r.FormFile("mask")
		require.NoError(t, err)
		gotMaskType = header.Header.Get("Content-Type")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL: defaultIrisOpenAIBaseURL,
		apiKey:  "sk",
		httpClient: &http.Client{Transport: rewriteHostRoundTripper{
			host: server.URL,
			next: http.DefaultTransport,
		}},
	}
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "Remove the logo",
		Inputs: []irisProviderInput{
			{Role: "image", Bytes: []byte("png"), ContentType: "image/png"},
			{Role: "mask", Bytes: []byte("mask"), ContentType: "image/png"},
		},
	})
	require.NoError(t, err)
	require.Len(t, outputs, 1)
	require.Equal(t, "Remove the logo", gotPrompt)
	require.Equal(t, "image/png", gotMaskType)
}

func TestImageEditSendsReferencesAfterTheImage(t *testing.T) {
	model, ok := irisModelByID("image-edit")
	require.True(t, ok)

	var gotImages []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseMultipartForm(1<<20))
		for _, header := range r.MultipartForm.File["image"] {
			file, err := header.Open()
			require.NoError(t, err)
			body, err := io.ReadAll(file)
			require.NoError(t, err)
			gotImages = append(gotImages, string(body))
		}
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL: defaultIrisOpenAIBaseURL,
		apiKey:  "sk",
		httpClient: &http.Client{Transport: rewriteHostRoundTripper{
			host: server.URL,
			next: http.DefaultTransport,
		}},
	}
	_, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "Swap the bottle for image 2",
		Inputs: []irisProviderInput{
			{Role: "image", Bytes: []byte("edited"), ContentType: "image/png"},
			{Role: "image", Bytes: []byte("ref-1"), ContentType: "image/jpeg"},
			{Role: "image", Bytes: []byte("ref-2"), ContentType: "image/png"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"edited", "ref-1", "ref-2"}, gotImages)
}

func TestValidateImageEdit(t *testing.T) {
	image := map[string]any{"kind": "asset", "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
	_, err := validateIrisGenerateRequest(irisGenerateRequest{"model": "image-edit", "image": image})
	require.ErrorContains(t, err, "prompt is required")
	_, err = validateIrisGenerateRequest(irisGenerateRequest{"model": "image-edit", "image": image, "prompt": "x", "mask": "nope"})
	require.ErrorContains(t, err, "mask must be an uploaded asset")
	_, err = validateIrisGenerateRequest(irisGenerateRequest{"model": "image-edit", "image": image, "mask": image, "prompt": "x"})
	require.NoError(t, err)
	references := make([]any, irisMaxImageEditReferences)
	for i := range references {
		references[i] = image
	}
	_, err = validateIrisGenerateRequest(irisGenerateRequest{"model": "image-edit", "image": image, "prompt": "x", "images": references})
	require.NoError(t, err)
	_, err = validateIrisGenerateRequest(irisGenerateRequest{"model": "image-edit", "image": image, "prompt": "x", "images": append(references, image)})
	require.ErrorContains(t, err, "at most 8 reference images")
}

func TestIrisImageFormMIME(t *testing.T) {
	ct, ext := irisImageFormMIME(irisProviderInput{ContentType: "application/octet-stream", Bytes: []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}})
	require.Equal(t, "image/png", ct)
	require.Equal(t, "png", ext)
	ct, ext = irisImageFormMIME(irisProviderInput{ContentType: "image/jpeg"})
	require.Equal(t, "image/jpeg", ct)
	require.Equal(t, "jpg", ext)
	ct, ext = irisImageFormMIME(irisProviderInput{ContentType: "image/webp"})
	require.Equal(t, "image/webp", ct)
	require.Equal(t, "webp", ext)
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

func TestGenerateElevenLabsVoiceTools(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseMultipartForm(1<<20))
		_, _, err := r.FormFile("audio")
		require.NoError(t, err)
		w.Header().Set("Content-Type", "audio/mpeg")
		switch r.URL.Path {
		case "/v1/audio-isolation":
			_, _ = w.Write([]byte("speech"))
		case "/v1/speech-to-speech/21m00Tcm4TlvDq8ikWAM":
			require.Equal(t, "eleven_multilingual_sts_v2", r.FormValue("model_id"))
			require.Equal(t, "true", r.FormValue("remove_background_noise"))
			_, _ = w.Write([]byte("revoiced"))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)
	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "k", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	media := []irisProviderInput{{Role: "media", Bytes: []byte("clip"), ContentType: "video/mp4"}}

	isolator, ok := irisModelByID("elevenlabs-voice-isolator")
	require.True(t, ok)
	outputs, err := generateElevenLabs(t.Context(), client, irisProviderRequest{Model: isolator, Inputs: media})
	require.NoError(t, err)
	require.Equal(t, []byte("speech"), outputs[0].Bytes)
	require.Equal(t, "voice.mp3", outputs[0].Filename)

	changer, ok := irisModelByID("elevenlabs-voice-changer")
	require.True(t, ok)
	outputs, err = generateElevenLabs(t.Context(), client, irisProviderRequest{
		Model:  changer,
		Inputs: media,
		Voice:  "21m00Tcm4TlvDq8ikWAM",
		Fields: irisGenerateRequest{"removeBackgroundNoise": true},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("revoiced"), outputs[0].Bytes)
	require.Equal(t, "revoiced.mp3", outputs[0].Filename)
}

func TestGenerateElevenLabsSpeechUsesGlossaryPronunciations(t *testing.T) {
	var dictionaries int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/pronunciation-dictionaries/add-from-rules":
			dictionaries++
			_, _ = w.Write([]byte(`{"id":"dict-1","version_id":"v-1"}`))
		case "/v1/text-to-dialogue":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			require.Equal(t, []any{map[string]any{"pronunciation_dictionary_id": "dict-1", "version_id": "v-1"}}, body["pronunciation_dictionary_locators"])
			require.Len(t, body["inputs"], 2)
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("dialogue"))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)
	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "k", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	model, ok := irisModelByID("elevenlabs-dialogue")
	require.True(t, ok)
	outputs, err := generateElevenLabs(t.Context(), client, irisProviderRequest{
		Model: model,
		Fields: irisGenerateRequest{"lines": []any{
			map[string]any{"text": "Try Iris", "voice": "21m00Tcm4TlvDq8ikWAM"},
			map[string]any{"text": "I will", "voice": "AZnzlk1XvdvUeBnXmlld"},
		}},
		Pronunciations: []irisPronunciation{{Term: "Iris", Alias: "eye-ris"}},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("dialogue"), outputs[0].Bytes)
	require.Equal(t, 1, dictionaries)
}

func TestGenerateElevenLabsTranscripts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseMultipartForm(1<<20))
		switch r.URL.Path {
		case "/v1/speech-to-text":
			require.Equal(t, []string{"Hyperlocalise", "Iris"}, r.MultipartForm.Value["keyterms"])
			_, _ = w.Write([]byte(`{"language_code":"en","text":"Hi there. Iris here","words":[
				{"text":"Hi","type":"word","start":0,"end":0.2,"speaker_id":"speaker_0"},
				{"text":"there.","type":"word","start":0.3,"end":0.6,"speaker_id":"speaker_0"},
				{"text":"Iris","type":"word","start":0.7,"end":0.9,"speaker_id":"speaker_1"},
				{"text":"here","type":"word","start":3,"end":3.2,"speaker_id":"speaker_1"}
			]}`))
		case "/v1/forced-alignment":
			require.Equal(t, "Bonjour Iris", r.FormValue("text"))
			_, _ = w.Write([]byte(`{"words":[{"text":"Bonjour","start":0,"end":0.4,"loss":0},{"text":"Iris","start":0.4,"end":0.9,"loss":0}],"loss":0}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)
	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "k", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	audio := []irisProviderInput{{Role: "audio", Bytes: []byte("wav"), ContentType: "audio/wav"}}

	scribe, ok := irisModelByID("elevenlabs-scribe")
	require.True(t, ok)
	outputs, err := generateElevenLabs(t.Context(), client, irisProviderRequest{
		Model:    scribe,
		Inputs:   audio,
		Fields:   irisGenerateRequest{"diarize": true, "keyterms": []any{"Hyperlocalise"}},
		Keyterms: []string{"Iris"},
	})
	require.NoError(t, err)
	require.Equal(t, "transcript.json", outputs[0].Filename)
	var segments []struct {
		Text    string `json:"text"`
		Speaker string `json:"speaker"`
		Words   []struct {
			Text  string  `json:"text"`
			Start float64 `json:"start"`
		} `json:"words"`
	}
	require.NoError(t, json.Unmarshal(outputs[0].Bytes, &segments))
	// A sentence end, a new speaker and a long pause each start a segment.
	require.Len(t, segments, 3)
	require.Equal(t, "Hi there.", segments[0].Text)
	require.Equal(t, "speaker_0", segments[0].Speaker)
	require.Equal(t, "Iris", segments[1].Text)
	require.Equal(t, "here", segments[2].Text)

	alignment, ok := irisModelByID("elevenlabs-forced-alignment")
	require.True(t, ok)
	outputs, err = generateElevenLabs(t.Context(), client, irisProviderRequest{Model: alignment, Inputs: audio, Fields: irisGenerateRequest{"text": "Bonjour Iris"}})
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(outputs[0].Bytes, &segments))
	require.Len(t, segments, 1)
	require.Equal(t, "Bonjour Iris", segments[0].Text)
	require.Len(t, segments[0].Words, 2)
}

func TestGenerateElevenLabsVoiceDesign(t *testing.T) {
	preview := base64.StdEncoding.EncodeToString([]byte("preview"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/text-to-voice/design":
			_, _ = w.Write([]byte(`{"previews":[{"audio_base_64":"` + preview + `","generated_voice_id":"gen-1","media_type":"audio/mpeg","duration_secs":3,"language":"en"},{"audio_base_64":"` + preview + `","generated_voice_id":"gen-2","media_type":"audio/mpeg","duration_secs":3,"language":"en"}],"text":"Hello"}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)
	client, err := elevenlabs.NewClientWithHTTPClient(elevenlabs.Config{APIKey: "k", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	model, ok := irisModelByID("elevenlabs-voice-design")
	require.True(t, ok)

	outputs, err := generateElevenLabs(t.Context(), client, irisProviderRequest{Model: model, Prompt: "A warm narrator"})
	require.NoError(t, err)
	require.Len(t, outputs, 3)
	require.Equal(t, "voice-preview-1.mp3", outputs[0].Filename)
	require.Equal(t, "voices.json", outputs[2].Filename)
	require.Contains(t, string(outputs[2].Bytes), `"generatedVoiceId":"gen-2"`)
}

func TestIrisJoinWordsKeepsUnspacedScripts(t *testing.T) {
	require.Equal(t, "Hi there", irisJoinWords([]string{"Hi", "there"}))
	require.Equal(t, "こんにちは世界", irisJoinWords([]string{"こんにちは", "世界"}))
}
