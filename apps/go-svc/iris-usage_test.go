package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestIrisChatStoppedTurnChargesEstimate(t *testing.T) {
	meter := &stubIrisMeter{features: true, tokens: true}
	stream := &stubIrisChatStream{reply: "abcdefgh", failAfter: errors.New("client went away")}
	api := irisChatAPI(t, stream, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"messages": []map[string]any{{"role": "user", "content": "tighten the headline"}},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	events := readIrisChatSSE(t, rec)
	require.Equal(t, []irisChatStreamEvent{
		{Type: "delta", Text: "abcdefgh"},
		{Type: "error", Code: "chat_failed", Message: "Could not complete the turn"},
	}, events)
	require.Len(t, meter.tokenTracks, 1)
	require.Equal(t, irisChatGatewayID, meter.tokenTracks[0].ModelID)
	require.Equal(t, 2, meter.tokenTracks[0].OutputTokens)
	require.Equal(t, irisEstimatedTokens(len(mustJSON(stream.request.Messages))+len(mustJSON(stream.request.Tools))), meter.tokenTracks[0].InputTokens)
}

func TestIrisChatTurnTheGatewayRejectedIsNotCharged(t *testing.T) {
	meter := &stubIrisMeter{features: true, tokens: true}
	api := irisChatAPI(t, &stubIrisChatStream{err: errors.New("gateway chat failed: 400")}, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"messages": []map[string]any{{"role": "user", "content": "hello"}},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, meter.tokenTracks)
}

func TestIrisThreadFromRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	id, title := irisThreadFromRequest(req)
	require.Empty(t, id)
	require.Empty(t, title)

	req.Header.Set(irisThreadTitleHeader, "Launch")
	id, title = irisThreadFromRequest(req)
	require.Empty(t, id)
	require.Empty(t, title, "a title without a thread is dropped")

	req.Header.Set(irisThreadIDHeader, " thread_1 ")
	req.Header.Set(irisThreadTitleHeader, "Ra%20m%E1%BA%AFt%20Q4")
	id, title = irisThreadFromRequest(req)
	require.Equal(t, "thread_1", id)
	require.Equal(t, "Ra mắt Q4", title)

	req.Header.Set(irisThreadIDHeader, strings.Repeat("x", irisThreadIDMaxLen+10))
	req.Header.Set(irisThreadTitleHeader, strings.Repeat("é", irisThreadTitleMaxLen+10))
	id, title = irisThreadFromRequest(req)
	require.Len(t, id, irisThreadIDMaxLen)
	require.Equal(t, irisThreadTitleMaxLen, len([]rune(title)))
}

func TestIrisResponseUsage(t *testing.T) {
	require.Equal(t, []irisTokenUsage{{Model: "google/gemini-nano-banana-2.1", InputTokens: 12, OutputTokens: 1290}},
		irisResponseUsage([]byte(`{"usage":{"prompt_tokens":12,"completion_tokens":1290}}`), "google/gemini-nano-banana-2.1"))
	require.Equal(t, []irisTokenUsage{{Model: "openai/gpt-image-2.6-sunburst", InputTokens: 40, OutputTokens: 4160}},
		irisResponseUsage([]byte(`{"data":[],"usage":{"input_tokens":40,"output_tokens":4160}}`), "openai/gpt-image-2.6-sunburst"))
	require.Nil(t, irisResponseUsage([]byte(`{"data":[]}`), "openai/gpt-image-2.6-sunburst"))
	require.Nil(t, irisResponseUsage([]byte(`not json`), "m"))
}

func TestIrisJobChargesUseReportedTokens(t *testing.T) {
	credits := (&irisGenerationAPI{}).creditModels()
	job := irisJobRecord{ID: "job_listen", OrgID: "org_local", Model: "listen", TokenUsage: []irisTokenUsage{
		{Model: "google/gemini-3.8-flash", InputTokens: 9000, OutputTokens: 0},
		{Model: "xiaomi/mimo-v2.6-pro", InputTokens: 9000, OutputTokens: 400},
	}}
	charges := irisJobCharges(job, credits)
	require.Len(t, charges, 2)
	require.Equal(t, "google/gemini-3.8-flash", charges[0].Track.ModelID)
	require.Equal(t, 9000, charges[0].Track.InputTokens)
	require.Equal(t, "xiaomi/mimo-v2.6-pro", charges[1].Track.ModelID)
	require.Equal(t, 400, charges[1].Track.OutputTokens)
	require.NotEqual(t, charges[0].OperationKey, charges[1].OperationKey)
	for _, charge := range charges {
		require.False(t, charge.Units)
		require.Equal(t, irisSourceGeneration, charge.Source)
		require.Equal(t, "job_listen", charge.Dimensions["iris_job_id"])
	}

	image := irisJobRecord{ID: "job_image", OrgID: "org_local", Model: "nano-banana-2.1"}
	charges = irisJobCharges(image, credits)
	require.Len(t, charges, 1)
	require.True(t, charges[0].Units)
	require.Equal(t, irisSourceImage, charges[0].Source)
	require.Equal(t, "iris-generation:job_image:ai_tokens", charges[0].OperationKey)

	video := irisJobRecord{ID: "job_video", OrgID: "org_local", Model: "veo-3.1-fast", Request: irisGenerateRequest{"duration": float64(8)}}
	charges = irisJobCharges(video, credits)
	require.Len(t, charges, 1)
	require.Equal(t, irisSourceVideo, charges[0].Source)
	require.Equal(t, 8, charges[0].Track.OutputTokens)

	require.Nil(t, irisJobCharges(irisJobRecord{ID: "job_x", Model: "nope"}, credits))
}

func TestIrisJobStoreKeepsThreadAndTokenUsage(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})
	ctx := context.Background()
	job := irisJobRecord{
		ID: "job_thread", OrgID: "org_local", UserID: "user_1", Model: "image-text", Status: "succeeded",
		Assets: []irisJobAsset{}, ThreadID: "thread_1", ThreadTitle: "Launch",
		TokenUsage: []irisTokenUsage{{Model: "openai/gpt-6-luna", InputTokens: 800, OutputTokens: 120}},
	}
	require.NoError(t, api.saveJob(ctx, job))
	loaded, err := api.loadJob(ctx, "org_local", "job_thread")
	require.NoError(t, err)
	require.Equal(t, "thread_1", loaded.ThreadID)
	require.Equal(t, "Launch", loaded.ThreadTitle)
	require.Equal(t, job.TokenUsage, loaded.TokenUsage)
}

func TestIrisChargeRecordsLedgerRow(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "member"})
	ctx := context.Background()
	meter := &stubIrisMeter{charged: 0.4213}
	api := &irisGenerationAPI{pool: scope.Pool, meter: meter}
	org := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, ThreadID: "thread_1", ThreadTitle: "Launch film"}
	charge := irisCharge{
		OperationKey: irisOperationKey("iris-chat"),
		Source:       irisSourceChat,
		Track:        autumn.TrackTokensRequest{ModelID: irisChatGatewayID, InputTokens: 1000, OutputTokens: 200},
		Dimensions:   map[string]any{"product_model": irisChatModelID},
	}
	api.charge(ctx, org, charge)
	require.Len(t, meter.tokenTracks, 1)
	require.Equal(t, scope.OrganizationID, meter.tokenTracks[0].CustomerID)
	require.Equal(t, autumn.AITokens, meter.tokenTracks[0].FeatureID)

	var status, source, model, credential, actor, threadID, threadTitle, amount string
	var quantity, input int
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        select status::text, source, model_id, credential_source, actor_user_id::text, quantity,
            dimensions ->> 'iris_thread_id', dimensions ->> 'iris_thread_title', (dimensions ->> 'input_tokens')::int,
            amount_usd::text
        from usage_events where operation_key = $1`, charge.OperationKey).
		Scan(&status, &source, &model, &credential, &actor, &quantity, &threadID, &threadTitle, &input, &amount))
	require.Equal(t, "tracking_succeeded", status)
	require.Equal(t, irisSourceChat, source)
	require.Equal(t, irisChatGatewayID, model)
	require.Equal(t, "gateway", credential)
	require.Equal(t, scope.UserID, actor)
	require.Equal(t, 1200, quantity)
	require.Equal(t, "thread_1", threadID)
	require.Equal(t, "Launch film", threadTitle)
	require.Equal(t, 1000, input)
	require.Equal(t, "0.421300000", amount)

	// The same operation is never charged twice, such as a job resumed after a restart.
	api.charge(ctx, org, charge)
	require.Len(t, meter.tokenTracks, 1)

	// Unit charges keep their units apart from tokens, and a failed charge stays for reconciliation.
	meter.trackErr = errors.New("autumn down")
	failed := irisCharge{
		OperationKey: irisOperationKey("iris-generation"),
		Source:       irisSourceImage,
		Track:        autumn.TrackTokensRequest{ModelID: "custom/hyperlocalise-fal-image", OutputTokens: 4},
		Units:        true,
	}
	api.charge(ctx, irisOrgScope{OrganizationID: scope.OrganizationID}, failed)
	var trackError string
	var units int
	var hasAmount, hasActor bool
	require.NoError(t, scope.Pool.QueryRow(ctx, `
        select status::text, autumn_track_error, quantity, (dimensions ->> 'units')::int, amount_usd is not null, actor_user_id is not null
        from usage_events where operation_key = $1`, failed.OperationKey).
		Scan(&status, &trackError, &quantity, &units, &hasAmount, &hasActor))
	require.Equal(t, "tracking_failed", status)
	require.Equal(t, "autumn down", trackError)
	require.Equal(t, 0, quantity)
	require.Equal(t, 4, units)
	require.False(t, hasAmount)
	require.False(t, hasActor)
}
