package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

// Prices as AI Gateway publishes them on /v1/models.
const irisTestGatewayPrices = `{"data":[
    {"id":"google/veo-3.1-generate-001","pricing":{"video_duration_pricing":[
        {"resolution":"720p","audio":false,"cost_per_second":"0.2"},{"resolution":"720p","audio":true,"cost_per_second":"0.4"},
        {"resolution":"1080p","audio":false,"cost_per_second":"0.2"},{"resolution":"1080p","audio":true,"cost_per_second":"0.4"},
        {"resolution":"4k","audio":false,"cost_per_second":"0.4"},{"resolution":"4k","audio":true,"cost_per_second":"0.6"}]}},
    {"id":"spacexai/grok-imagine-video-1.5","pricing":{"video_duration_pricing":[
        {"resolution":"480p","cost_per_second":"0.08"},{"resolution":"720p","cost_per_second":"0.14"},{"resolution":"1080p","cost_per_second":"0.25"}]}},
    {"id":"bfl/flux-3-video","pricing":{}},
    {"id":"fish-audio/s2.1-pro","pricing":{"input":"0.000015","speech_input_character_cost":"0.000015"}},
    {"id":"fish-audio/transcribe-1","pricing":{"input":"0.0000000001","transcription_duration_cost_per_second":"0.0001"}},
    {"id":"google/gemini-3.8-flash-tts","pricing":{"input":"0.0000005","output":"0.000009","audio_output_token_cost":"0.000009"}},
    {"id":"google/gemini-nano-banana-2.1","pricing":{"input":"0.0000015","image_dimension_quality_pricing":[
        {"size":"1K","cost":"0.0336"},{"size":"2K","cost":"0.0504"},{"size":"4K","cost":"0.1134"},{"size":"default","cost":"0.0336"}]}},
    {"id":"spacexai/grok-imagine-image-2.0","pricing":{"image":"0.06","image_dimension_quality_pricing":[
        {"quality":"low","cost":"0.04"},{"size":"2048x2048","cost":"0.08"}]}}
]}`

func irisTestPricing(t *testing.T) map[string]irisGatewayPricing {
	t.Helper()
	var parsed struct {
		Data []struct {
			ID      string             `json:"id"`
			Pricing irisGatewayPricing `json:"pricing"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal([]byte(irisTestGatewayPrices), &parsed))
	prices := map[string]irisGatewayPricing{}
	for _, model := range parsed.Data {
		prices[model.ID] = model.Pricing
	}
	return prices
}

func TestIrisGatewayPrice(t *testing.T) {
	prices := irisTestPricing(t)
	price := func(modelID string, request irisGenerateRequest, assets ...irisJobAsset) (float64, bool) {
		model, ok := irisModelByID(modelID)
		require.True(t, ok, modelID)
		return irisGatewayPrice(prices[model.GatewayID], model, irisJobRecord{ID: "job", Model: modelID, Request: request, Assets: assets})
	}
	cases := []struct {
		name    string
		model   string
		request irisGenerateRequest
		want    float64
		ok      bool
	}{
		{name: "veo defaults to its first resolution with audio", model: "veo-3.1", request: irisGenerateRequest{"duration": float64(8)}, want: 3.2, ok: true},
		{name: "veo 4k without audio", model: "veo-3.1", request: irisGenerateRequest{"duration": float64(8), "resolution": "4K", "generateAudio": false}, want: 3.2, ok: true},
		{name: "veo 4k with audio", model: "veo-3.1", request: irisGenerateRequest{"duration": float64(4), "resolution": "4k"}, want: 2.4, ok: true},
		{name: "grok 1080p", model: "grok-imagine-video-1.5", request: irisGenerateRequest{"duration": float64(6), "resolution": "1080p"}, want: 1.5, ok: true},
		{name: "grok resolution it does not list takes the dearest", model: "grok-imagine-video-1.5", request: irisGenerateRequest{"duration": float64(2), "resolution": "8k"}, want: 0.5, ok: true},
		{name: "a video model Gateway does not price", model: "flux-3-video", request: irisGenerateRequest{"duration": float64(6)}},
		{name: "fish speech by character", model: "fish-audio-s2.1-pro", request: irisGenerateRequest{"prompt": "Xin chào thế giới"}, want: 17 * 0.000015, ok: true},
		{name: "fish transcription by second", model: "fish-audio-transcribe-1", request: irisGenerateRequest{"duration": float64(90)}, want: 0.009, ok: true},
		{name: "a transcription of unknown length", model: "fish-audio-transcribe-1", request: irisGenerateRequest{}},
		{name: "a token-priced voice", model: "gemini-3.8-flash-tts", request: irisGenerateRequest{"prompt": "hello"}},
		{name: "nano banana at 2K", model: "nano-banana-2.1", request: irisGenerateRequest{"resolution": "2K", "count": float64(2)}, want: 0.1008, ok: true},
		{name: "nano banana default size", model: "nano-banana-2.1", request: irisGenerateRequest{}, want: 0.0336, ok: true},
		{name: "grok image flat price", model: "grok-imagine-image-2.0", request: irisGenerateRequest{"resolution": "2K"}, want: 0.06, ok: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := price(tc.model, tc.request)
			require.Equal(t, tc.ok, ok)
			if tc.ok {
				require.InDelta(t, tc.want, got, 1e-9)
			}
		})
	}
}

func TestIrisMicroDollars(t *testing.T) {
	require.Equal(t, 0, irisMicroDollars(0))
	require.Equal(t, 1, irisMicroDollars(0.0000001))
	require.Equal(t, 421300, irisMicroDollars(0.4213))
	require.Equal(t, 3_200_000, irisMicroDollars(3.2))
}

func TestCollectIrisGenerationIDs(t *testing.T) {
	collectIrisGenerationIDs(context.Background(), http.Header{"X-Generation-Id": {"gen_a"}}, nil)

	collector := &irisGenerationCollector{}
	ctx := context.WithValue(context.Background(), irisGenerationCollectorKey{}, collector)
	collectIrisGenerationIDs(ctx, http.Header{"X-Vercel-Ai-Gateway-Generation-Id": {"gen_header"}, "X-Request-Id": {"gen_not_this"}}, nil)
	collectIrisGenerationIDs(ctx, nil, []byte(`{"id":"gen_body","object":"chat.completion"}`))
	collectIrisGenerationIDs(ctx, nil, []byte(`{"generation_id":"gen_field"}`))
	collectIrisGenerationIDs(ctx, nil, []byte(`{"id":"chatcmpl_123"}`))
	collectIrisGenerationIDs(ctx, nil, []byte(`{"id":"gen_body"}`))
	collectIrisGenerationIDs(ctx, nil, []byte(`not json`))
	require.Equal(t, []string{"gen_header", "gen_body", "gen_field"}, collector.list())
}

func TestIrisGatewayProviderPutsGenerationIDsOnTheJobsOutput(t *testing.T) {
	png := base64.StdEncoding.EncodeToString([]byte("png"))
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"gen_image","choices":[{"message":{"content":"","images":[{"image_url":{"url":"data:image/png;base64,` + png + `"}}]}}],"usage":{"prompt_tokens":10,"completion_tokens":1290}}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "k", httpClient: server.Client()}
	model, ok := irisModelByID("nano-banana-2.1")
	require.True(t, ok)
	outputs, err := provider.Generate(context.Background(), irisProviderRequest{Model: model, Prompt: "a fox", Count: 1})
	require.NoError(t, err)
	require.NotEmpty(t, outputs)
	require.Equal(t, []string{"gen_image"}, outputs[0].GenerationIDs)
	require.Equal(t, 1290, outputs[0].Usage[0].OutputTokens)
}

func TestIrisGatewayGenerationCost(t *testing.T) {
	lookups := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/generation", r.URL.Path)
		require.Equal(t, "Bearer k", r.Header.Get("Authorization"))
		lookups++
		switch r.URL.Query().Get("id") {
		case "gen_pending":
			http.Error(w, `{"error":"Usage event not found"}`, http.StatusNotFound)
		case "gen_string":
			_, _ = w.Write([]byte(`{"data":{"id":"gen_string","total_cost":"0.4213"}}`))
		case "gen_number":
			_, _ = w.Write([]byte(`{"data":{"id":"gen_number","total_cost":3.2}}`))
		case "gen_missing":
			_, _ = w.Write([]byte(`{"data":{"id":"gen_missing"}}`))
		default:
			http.Error(w, "nope", http.StatusUnauthorized)
		}
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "k", httpClient: server.Client()}
	ctx := context.Background()
	_, err := provider.GenerationCost(ctx, "gen_pending")
	require.ErrorIs(t, err, errIrisCostPending)
	cost, err := provider.GenerationCost(ctx, "gen_string")
	require.NoError(t, err)
	require.InDelta(t, 0.4213, cost, 1e-12)
	cost, err = provider.GenerationCost(ctx, "gen_number")
	require.NoError(t, err)
	require.InDelta(t, 3.2, cost, 1e-12)
	_, err = provider.GenerationCost(ctx, "gen_missing")
	require.ErrorContains(t, err, "no total_cost")
	_, err = provider.GenerationCost(ctx, "gen_denied")
	require.ErrorContains(t, err, "401")
	require.Equal(t, 5, lookups)
}

func TestIrisGatewayModelPricingIsCached(t *testing.T) {
	fetches := 0
	fail := false
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/models", r.URL.Path)
		fetches++
		if fail {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(irisTestGatewayPrices))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "k", httpClient: server.Client()}
	ctx := context.Background()
	pricing, ok := provider.ModelPricing(ctx, "spacexai/grok-imagine-video-1.5")
	require.True(t, ok)
	require.Len(t, pricing.VideoDuration, 3)
	_, ok = provider.ModelPricing(ctx, "openai/unknown")
	require.False(t, ok)
	require.Equal(t, 1, fetches)

	// A failed refresh keeps the stale list.
	provider.pricesAt = time.Now().Add(-2 * irisGatewayPricesTTL)
	fail = true
	_, ok = provider.ModelPricing(ctx, "spacexai/grok-imagine-video-1.5")
	require.True(t, ok)
	require.Equal(t, 2, fetches)
}

type stubIrisGatewayCosts struct {
	costs   map[string]float64
	pending map[string]int
	errs    map[string]error
	prices  map[string]irisGatewayPricing
	lookups []string
}

func (s *stubIrisGatewayCosts) GenerationCost(_ context.Context, id string) (float64, error) {
	s.lookups = append(s.lookups, id)
	if s.pending[id] > 0 {
		s.pending[id]--
		return 0, errIrisCostPending
	}
	if err := s.errs[id]; err != nil {
		return 0, err
	}
	return s.costs[id], nil
}

func (s *stubIrisGatewayCosts) ModelPricing(_ context.Context, gatewayID string) (irisGatewayPricing, bool) {
	pricing, ok := s.prices[gatewayID]
	return pricing, ok
}

func TestIrisJobChargesPreferWhatGatewayCharged(t *testing.T) {
	waits := 0
	costs := &stubIrisGatewayCosts{
		costs:   map[string]float64{"gen_1": 2.9, "gen_2": 0.3},
		pending: map[string]int{"gen_1": 2},
		errs:    map[string]error{"gen_bad": errors.New("gateway generation lookup failed: 500")},
		prices:  irisTestPricing(t),
	}
	api := &irisGenerationAPI{gatewayCosts: costs, sleep: func(context.Context, time.Duration) error { waits++; return nil }}
	ctx := context.Background()
	veo := irisJobRecord{ID: "job_veo", OrgID: "org_local", Model: "veo-3.1", Request: irisGenerateRequest{"duration": float64(8)}}

	t.Run("what Gateway charged", func(t *testing.T) {
		job := veo
		job.GatewayGenerations = []string{"gen_1", "gen_2"}
		charges := api.jobCharges(ctx, job)
		require.Len(t, charges, 1)
		charge := charges[0]
		require.Equal(t, irisCostSourceGateway, charge.CostSource)
		require.InDelta(t, 3.2, charge.CostUSD, 1e-9)
		require.Equal(t, defaultIrisUSDCreditModel, charge.Track.ModelID)
		require.Equal(t, 3_200_000, charge.Track.OutputTokens)
		require.Equal(t, "google/veo-3.1-generate-001", charge.LedgerModel)
		require.Equal(t, irisSourceVideo, charge.Source)
		require.Equal(t, irisCostSourceGateway, charge.Track.Properties["cost_source"])
		require.False(t, charge.Units)
		require.Equal(t, 2, waits, "waits while Gateway records the cost")
	})

	t.Run("published prices when a lookup fails", func(t *testing.T) {
		job := veo
		job.GatewayGenerations = []string{"gen_bad"}
		charges := api.jobCharges(ctx, job)
		require.Len(t, charges, 1)
		require.Equal(t, irisCostSourcePriceTable, charges[0].CostSource)
		require.InDelta(t, 3.2, charges[0].CostUSD, 1e-9)
	})

	t.Run("published prices for a response without a generation id", func(t *testing.T) {
		charges := api.jobCharges(ctx, irisJobRecord{ID: "job_fish", Model: "fish-audio-s2.1-pro", Request: irisGenerateRequest{"prompt": "hello"}})
		require.Len(t, charges, 1)
		require.Equal(t, irisCostSourcePriceTable, charges[0].CostSource)
		require.Equal(t, 75, charges[0].Track.OutputTokens)
	})

	t.Run("reported tokens before published prices", func(t *testing.T) {
		job := irisJobRecord{ID: "job_nano", Model: "nano-banana-2.1", TokenUsage: []irisTokenUsage{{Model: "google/gemini-nano-banana-2.1", InputTokens: 10, OutputTokens: 1290}}}
		charges := api.jobCharges(ctx, job)
		require.Len(t, charges, 1)
		require.Empty(t, charges[0].CostSource)
		require.Equal(t, 1290, charges[0].Track.OutputTokens)
	})

	t.Run("units when nothing prices it", func(t *testing.T) {
		charges := api.jobCharges(ctx, irisJobRecord{ID: "job_flux", Model: "flux-3-video", Request: irisGenerateRequest{"duration": float64(6)}})
		require.Len(t, charges, 1)
		require.True(t, charges[0].Units)
		require.Equal(t, "bfl/flux-3-video", charges[0].Track.ModelID)
	})

	t.Run("Fal and ElevenLabs keep their custom models", func(t *testing.T) {
		job := irisJobRecord{ID: "job_kling", Model: "kling-3-pro", Request: irisGenerateRequest{"duration": float64(5)}, GatewayGenerations: []string{"gen_2"}}
		charges := api.jobCharges(ctx, job)
		require.Len(t, charges, 1)
		require.Equal(t, defaultIrisFalVideoCreditModel, charges[0].Track.ModelID)
		require.True(t, charges[0].Units)
	})

	t.Run("units without a Gateway key", func(t *testing.T) {
		job := veo
		job.GatewayGenerations = []string{"gen_2"}
		charges := (&irisGenerationAPI{}).jobCharges(ctx, job)
		require.Len(t, charges, 1)
		require.True(t, charges[0].Units)
	})
}

func TestIrisGatewayJobCostGivesUpWhenGatewayNeverRecordsIt(t *testing.T) {
	costs := &stubIrisGatewayCosts{pending: map[string]int{"gen_slow": 1 << 30}}
	api := &irisGenerationAPI{gatewayCosts: costs, sleep: func(ctx context.Context, _ time.Duration) error {
		return context.DeadlineExceeded
	}}
	_, ok := api.gatewayJobCost(context.Background(), irisJobRecord{ID: "job", GatewayGenerations: []string{"gen_slow"}})
	require.False(t, ok)
	require.Len(t, costs.lookups, 1)
}

func TestIrisCostChargeRecordsTheGatewayModelAndCost(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "member"})
	ctx := context.Background()
	meter := &stubIrisMeter{charged: 3.52}
	api := &irisGenerationAPI{pool: scope.Pool, meter: meter}
	model, ok := irisModelByID("veo-3.1")
	require.True(t, ok)
	job := irisJobRecord{ID: "job_" + strings.ReplaceAll(t.Name(), "/", "_"), OrgID: scope.OrganizationID, Model: "veo-3.1"}
	charge := irisCostCharge(job, model, api.creditModels(), 3.2, irisCostSourceGateway)
	api.charge(ctx, irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID}, charge)
	require.Len(t, meter.tokenTracks, 1)
	require.Equal(t, autumn.TrackTokensRequest{
		CustomerID: scope.OrganizationID, FeatureID: autumn.AITokens, ModelID: defaultIrisUSDCreditModel,
		OutputTokens: 3_200_000, Properties: charge.Track.Properties,
	}, meter.tokenTracks[0])

	var model_, source, estimated, amount, costSource string
	var quantity int
	var hasTokens bool
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        select model_id, source, estimated_amount_usd::text, amount_usd::text, dimensions ->> 'cost_source', quantity,
            dimensions ? 'output_tokens'
        from usage_events where operation_key = $1`, charge.OperationKey).
		Scan(&model_, &source, &estimated, &amount, &costSource, &quantity, &hasTokens))
	require.Equal(t, "google/veo-3.1-generate-001", model_)
	require.Equal(t, irisSourceVideo, source)
	require.Equal(t, "3.200000000", estimated)
	require.Equal(t, "3.520000000", amount)
	require.Equal(t, irisCostSourceGateway, costSource)
	require.Equal(t, 0, quantity)
	require.False(t, hasTokens)
}
