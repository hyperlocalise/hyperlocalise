package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

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
	outputs []irisProviderOutput
	err     error
	calls   int
	last    irisProviderRequest
	during  func()
}

func (s *stubIrisProvider) Generate(_ context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	s.calls++
	s.last = req
	if s.during != nil {
		s.during()
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
		rec := irisRequest(api, http.MethodGet, "/v1/iris/models", nil)
		require.Equal(t, http.StatusOK, rec.Code)
		var models []irisModelInfo
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &models))
		require.GreaterOrEqual(t, len(models), 20)
		_, ok := irisModelByID("flux-2-klein")
		require.True(t, ok)
		_, ok = irisModelByID("elevenlabs-v4")
		require.True(t, ok)
		_, ok = irisModelByID("seedance-2.5")
		require.True(t, ok)
	})

	t.Run("estimates image and voice", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, "/v1/iris/estimate", map[string]any{
			"model": "flux-2-klein", "prompt": "a cat", "count": 2,
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var estimate irisEstimate
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &estimate))
		require.Equal(t, 2.0, estimate.Credits)

		rec = irisRequest(api, http.MethodPost, "/v1/iris/estimate", map[string]any{
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
		rec := irisRequest(api, http.MethodPost, "/v1/iris/uploads", map[string]any{
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

		require.NoError(t, api.putBytes(t.Context(), irisUploadKey("user_iris", sha), "image/png", []byte("hello")))
		rec = irisRequest(api, http.MethodPost, "/v1/iris/uploads", map[string]any{
			"sha256": sha, "contentType": "image/png", "size": 5,
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var existing irisUploadResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &existing))
		require.Nil(t, existing.UploadURL)
	})

	t.Run("runs a generation job through S3", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
			"idempotencyKey": "11111111-1111-1111-1111-111111111111",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		require.NotEmpty(t, queued.ID)
		require.Equal(t, 1, provider.calls)

		got := irisRequest(api, http.MethodGet, "/v1/iris/jobs/"+queued.ID, nil)
		require.Equal(t, http.StatusOK, got.Code)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
		require.Equal(t, "succeeded", job.Status)
		require.Len(t, job.Assets, 1)
		require.Contains(t, job.Assets[0].URL, "https://s3.test/download/")
		require.Equal(t, "image.png", job.Assets[0].Filename)

		again := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
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
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
			"idempotencyKey": "44444444-4444-4444-4444-444444444444",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a dog"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		require.Equal(t, "queued", queued.Status)

		canceled := irisRequest(api, http.MethodPost, "/v1/iris/jobs/"+queued.ID+"/cancel", nil)
		require.Equal(t, http.StatusOK, canceled.Code)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(canceled.Body.Bytes(), &job))
		require.Equal(t, "canceled", job.Status)
		api.run = func(fn func()) { fn() }
	})

	t.Run("rejects unknown models and missing voice", func(t *testing.T) {
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
			"idempotencyKey": "22222222-2222-2222-2222-222222222222",
			"request":        map[string]any{"model": "not-a-model", "prompt": "x"},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)

		rec = irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
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
	req := httptest.NewRequest(http.MethodGet, "/v1/iris/models", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestIrisGenerationReviewFixes(t *testing.T) {
	t.Run("rejects oversized uploads", func(t *testing.T) {
		api := newIrisGenerationFixture(t, &stubIrisProvider{})
		sum := sha256.Sum256([]byte("hello"))
		rec := irisRequest(api, http.MethodPost, "/v1/iris/uploads", map[string]any{
			"sha256": hex.EncodeToString(sum[:]), "contentType": "image/png", "size": irisMaxUploadBytes + 1,
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("rejects remote asset URLs", func(t *testing.T) {
		api := newIrisGenerationFixture(t, &stubIrisProvider{})
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
			"idempotencyKey": "55555555-5555-5555-5555-555555555555",
			"request": map[string]any{
				"model": "bria-rmbg-2.0",
				"image": map[string]any{"kind": "url", "url": "https://127.0.0.1/secret.png"},
			},
		})
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "remote asset URLs are not supported")
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
		}
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
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
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
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
		got := irisRequest(api, http.MethodGet, "/v1/iris/jobs/"+queued.ID, nil)
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
		rec := irisRequest(api, http.MethodPost, "/v1/iris/generate", map[string]any{
			"idempotencyKey": "88888888-8888-8888-8888-888888888888",
			"request":        map[string]any{"model": "flux-2-klein", "prompt": "a cat"},
		})
		require.Equal(t, http.StatusOK, rec.Code)
		var queued irisJobRecord
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
		provider.during = func() {
			canceled := irisRequest(api, http.MethodPost, "/v1/iris/jobs/"+queued.ID+"/cancel", nil)
			require.Equal(t, http.StatusOK, canceled.Code)
		}
		run()
		got := irisRequest(api, http.MethodGet, "/v1/iris/jobs/"+queued.ID, nil)
		var job irisJobRecord
		require.NoError(t, json.Unmarshal(got.Body.Bytes(), &job))
		require.Equal(t, "canceled", job.Status)
		require.Equal(t, 1, provider.calls)
	})
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
