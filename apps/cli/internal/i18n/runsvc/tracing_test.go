package runsvc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func withTestSpanRecorder(t *testing.T) *tracetest.SpanRecorder {
	t.Helper()
	rec := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec))
	previous := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() { otel.SetTracerProvider(previous) })
	return rec
}

func findSpan(t *testing.T, rec *tracetest.SpanRecorder, name string) sdktrace.ReadOnlySpan {
	t.Helper()
	for _, span := range rec.Ended() {
		if span.Name() == name {
			return span
		}
	}
	t.Fatalf("no ended span named %q found among %d spans", name, len(rec.Ended()))
	return nil
}

func findSpanOrNil(rec *tracetest.SpanRecorder, name string) sdktrace.ReadOnlySpan {
	for _, span := range rec.Ended() {
		if span.Name() == name {
			return span
		}
	}
	return nil
}

func stringSliceAttr(t *testing.T, span sdktrace.ReadOnlySpan, key string) []string {
	t.Helper()
	for _, kv := range span.Attributes() {
		if string(kv.Key) == key {
			return kv.Value.AsStringSlice()
		}
	}
	t.Fatalf("span %q missing attribute %q (attrs=%+v)", span.Name(), key, span.Attributes())
	return nil
}

func stringAttr(t *testing.T, span sdktrace.ReadOnlySpan, key string) string {
	t.Helper()
	for _, kv := range span.Attributes() {
		if string(kv.Key) == key {
			return kv.Value.AsString()
		}
	}
	t.Fatalf("span %q missing attribute %q (attrs=%+v)", span.Name(), key, span.Attributes())
	return ""
}

func int64Attr(t *testing.T, span sdktrace.ReadOnlySpan, key string) int64 {
	t.Helper()
	for _, kv := range span.Attributes() {
		if string(kv.Key) == key {
			return kv.Value.AsInt64()
		}
	}
	t.Fatalf("span %q missing attribute %q (attrs=%+v)", span.Name(), key, span.Attributes())
	return 0
}

func newFakeGoogleTranslateServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Q []string `json:"q"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		type translation struct {
			TranslatedText string `json:"translatedText"`
		}
		translations := make([]translation, len(body.Q))
		for i, q := range body.Q {
			translations[i] = translation{TranslatedText: strings.ToUpper(q)}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"translations": translations},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func writeMixedLLMAndMTConfig(t *testing.T, dir, apiKeyEnv, googleBaseURL string) *config.I18NConfig {
	t.Helper()
	sourceLLM := filepath.Join(dir, "docs", "en.json")
	sourceMT := filepath.Join(dir, "ui", "en.json")
	if err := os.MkdirAll(filepath.Dir(sourceLLM), 0o755); err != nil {
		t.Fatalf("mkdir docs source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(sourceMT), 0o755); err != nil {
		t.Fatalf("mkdir ui source dir: %v", err)
	}
	if err := os.WriteFile(sourceLLM, []byte(`{"hello":"hello"}`), 0o644); err != nil {
		t.Fatalf("write docs source: %v", err)
	}
	if err := os.WriteFile(sourceMT, []byte(`{"hello":"hello"}`), 0o644); err != nil {
		t.Fatalf("write ui source: %v", err)
	}

	configPath := filepath.Join(dir, "i18n.yml")
	configContent := `
locales:
  source: en
  targets:
    - fr
groups:
  docs-team:
    targets:
      - fr
    buckets:
      - docs
  bulk-ui:
    targets:
      - fr
    buckets:
      - ui
buckets:
  docs:
    files:
      - from: ` + sourceLLM + `
        to: ` + filepath.Join(dir, "out", "docs", "{{target}}.json") + `
  ui:
    files:
      - from: ` + sourceMT + `
        to: ` + filepath.Join(dir, "out", "ui", "{{target}}.json") + `
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
mt:
  profiles:
    google:
      provider: google
      api_key_env: ` + apiKeyEnv + `
      base_url: ` + googleBaseURL + `
translation:
  default:
    type: llm
    profile: default
  rules:
    - priority: 100
      group: bulk-ui
      type: mt
      profile: google
`
	if err := os.WriteFile(configPath, []byte(configContent), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	return cfg
}

func TestRunTracingMixedLLMAndMTSetsTranslationTypeAndProviderAttributes(t *testing.T) {
	rec := withTestSpanRecorder(t)
	dir := t.TempDir()

	const apiKeyEnv = "TEST_GOOGLE_TRANSLATE_API_KEY"
	const fakeAPIKey = "super-secret-test-key"
	t.Setenv(apiKeyEnv, fakeAPIKey)
	server := newFakeGoogleTranslateServer(t)

	cfg := writeMixedLLMAndMTConfig(t, dir, apiKeyEnv, server.URL)

	svc := newTestService()
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) { return cfg, nil }
	svc.readFile = os.ReadFile
	svc.numCPU = func() int { return 2 }

	report, err := svc.Run(context.Background(), Input{
		ConfigPath: filepath.Join(dir, "i18n.yml"),
		Force:      true,
		Workers:    2,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Succeeded != 2 || report.Failed != 0 {
		t.Fatalf("report succeeded/failed=%d/%d, want 2/0 (report=%+v)", report.Succeeded, report.Failed, report)
	}

	execPoolSpan := findSpan(t, rec, "run.execute_pool")
	gotTypes := stringSliceAttr(t, execPoolSpan, "translation.type")
	wantTypes := []string{config.TranslationTypeLLM, config.TranslationTypeMT}
	if len(gotTypes) != len(wantTypes) || gotTypes[0] != wantTypes[0] || gotTypes[1] != wantTypes[1] {
		t.Fatalf("run.execute_pool translation.type=%v, want %v", gotTypes, wantTypes)
	}
	if got := int64Attr(t, execPoolSpan, "run.llm_task_count"); got != 1 {
		t.Fatalf("run.llm_task_count=%d, want 1", got)
	}
	if got := int64Attr(t, execPoolSpan, "run.mt_task_count"); got != 1 {
		t.Fatalf("run.mt_task_count=%d, want 1", got)
	}

	mtEnginesSpan := findSpan(t, rec, "run.mt_engines")
	if got := stringSliceAttr(t, mtEnginesSpan, "run.mt_profiles"); len(got) != 1 || got[0] != "google" {
		t.Fatalf("run.mt_engines run.mt_profiles=%v, want [google]", got)
	}
	if got := stringSliceAttr(t, mtEnginesSpan, "mt.provider"); len(got) != 1 || got[0] != "google" {
		t.Fatalf("run.mt_engines mt.provider=%v, want [google]", got)
	}

	mtBatchSpan := findSpan(t, rec, "run.execute_pool.mt")
	if got := stringAttr(t, mtBatchSpan, "translation.type"); got != config.TranslationTypeMT {
		t.Fatalf("run.execute_pool.mt translation.type=%q, want %q", got, config.TranslationTypeMT)
	}
	if got := stringSliceAttr(t, mtBatchSpan, "mt.provider"); len(got) != 1 || got[0] != "google" {
		t.Fatalf("run.execute_pool.mt mt.provider=%v, want [google]", got)
	}

	// Secret safety: the resolved API key must never reach any span attribute.
	for _, span := range rec.Ended() {
		for _, kv := range span.Attributes() {
			if strings.Contains(kv.Value.Emit(), fakeAPIKey) {
				t.Fatalf("span %q attribute %q leaked the API key: %s", span.Name(), kv.Key, kv.Value.Emit())
			}
		}
	}
}

func TestRunTracingLLMOnlyRunOmitsMTSpansAndReportsSingleType(t *testing.T) {
	rec := withTestSpanRecorder(t)

	svc := newTestService()
	report, err := svc.Run(context.Background(), Input{Force: true, Workers: 1})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Succeeded != 1 {
		t.Fatalf("report.Succeeded=%d, want 1", report.Succeeded)
	}

	execPoolSpan := findSpan(t, rec, "run.execute_pool")
	gotTypes := stringSliceAttr(t, execPoolSpan, "translation.type")
	if len(gotTypes) != 1 || gotTypes[0] != config.TranslationTypeLLM {
		t.Fatalf("run.execute_pool translation.type=%v, want [llm]", gotTypes)
	}
	if got := int64Attr(t, execPoolSpan, "run.mt_task_count"); got != 0 {
		t.Fatalf("run.mt_task_count=%d, want 0", got)
	}

	if span := findSpanOrNil(rec, "run.mt_engines"); span != nil {
		t.Fatalf("expected no run.mt_engines span for an LLM-only run, got one with attrs %+v", span.Attributes())
	}
	if span := findSpanOrNil(rec, "run.execute_pool.mt"); span != nil {
		t.Fatalf("expected no run.execute_pool.mt span for an LLM-only run, got one with attrs %+v", span.Attributes())
	}
}
