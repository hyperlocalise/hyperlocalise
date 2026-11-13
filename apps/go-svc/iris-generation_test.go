package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

const irisTestPath = "/v1/orgs/acme/iris"

func testIrisCredits() irisCreditConfig {
	return irisCreditConfig{
		FalImageModelID:          "custom/fal-image",
		FalVideoModelID:          "custom/fal-video",
		ElevenLabsSecondModelID:  "custom/el-second",
		ElevenLabsMinuteModelID:  "custom/el-minute",
		ElevenLabsDubbingModelID: "custom/el-dubbing",
	}
}

type stubIrisMeter struct {
	features    bool
	tokens      bool
	checkErr    error
	tracks      []autumn.TrackRequest
	tokenTracks []autumn.TrackTokensRequest
}

func (s *stubIrisMeter) Check(_ context.Context, req autumn.CheckRequest) (autumn.CheckResponse, error) {
	if s.checkErr != nil {
		return autumn.CheckResponse{}, s.checkErr
	}
	switch req.FeatureID {
	case autumn.AIFeatures:
		return autumn.CheckResponse{Allowed: s.features}, nil
	case autumn.AITokens:
		remaining := 4.2
		return autumn.CheckResponse{Allowed: s.tokens, Balance: &autumn.Balance{Remaining: &remaining}}, nil
	default:
		return autumn.CheckResponse{Allowed: true}, nil
	}
}

func (s *stubIrisMeter) Track(_ context.Context, req autumn.TrackRequest) error {
	s.tracks = append(s.tracks, req)
	return nil
}

func (s *stubIrisMeter) TrackTokens(_ context.Context, req autumn.TrackTokensRequest) error {
	s.tokenTracks = append(s.tokenTracks, req)
	return nil
}

type presigningMemory struct {
	*memory.Store
}

func (s presigningMemory) PresignUpload(_ context.Context, input objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	headers := http.Header{"Content-Type": []string{input.ContentType}}
	if input.ContentLength > 0 {
		headers.Set("Content-Length", strconv.FormatInt(input.ContentLength, 10))
	}
	return objectstore.SignedRequest{
		URL:       "https://s3.test/upload/" + input.Key,
		Method:    http.MethodPut,
		Headers:   headers,
		ExpiresAt: time.Now().UTC().Add(ttl),
	}, nil
}

func (s presigningMemory) PresignDownload(_ context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://s3.test/download/" + key,
		Method:    http.MethodGet,
		ExpiresAt: time.Now().UTC().Add(ttl),
	}, nil
}

type stubIrisProvider struct {
	outputs        []irisProviderOutput
	err            error
	calls          int
	last           irisProviderRequest
	during         func()
	blockUntilDone bool
}

func (s *stubIrisProvider) Generate(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	s.calls++
	s.last = req
	if s.during != nil {
		s.during()
	}
	if s.blockUntilDone {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	return s.outputs, s.err
}

type failingPrefixStore struct {
	presigningMemory
	failPrefix string
}

func (s failingPrefixStore) Put(ctx context.Context, input objectstore.PutInput) (objectstore.Info, error) {
	if strings.Contains(input.Key, s.failPrefix) {
		return objectstore.Info{}, errors.New("denied")
	}
	return s.Store.Put(ctx, input)
}

func newIrisGenerationFixture(t *testing.T, provider irisGenerationProvider) *irisGenerationAPI {
	t.Helper()
	store := presigningMemory{Store: memory.New()}
	reg, err := objectstore.NewRegistry("s3-files", map[string]objectstore.Store{"s3-files": store})
	require.NoError(t, err)
	return &irisGenerationAPI{
		objects:  reg,
		provider: provider,
		now:      func() time.Time { return time.Date(2026, 10, 24, 1, 0, 0, 0, time.UTC) },
		run:      func(fn func()) { fn() },
		resolve: func(_ context.Context, _ AuthClaims, slug string) (irisOrgScope, error) {
			if slug != "acme" {
				return irisOrgScope{}, organizationAccessDenied()
			}
			return irisOrgScope{OrganizationID: "org_local", UserID: "user_iris"}, nil
		},
	}
}

func irisRequest(api *irisGenerationAPI, method, path string, body any) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_iris", OrgID: "org_1"}})
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer token")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestIrisGenerationModelsAndEstimate(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})

	t.Run("lists iris models", func(t *testing.T) {
		rec := irisRequest(api, http.MethodGet, irisTestPath+"/models", nil)
		require.Equal(t, http.StatusOK, rec.Code)
		var models []map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &models))
		require.GreaterOrEqual(t, len(models), 20)
		ids := make([]string, 0, len(models))
		for _, model := range models {
			require.Equal(t, map[string]any{"id": model["id"], "name": model["name"]}, model)
			id, _ := model["id"].(string)
			ids = append(ids, id)
		}
		require.Contains(t, ids, "flux-2-klein")
		require.Contains(t, ids, "elevenlabs-v4")
		require.Contains(t, ids, "fish-audio-s2.1-pro")
		require.Contains(t, ids, "fish-audio-drama-3")
		require.NotContains(t, ids, "fish-audio-s2-pro")
		require.NotContains(t, ids, "fish-audio-s1")
		require.Contains(t, ids, "fish-audio-transcribe-1")
		require.Contains(t, ids, "seedance-2.5")
	})

	t.Run("estimates image and voice", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/estimate", map[string]any{
			"model": "flux-2-klein", "prompt": "a cat", "count": 2,
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var estimate irisEstimate
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &estimate))
		require.True(t, estimate.Allowed)
		require.Equal(t, "ai_tokens", estimate.FeatureID)
		require.Equal(t, irisEstimateUnitUSD, estimate.Unit)

		rec = irisRequest(api, http.MethodPost, irisTestPath+"/estimate", map[string]any{
			"model": "gemini-3.8-flash-tts", "prompt": strings.Repeat("hi ", 40), "voice": "Zephyr",
		})
		require.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestIrisGenerationUploadAndJob(t *testing.T) {
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{
		Bytes: []byte("png-bytes"), Filename: "image.png", ContentType: "image/png",
	}}}
	api := newIrisGenerationFixture(t, provider)

	t.Run("signs a missing S3 upload and reuses an existing one", func(t *testing.T) {
		sum := sha256.Sum256([]byte("hello"))
		sha := hex.EncodeToString(sum[:])
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/uploads", map[string]any{
			"sha256": sha, "contentType": "image/png", "size": 5,
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var created irisUploadResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
		require.Equal(t, sha, created.Asset.ID)
		require.NotNil(t, created.UploadURL)
		require.Contains(t, *created.UploadURL, sha)
		require.Equal(t, "image/png", created.UploadHeaders["Content-Type"])
		require.Equal(t, "5", created.UploadHeaders["Content-Length"])

		require.NoError(t, api.putBytes(t.Context(), irisUploadKey("org_local", sha), "image/png", []byte("hello")))
		rec = irisRequest(api, http.MethodPost, irisTestPath+"/uploads", map[string]any{
			"sha256": sha, "contentType": "image/png", "size": 5,
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var existing irisUploadResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &existing))
		require.Nil(t, existing.UploadURL)
	})

	t.Run("runs a generation job through S3", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "11111111-1111-1111-1111-111111111111",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		require.NotEmpty(t, queued.ID)
		require.Equal(t, 1, provider.calls)

		got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+queued.ID, nil)
		require.Equal(t, http.StatusOK, got.Code)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
		require.Equal(t, "succeeded", job.Status)
		require.Len(t, job.Assets, 1)
		require.Contains(t, job.Assets[0].URL, "https://s3.test/download/")
		require.Equal(t, "image.png", job.Assets[0].Filename)

		again := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "11111111-1111-1111-1111-111111111111",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, again.Code)
		var replay irisJobRecord
		require.NoError(t, json.Unmarshal(again.Body.Bytes(), &replay))
		require.Equal(t, job.ID, replay.ID)
		require.Equal(t, 1, provider.calls)
	})

	t.Run("cancels a job that has not finished", func(t *testing.T) {
		api.run = func(func()) {}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "44444444-4444-4444-4444-444444444444",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a dog"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		require.Equal(t, "queued", queued.Status)

		canceled := irisRequest(api, http.MethodPost, irisTestPath+"/jobs/"+queued.ID+"/cancel", nil)
		require.Equal(t, http.StatusOK, canceled.Code)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(canceled.Body.Bytes(), &job))
		require.Equal(t, "canceled", job.Status)
		api.run = func(fn func()) { fn() }
	})

	t.Run("rejects unknown models and missing voice", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "22222222-2222-2222-2222-222222222222",
			"request":        map[string]any{"model": "not-a-model", "prompt": "x"},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)

		rec = irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "33333333-3333-3333-3333-333333333333",
			"request":        map[string]any{"model": "elevenlabs-v4", "prompt": "hello"},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})
}

func TestIrisGenerationUnauthenticated(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{})
	req := httptest.NewRequest(http.MethodGet, irisTestPath+"/models", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestIrisGenerationReviewFixes(t *testing.T) {
	t.Run("rejects oversized uploads", func(t *testing.T) {
		api := newIrisGenerationFixture(t, &stubIrisProvider{})
		sum := sha256.Sum256([]byte("hello"))
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/uploads", map[string]any{
			"sha256": hex.EncodeToString(sum[:]), "contentType": "image/png", "size": irisMaxUploadBytes + 1,
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("rejects remote asset URLs", func(t *testing.T) {
		api := newIrisGenerationFixture(t, &stubIrisProvider{})
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "55555555-5555-5555-5555-555555555555",
			"request": map[string]any{
				"model": "bria-rmbg-2.0",
				"image": map[string]any{"kind": "url", "url": "https://127.0.0.1/secret.png"},
			},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "remote asset URLs are not supported")
	})

	t.Run("rejects scene audio references before queueing", func(t *testing.T) {
		provider := &stubIrisProvider{}
		api := newIrisGenerationFixture(t, provider)
		body := map[string]any{
			"model": "universal-3.5-pro",
			"audio": map[string]any{"scene": "timeline-1"},
		}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/estimate", body)
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "scene audio references are not supported")

		rec = irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "ddddddd1-dddd-dddd-dddd-ddddddddddd1",
			"request":        body,
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "scene audio references are not supported")
		require.Equal(t, 0, provider.calls)
	})

	t.Run("does not start a job when idempotency persistence fails", func(t *testing.T) {
		provider := &stubIrisProvider{outputs: []irisProviderOutput{{
			Bytes: []byte("png-bytes"), Filename: "image.png", ContentType: "image/png",
		}}}
		store := failingPrefixStore{presigningMemory: presigningMemory{Store: memory.New()}, failPrefix: "/idempotency/"}
		reg, err := objectstore.NewRegistry("s3-files", map[string]objectstore.Store{"s3-files": store})
		require.NoError(t, err)
		api := &irisGenerationAPI{
			objects:  reg,
			provider: provider,
			now:      func() time.Time { return time.Date(2026, 10, 24, 1, 0, 0, 0, time.UTC) },
			run:      func(fn func()) { fn() },
			resolve: func(_ context.Context, _ AuthClaims, slug string) (irisOrgScope, error) {
				if slug != "acme" {
					return irisOrgScope{}, organizationAccessDenied()
				}
				return irisOrgScope{OrganizationID: "org_local", UserID: "user_iris"}, nil
			},
		}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "66666666-6666-6666-6666-666666666666",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Equal(t, 0, provider.calls)
	})

	t.Run("recovers queued jobs after a restart", func(t *testing.T) {
		provider := &stubIrisProvider{outputs: []irisProviderOutput{{
			Bytes: []byte("png-bytes"), Filename: "image.png", ContentType: "image/png",
		}}}
		api := newIrisGenerationFixture(t, provider)
		api.run = func(func()) {}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "77777777-7777-7777-7777-777777777777",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, 0, provider.calls)

		api.run = func(fn func()) { fn() }
		api.recoverPending(t.Context())
		require.Equal(t, 1, provider.calls)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+queued.ID, nil)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
		require.Equal(t, "succeeded", job.Status)
	})

	t.Run("keeps a canceled job from flipping to succeeded", func(t *testing.T) {
		provider := &stubIrisProvider{outputs: []irisProviderOutput{{
			Bytes: []byte("png-bytes"), Filename: "image.png", ContentType: "image/png",
		}}}
		api := newIrisGenerationFixture(t, provider)
		var run func()
		api.run = func(fn func()) { run = fn }
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "88888888-8888-8888-8888-888888888888",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		provider.during = func() {
			canceled := irisRequest(api, http.MethodPost, irisTestPath+"/jobs/"+queued.ID+"/cancel", nil)
			require.Equal(t, http.StatusOK, canceled.Code)
		}
		run()
		got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+queued.ID, nil)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
		require.Equal(t, "canceled", job.Status)
		require.Equal(t, 1, provider.calls)
	})
}

func TestIrisGenerationAutumnGate(t *testing.T) {
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{
		Bytes: []byte("png"), Filename: "image.png", ContentType: "image/png",
	}}}
	api := newIrisGenerationFixture(t, provider)

	t.Run("refuses when the plan has no AI features", func(t *testing.T) {
		api.meter = &stubIrisMeter{features: false, tokens: true}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "55555555-5555-5555-5555-555555555555",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "ai_features_required")
		require.Equal(t, 0, provider.calls)
	})

	t.Run("refuses when AI credit is exhausted", func(t *testing.T) {
		api.meter = &stubIrisMeter{features: true, tokens: false}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "66666666-6666-6666-6666-666666666666",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusPaymentRequired, rec.Code)
		require.Contains(t, rec.Body.String(), "ai_credit_exhausted")
	})

	t.Run("tracks agent_runs and synthetic image credit after a successful job", func(t *testing.T) {
		meter := &stubIrisMeter{features: true, tokens: true}
		api.meter = meter
		api.credits = testIrisCredits()
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "99999999-9999-9999-9999-999999999999",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat", "count": 2},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+jsonJobID(t, rec), nil)
		require.Equal(t, http.StatusOK, got.Code)
		require.Len(t, meter.tracks, 1)
		require.Equal(t, autumn.AgentRuns, meter.tracks[0].FeatureID)
		require.Equal(t, 1.0, meter.tracks[0].Value)
		require.Len(t, meter.tokenTracks, 1)
		require.Equal(t, autumn.AITokens, meter.tokenTracks[0].FeatureID)
		require.Equal(t, "custom/fal-image", meter.tokenTracks[0].ModelID)
		require.Equal(t, "fal", meter.tokenTracks[0].Properties["vendor"])
		require.Equal(t, 0, meter.tokenTracks[0].InputTokens)
		require.Equal(t, 1, meter.tokenTracks[0].OutputTokens)

		estimate := irisRequest(api, http.MethodPost, irisTestPath+"/estimate", map[string]any{
			"model": "flux-2-klein", "prompt": "a cat",
		})
		require.Equal(t, http.StatusOK, estimate.Code)
		var body irisEstimate
		require.NoError(t, json.Unmarshal(estimate.Body.Bytes(), &body))
		require.True(t, body.Allowed)
		require.NotNil(t, body.Remaining)
		require.Equal(t, 4.2, *body.Remaining)
	})

	t.Run("tracks synthetic video seconds after a successful job", func(t *testing.T) {
		meter := &stubIrisMeter{features: true, tokens: true}
		api.meter = meter
		api.credits = testIrisCredits()
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "99999999-9999-9999-9999-999999999998",
			"request":        map[string]any{"model": "seedance-2.5", "prompt": "a clip", "duration": 8},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, meter.tokenTracks, 1)
		require.Equal(t, "custom/fal-video", meter.tokenTracks[0].ModelID)
		require.Equal(t, "fal", meter.tokenTracks[0].Properties["vendor"])
		require.Equal(t, 8, meter.tokenTracks[0].OutputTokens)
	})

	t.Run("tracks gateway image credit on the Models.dev id", func(t *testing.T) {
		meter := &stubIrisMeter{features: true, tokens: true}
		api.meter = meter
		api.credits = testIrisCredits()
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "99999999-9999-9999-9999-999999999996",
			"request":        map[string]any{"model": "nano-banana-2.1", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, meter.tokenTracks, 1)
		require.Equal(t, "google/gemini-3-pro-image", meter.tokenTracks[0].ModelID)
		require.Equal(t, "gateway", meter.tokenTracks[0].Properties["vendor"])
		require.Equal(t, 1, meter.tokenTracks[0].OutputTokens)
	})

	t.Run("tracks synthetic audio seconds on the ElevenLabs second id", func(t *testing.T) {
		meter := &stubIrisMeter{features: true, tokens: true}
		api.meter = meter
		api.credits = testIrisCredits()
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "99999999-9999-9999-9999-999999999997",
			"request":        map[string]any{"model": "elevenlabs-music", "prompt": "a score", "duration": 12},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		require.Len(t, meter.tokenTracks, 1)
		require.Equal(t, "custom/el-second", meter.tokenTracks[0].ModelID)
		require.Equal(t, "elevenlabs", meter.tokenTracks[0].Properties["vendor"])
		require.Equal(t, 12, meter.tokenTracks[0].OutputTokens)
	})

	t.Run("fails closed when Autumn cannot be checked", func(t *testing.T) {
		callsBefore := provider.calls
		api.meter = &stubIrisMeter{features: true, tokens: true, checkErr: errors.New("autumn down")}
		rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
			"idempotencyKey": "77777777-7777-7777-7777-777777777777",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Contains(t, rec.Body.String(), "ai_features_check_failed")
		require.Equal(t, callsBefore, provider.calls)

		estimate := irisRequest(api, http.MethodPost, irisTestPath+"/estimate", map[string]any{
			"model": "flux-2-klein", "prompt": "a cat",
		})
		require.Equal(t, http.StatusOK, estimate.Code)
		var body irisEstimate
		require.NoError(t, json.Unmarshal(estimate.Body.Bytes(), &body))
		require.False(t, body.Allowed)
		require.Nil(t, body.Remaining)
	})
}

func TestIrisSyntheticCredit(t *testing.T) {
	credits := testIrisCredits()
	tests := []struct {
		name   string
		job    irisJobRecord
		model  string
		vendor string
		output int
	}{
		{
			name:   "fal images from generated assets",
			job:    irisJobRecord{ID: "job_img", OrgID: "org_local", Model: "flux-2-klein", Assets: []irisJobAsset{{Filename: "a"}, {Filename: "b"}}},
			model:  "custom/fal-image",
			vendor: "fal",
			output: 2,
		},
		{
			name:   "gateway images",
			job:    irisJobRecord{ID: "job_gateway_img", OrgID: "org_local", Model: "nano-banana-2.1", Assets: []irisJobAsset{{Filename: "a"}}},
			model:  "google/gemini-3-pro-image",
			vendor: "gateway",
			output: 1,
		},
		{
			name:   "fal video seconds",
			job:    irisJobRecord{ID: "job_vid", OrgID: "org_local", Model: "seedance-2.5", Request: irisGenerateRequest{"duration": float64(8)}},
			model:  "custom/fal-video",
			vendor: "fal",
			output: 8,
		},
		{
			name:   "fal video default seconds",
			job:    irisJobRecord{ID: "job_vid_default", OrgID: "org_local", Model: "seedance-2.5"},
			model:  "custom/fal-video",
			vendor: "fal",
			output: 6,
		},
		{
			name:   "gateway video seconds",
			job:    irisJobRecord{ID: "job_veo", OrgID: "org_local", Model: "veo-3.1", Request: irisGenerateRequest{"duration": float64(8)}},
			model:  "google/veo-3.1",
			vendor: "gateway",
			output: 8,
		},
		{
			name:   "elevenlabs audio seconds",
			job:    irisJobRecord{ID: "job_audio", OrgID: "org_local", Model: "elevenlabs-music", Request: irisGenerateRequest{"duration": float64(12)}},
			model:  "custom/el-second",
			vendor: "elevenlabs",
			output: 12,
		},
		{
			name:   "elevenlabs voice minutes",
			job:    irisJobRecord{ID: "job_voice", OrgID: "org_local", Model: "elevenlabs-v4"},
			model:  "custom/el-minute",
			vendor: "elevenlabs",
			output: 1,
		},
		{
			name:   "fal upscaler video seconds",
			job:    irisJobRecord{ID: "job_upscaler", OrgID: "org_local", Model: "bytedance-upscaler", Request: irisGenerateRequest{"duration": float64(10)}},
			model:  "custom/fal-video",
			vendor: "fal",
			output: 10,
		},
		{
			name:   "gateway transcribe input minutes",
			job:    irisJobRecord{ID: "job_transcribe", OrgID: "org_local", Model: "universal-3.5-pro", Request: irisGenerateRequest{"duration": float64(90)}},
			model:  "google/gemini-3.5-transcribe",
			vendor: "gateway",
			output: 2,
		},
		{
			name:   "fish audio transcribe input minutes",
			job:    irisJobRecord{ID: "job_fish_transcribe", OrgID: "org_local", Model: "fish-audio-transcribe-1", Request: irisGenerateRequest{"duration": float64(90)}},
			model:  "fish-audio/transcribe-1",
			vendor: "gateway",
			output: 2,
		},
		{
			name:   "fish audio voice minutes",
			job:    irisJobRecord{ID: "job_fish_voice", OrgID: "org_local", Model: "fish-audio-s2.1-pro"},
			model:  "fish-audio/s2.1-pro",
			vendor: "gateway",
			output: 1,
		},
		{
			name:   "omni flash default input minute",
			job:    irisJobRecord{ID: "job_omni", OrgID: "org_local", Model: "qwen3.8-omni-flash"},
			model:  "alibaba/qwen3-omni-flash",
			vendor: "gateway",
			output: 1,
		},
		{
			name:   "elevenlabs dubbing default input minute",
			job:    irisJobRecord{ID: "job_dub", OrgID: "org_local", Model: "elevenlabs-dubbing"},
			model:  "custom/el-dubbing",
			vendor: "elevenlabs",
			output: 1,
		},
		{
			name:   "fal lipsync video seconds",
			job:    irisJobRecord{ID: "job_lipsync", OrgID: "org_local", Model: "sync-lipsync-2", Request: irisGenerateRequest{"duration": float64(15)}},
			model:  "custom/fal-video",
			vendor: "fal",
			output: 15,
		},
		{
			name:   "image text flat gateway image credit",
			job:    irisJobRecord{ID: "job_ocr", OrgID: "org_local", Model: "image-text"},
			model:  "openai/gpt-6-luna",
			vendor: "gateway",
			output: 1,
		},
		{
			name:   "fal image tool",
			job:    irisJobRecord{ID: "job_bria", OrgID: "org_local", Model: "bria-rmbg-2.0"},
			model:  "custom/fal-image",
			vendor: "fal",
			output: 1,
		},
		{
			name:   "gemini tts gateway audio minute",
			job:    irisJobRecord{ID: "job_gemini_tts", OrgID: "org_local", Model: "gemini-3.8-flash-tts"},
			model:  "google/gemini-2.5-flash-preview-tts",
			vendor: "gateway",
			output: 1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, ok := irisSyntheticCredit(tt.job, credits)
			require.True(t, ok)
			require.Equal(t, autumn.AITokens, req.FeatureID)
			require.Equal(t, tt.model, req.ModelID)
			require.Equal(t, tt.vendor, req.Properties["vendor"])
			require.Equal(t, 0, req.InputTokens)
			require.Equal(t, tt.output, req.OutputTokens)
			require.Equal(t, tt.job.OrgID, req.CustomerID)
		})
	}
}

func TestIrisCreditModelsFromEnv(t *testing.T) {
	t.Setenv("AI_CREDIT_FAL_IMAGE_MODEL_ID", "env/fal-image")
	t.Setenv("AI_CREDIT_FAL_VIDEO_MODEL_ID", "env/fal-video")
	t.Setenv("AI_CREDIT_ELEVENLABS_SECOND_MODEL_ID", "env/el-second")
	t.Setenv("AI_CREDIT_ELEVENLABS_MINUTE_MODEL_ID", "env/el-minute")
	t.Setenv("AI_CREDIT_ELEVENLABS_DUBBING_MODEL_ID", "env/el-dubbing")

	cfg := (*irisGenerationAPI)(nil).creditModels()
	require.Equal(t, "env/fal-image", cfg.FalImageModelID)
	require.Equal(t, "env/fal-video", cfg.FalVideoModelID)
	require.Equal(t, "env/el-second", cfg.ElevenLabsSecondModelID)
	require.Equal(t, "env/el-minute", cfg.ElevenLabsMinuteModelID)
	require.Equal(t, "env/el-dubbing", cfg.ElevenLabsDubbingModelID)

	api := &irisGenerationAPI{credits: irisCreditConfig{FalImageModelID: "cfg/fal-image"}}
	require.Equal(t, "cfg/fal-image", api.creditModels().FalImageModelID)
}

func TestIrisCreditModelsDefaults(t *testing.T) {
	t.Setenv("AI_CREDIT_FAL_IMAGE_MODEL_ID", "")
	t.Setenv("AI_CREDIT_FAL_VIDEO_MODEL_ID", "")
	t.Setenv("AI_CREDIT_ELEVENLABS_SECOND_MODEL_ID", "")
	t.Setenv("AI_CREDIT_ELEVENLABS_MINUTE_MODEL_ID", "")
	t.Setenv("AI_CREDIT_ELEVENLABS_DUBBING_MODEL_ID", "")

	cfg := (*irisGenerationAPI)(nil).creditModels()
	require.Equal(t, defaultIrisFalImageCreditModel, cfg.FalImageModelID)
	require.Equal(t, defaultIrisFalVideoCreditModel, cfg.FalVideoModelID)
	require.Equal(t, defaultIrisElevenLabsSecondCreditModel, cfg.ElevenLabsSecondModelID)
	require.Equal(t, defaultIrisElevenLabsMinuteCreditModel, cfg.ElevenLabsMinuteModelID)
	require.Equal(t, defaultIrisElevenLabsDubbingCreditModel, cfg.ElevenLabsDubbingModelID)
}

func TestIrisGenerationDoesNotTrackFailedJobs(t *testing.T) {
	provider := &stubIrisProvider{err: errors.New("gateway unavailable")}
	api := newIrisGenerationFixture(t, provider)
	meter := &stubIrisMeter{features: true, tokens: true}
	api.meter = meter
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
		"idempotencyKey": "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
		"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+jsonJobID(t, rec), nil)
	var job irisJobRecord
	require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
	require.Equal(t, "failed", job.Status)
	require.Empty(t, meter.tracks)
	require.Empty(t, meter.tokenTracks)
}

func TestIrisPendingIndexAtomicAcrossInstances(t *testing.T) {
	store := presigningMemory{Store: memory.New()}
	reg, err := objectstore.NewRegistry("s3-files", map[string]objectstore.Store{"s3-files": store})
	require.NoError(t, err)
	newAPI := func() *irisGenerationAPI {
		return &irisGenerationAPI{
			objects: reg,
			now:     func() time.Time { return time.Date(2026, 10, 24, 1, 0, 0, 0, time.UTC) },
			run:     func(func()) {},
		}
	}
	const n = 20
	var wg sync.WaitGroup
	for i := range n {
		api := newAPI()
		job := irisJobRecord{ID: fmt.Sprintf("job_%d", i), OrgID: "org_local", UserID: "user_iris"}
		wg.Go(func() { require.NoError(t, api.enqueuePending(t.Context(), job)) })
	}
	wg.Wait()
	pending, err := newAPI().listPending(t.Context())
	require.NoError(t, err)
	require.Len(t, pending, n)

	api1, api2 := newAPI(), newAPI()
	jobExtra := irisJobRecord{ID: "job_extra", OrgID: "org_local", UserID: "user_iris"}
	wg.Go(func() { require.NoError(t, api1.dequeuePending(t.Context(), "job_0")) })
	wg.Go(func() { require.NoError(t, api2.enqueuePending(t.Context(), jobExtra)) })
	wg.Wait()
	pending, err = api1.listPending(t.Context())
	require.NoError(t, err)
	ids := map[string]struct{}{}
	for _, job := range pending {
		ids[job.JobID] = struct{}{}
	}
	require.NotContains(t, ids, "job_0")
	require.Contains(t, ids, "job_extra")
	require.Len(t, ids, n)
}

func TestIrisPendingRecoveryReadsPerJobObjects(t *testing.T) {
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{
		Bytes: []byte("png-bytes"), Filename: "image.png", ContentType: "image/png",
	}}}
	api := newIrisGenerationFixture(t, provider)
	api.run = func(func()) {}
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
		"idempotencyKey": "bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
		"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, 0, provider.calls)
	require.NoError(t, api.putJSON(t.Context(), irisPendingIndexKey(), irisPendingIndex{}))

	api.run = func(fn func()) { fn() }
	api.recoverPending(t.Context())
	require.Equal(t, 1, provider.calls)
	got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+jsonJobID(t, rec), nil)
	var job irisJobRecord
	require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
	require.Equal(t, "succeeded", job.Status)
}

func TestIrisGenerationPersistsProviderTimeout(t *testing.T) {
	provider := &stubIrisProvider{blockUntilDone: true}
	api := newIrisGenerationFixture(t, provider)
	api.timeout = 20 * time.Millisecond
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/generate", map[string]any{
		"idempotencyKey": "ccccccc1-cccc-cccc-cccc-ccccccccccc1",
		"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	got := irisRequest(api, http.MethodGet, irisTestPath+"/jobs/"+jsonJobID(t, rec), nil)
	var job irisJobRecord
	require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
	require.Equal(t, "failed", job.Status)
	require.NotNil(t, job.Error)
	require.Equal(t, "PROVIDER_ERROR", job.Error.Code)
	require.Contains(t, job.Error.Message, "context deadline exceeded")

	pending, err := api.listPending(t.Context())
	require.NoError(t, err)
	require.Empty(t, pending)
	var lock map[string]string
	require.ErrorIs(t, api.getJSON(t.Context(), irisRunLockKey(job.ID), &lock), objectstore.ErrNotFound)

	calls := provider.calls
	api.recoverPending(t.Context())
	require.Equal(t, calls, provider.calls)
}

func jsonJobID(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var job irisJobRecord
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &job))
	return job.ID
}

func TestIrisPublicHTTPSURL(t *testing.T) {
	tests := []struct {
		raw     string
		wantErr string
	}{
		{raw: "http://example.com/a.png", wantErr: "non-https"},
		{raw: "https://127.0.0.1/secret", wantErr: "non-public"},
		{raw: "https://10.0.0.1/secret", wantErr: "non-public"},
		{raw: "https://localhost/secret", wantErr: "non-public"},
		{raw: "https://example.com/a.png", wantErr: ""},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			parsed, err := parsePublicHTTPSURL(tt.raw)
			if tt.wantErr == "" {
				require.NoError(t, err)
				require.Equal(t, "example.com", parsed.Hostname())
				return
			}
			require.Error(t, err)
			require.Contains(t, err.Error(), tt.wantErr)
		})
	}

	t.Run("honors a canceled fetch context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		_, _, err := fetchHTTPS(ctx, "https://example.com/file.png")
		require.Error(t, err)
	})
}

func TestIrisGatewayProviderUpscalerIncludesVideo(t *testing.T) {
	var payload map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/videos", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{"video":{"b64_json":"dmlkZW8="}}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL,
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("bytedance-upscaler")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{{
			Role:        "video",
			Bytes:       []byte("clip"),
			ContentType: "video/mp4",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("video"), outputs[0].Bytes)
	ref, _ := payload["input_reference"].(string)
	require.Contains(t, ref, "video/mp4")
	require.Contains(t, ref, "Y2xpcA==")
}

func TestIrisGatewayProviderImageEditForwardsAllReferences(t *testing.T) {
	var names []string
	var payloads [][]byte
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/images/edits", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		for _, header := range r.MultipartForm.File["image"] {
			names = append(names, header.Filename)
			file, err := header.Open()
			require.NoError(t, err)
			body, err := io.ReadAll(file)
			require.NoError(t, err)
			require.NoError(t, file.Close())
			payloads = append(payloads, body)
		}
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aW1n"}]}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL,
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("flux-2-klein")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "edit these frames",
		Inputs: []irisProviderInput{
			{Role: "start", Bytes: []byte("start"), ContentType: "image/png"},
			{Role: "end", Bytes: []byte("end"), ContentType: "image/png"},
			{Role: "image", Bytes: []byte("one"), ContentType: "image/png"},
			{Role: "image", Bytes: []byte("two"), ContentType: "image/png"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("img"), outputs[0].Bytes)
	require.Equal(t, []string{"input-1.png", "input-2.png", "input-3.png", "input-4.png"}, names)
	require.Equal(t, [][]byte{[]byte("start"), []byte("end"), []byte("one"), []byte("two")}, payloads)
}

func TestDecodeImageOutputsHonorsContext(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := decodeImageOutputs(ctx, []byte(`{"data":[{"url":"https://example.com/image.png"}]}`), "image", "png")
	require.Error(t, err)
}

func TestIrisGatewayProviderSpeechURL(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/audio/speech", r.URL.Path)
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("mp3"))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL,
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("elevenlabs-v4")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "hello",
		Voice:  "Roger",
	})
	require.NoError(t, err)
	require.Equal(t, []byte("mp3"), outputs[0].Bytes)
}

func TestIrisGatewayProviderFishAudioSpeechUsesGatewayID(t *testing.T) {
	var payload map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/audio/speech", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("fish-mp3"))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL,
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("fish-audio-s2.1-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model:  model,
		Prompt: "hello",
		Voice:  "933563129e564b19a115bedd57b7406a",
	})
	require.NoError(t, err)
	require.Equal(t, []byte("fish-mp3"), outputs[0].Bytes)
	require.Equal(t, "fish-audio/s2.1-pro", payload["model"])
	require.Equal(t, "hello", payload["input"])
	require.Equal(t, "933563129e564b19a115bedd57b7406a", payload["voice"])
}

func TestIrisGatewayProviderTranscribeUsesV4Endpoint(t *testing.T) {
	audio := []byte("RIFF....WAVEfmt ")
	var gotPath, gotModel, gotProtocol, gotSpec, gotAuthMethod string
	var payload map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotModel = r.Header.Get("ai-model-id")
		gotProtocol = r.Header.Get("ai-gateway-protocol-version")
		gotSpec = r.Header.Get("ai-transcription-model-specification-version")
		gotAuthMethod = r.Header.Get("ai-gateway-auth-method")
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{"text":"hello from vo","segments":[{"text":"hello from vo","startSecond":0.1,"endSecond":1.2}],"language":"en"}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL + "/v1",
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("universal-3.5-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{{
			Role:        "audio",
			Bytes:       audio,
			ContentType: "audio/wav",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "/v4/ai/transcription-model", gotPath)
	require.Equal(t, "google/gemini-3.5-transcribe", gotModel)
	require.Equal(t, irisGatewayProtocolVersion, gotProtocol)
	require.Equal(t, irisTranscriptionSpecVersion, gotSpec)
	require.Equal(t, "api-key", gotAuthMethod)
	require.Equal(t, "audio/wav", payload["mediaType"])
	require.Equal(t, base64.StdEncoding.EncodeToString(audio), payload["audio"])
	require.JSONEq(t, `[{"text":"hello from vo","words":[{"text":"hello from vo","start":0.1,"end":1.2}]}]`, string(outputs[0].Bytes))
}

func TestIrisGatewayProviderFishAudioTranscribeUsesGatewayID(t *testing.T) {
	audio := []byte("RIFF....WAVEfmt ")
	var gotModel string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotModel = r.Header.Get("ai-model-id")
		require.Equal(t, "/v4/ai/transcription-model", r.URL.Path)
		_, _ = w.Write([]byte(`{"text":"fish transcript","segments":[{"text":"fish transcript","startSecond":0,"endSecond":1}]}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL:    server.URL + "/v1",
		apiKey:     "test-key",
		httpClient: server.Client(),
	}
	model, ok := irisModelByID("fish-audio-transcribe-1")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{{
			Role:        "audio",
			Bytes:       audio,
			ContentType: "audio/wav",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "fish-audio/transcribe-1", gotModel)
	require.JSONEq(t, `[{"text":"fish transcript","words":[{"text":"fish transcript","start":0,"end":1}]}]`, string(outputs[0].Bytes))
}

func TestIrisGatewayProviderTranscribeOpenAIUsesMultipart(t *testing.T) {
	audio := []byte("id3-mp3")
	var gotPath, gotModel, gotFileType, gotFilename string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		require.NoError(t, r.ParseMultipartForm(1<<20))
		gotModel = r.FormValue("model")
		file, header, err := r.FormFile("file")
		require.NoError(t, err)
		gotFileType = header.Header.Get("Content-Type")
		gotFilename = header.Filename
		body, err := io.ReadAll(file)
		require.NoError(t, err)
		require.NoError(t, file.Close())
		require.Equal(t, audio, body)
		_, _ = w.Write([]byte(`{"text":"whispered"}`))
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
	model, ok := irisModelByID("universal-3.5-pro")
	require.True(t, ok)
	outputs, err := provider.Generate(t.Context(), irisProviderRequest{
		Model: model,
		Inputs: []irisProviderInput{{
			Role:        "audio",
			Bytes:       audio,
			ContentType: "audio/mpeg",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "/v1/audio/transcriptions", gotPath)
	require.Equal(t, "google/gemini-3.5-transcribe", gotModel)
	require.Equal(t, "audio/mpeg", gotFileType)
	require.Equal(t, "audio.mp3", gotFilename)
	require.JSONEq(t, `[{"text":"whispered","words":[]}]`, string(outputs[0].Bytes))
}

func TestIrisGatewayV4BaseURL(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in, want string
	}{
		{"", defaultIrisGatewayV4BaseURL},
		{defaultIrisGatewayBaseURL, defaultIrisGatewayV4BaseURL},
		{"https://ai-gateway.vercel.sh/v1/", defaultIrisGatewayV4BaseURL},
		{defaultIrisGatewayV4BaseURL, defaultIrisGatewayV4BaseURL},
		{"https://gateway.example/v1", "https://gateway.example/v4/ai"},
		{"https://127.0.0.1:1234", "https://127.0.0.1:1234/v4/ai"},
	}
	for _, tc := range tests {
		name := tc.in
		if name == "" {
			name = "empty"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, irisGatewayV4BaseURL(tc.in))
		})
	}
}

func TestNormalizeTranscript(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "gateway v4 segments",
			in:   `{"text":"hello from vo","segments":[{"text":"hello from vo","startSecond":0.1,"endSecond":1.2}],"language":"en"}`,
			want: `[{"text":"hello from vo","words":[{"text":"hello from vo","start":0.1,"end":1.2}]}]`,
		},
		{
			name: "openai words",
			in:   `{"text":"hi there","words":[{"word":"hi","start":0,"end":0.2},{"word":"there","start":0.21,"end":0.5}]}`,
			want: `[{"text":"hi there","words":[{"text":"hi","start":0,"end":0.2},{"text":"there","start":0.21,"end":0.5}]}]`,
		},
		{
			name: "plain text fallback",
			in:   `just the words`,
			want: `[{"text":"just the words","words":[]}]`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.JSONEq(t, tc.want, string(normalizeTranscript([]byte(tc.in))))
		})
	}
}

func TestIrisAudioMediaType(t *testing.T) {
	t.Parallel()
	require.Equal(t, "audio/mpeg", irisAudioMediaType(irisProviderInput{ContentType: "audio/mpeg; codecs=mp3"}))
	require.Equal(t, "audio/wav", irisAudioMediaType(irisProviderInput{ContentType: "application/octet-stream"}))
	require.Equal(t, "audio.mp3", irisAudioFilename("audio/mpeg"))
	require.Equal(t, "audio.wav", irisAudioFilename("audio/wav"))
}
