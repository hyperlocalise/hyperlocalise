package experiment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var (
	benchExactCriterion = json.RawMessage(`{"type":"attribute","name":"plan","match":"exact","value":"pro"}`)
	benchTreeCriterion  = json.RawMessage(`{"type":"and","children":[{"type":"attribute","name":"plan","match":"exact","value":"pro"},{"type":"or","children":[{"type":"attribute","name":"country","match":"in","value":["AU","NZ"]},{"type":"attribute","name":"locale","match":"contains_substring","value":"en"}]}]}`)
	benchAttributes     = map[string]any{"plan": "pro", "country": "AU", "locale": "en-AU"}
)

func BenchmarkCalculateBucket(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = calculateBucket("exp-1", "user-1", 14981723)
	}
}

func BenchmarkMurmurhash3(b *testing.B) {
	key := "experimentId:exp-1::targetingKey:user-1"
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = murmurhash3(key, 14981723)
	}
}

func BenchmarkCalculateAllocationRanges(b *testing.B) {
	benchmarks := []struct {
		name              string
		experimentRollout int
		variants          []int
	}{
		{name: "Toggle", experimentRollout: 10000, variants: []int{10000}},
		{name: "AB", experimentRollout: 10000, variants: []int{5000, 5000}},
		{name: "ABPartial", experimentRollout: 2500, variants: []int{4000, 6000}},
		{name: "FiveVariants", experimentRollout: 10000, variants: []int{2000, 2000, 2000, 2000, 2000}},
	}
	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = calculateAllocationRanges(bm.experimentRollout, bm.variants)
			}
		})
	}
}

func BenchmarkEvaluateCriterion(b *testing.B) {
	benchmarks := []struct {
		name       string
		criterion  json.RawMessage
		attributes map[string]any
	}{
		{name: "None", criterion: nil, attributes: benchAttributes},
		{name: "Exact", criterion: benchExactCriterion, attributes: benchAttributes},
		{name: "Tree", criterion: benchTreeCriterion, attributes: benchAttributes},
	}
	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_, _ = evaluateCriterion(bm.criterion, bm.attributes)
			}
		})
	}
}

func BenchmarkHashClientKey(b *testing.B) {
	key := "hlk_benchmark_publishable_key"
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = HashClientKey(key)
	}
}

func BenchmarkEvaluateFlags(b *testing.B) {
	benchmarks := []struct {
		name      string
		flagCount int
		criterion json.RawMessage
	}{
		{name: "OneNoCriterion", flagCount: 1, criterion: nil},
		{name: "OneExact", flagCount: 1, criterion: benchExactCriterion},
		{name: "TenExact", flagCount: 10, criterion: benchExactCriterion},
		{name: "FiftyExact", flagCount: 50, criterion: benchExactCriterion},
	}
	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			store, flags := benchEvalStore(bm.flagCount, bm.criterion)
			ctx := context.Background()
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = evaluateFlags(ctx, store, "org-1", flags, "user-1", benchAttributes)
			}
		})
	}

	b.Run("ConfigOnly", func(b *testing.B) {
		store := NewMemoryStore("org-1")
		flags := []FlagRecord{{
			ID:          "f-config",
			Key:         "copy",
			Kind:        "config",
			ConfigValue: []byte(`{"title":"Hello"}`),
		}}
		store.SetFlags(flags)
		ctx := context.Background()
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			_, _ = evaluateFlags(ctx, store, "org-1", flags, "user-1", benchAttributes)
		}
	})
}

type nopEvaluationCache struct{}

func (nopEvaluationCache) get(string) (cachedEvaluation, bool) {
	return cachedEvaluation{}, false
}

func (nopEvaluationCache) set(string, cachedEvaluation) {}

func BenchmarkOFREPEvaluateOne(b *testing.B) {
	_, mux := benchOFREPHandler(1, benchExactCriterion)
	body := []byte(`{"context":{"targetingKey":"user-1","plan":"pro","country":"AU","locale":"en-AU"}}`)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/flag-0", bytes.NewReader(body))
		req.Header.Set("X-API-Key", "hlk_test")
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			b.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
	}
}

func BenchmarkOFREPEvaluateAll(b *testing.B) {
	body := []byte(`{"context":{"targetingKey":"user-1","plan":"pro","country":"AU","locale":"en-AU"}}`)
	for _, flagCount := range []int{1, 10, 50} {
		b.Run(fmt.Sprintf("Miss/%d", flagCount), func(b *testing.B) {
			handler, mux := benchOFREPHandler(flagCount, benchExactCriterion)
			handler.cache = nopEvaluationCache{}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				rec := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags", bytes.NewReader(body))
				req.Header.Set("X-API-Key", "hlk_test")
				mux.ServeHTTP(rec, req)
				if rec.Code != http.StatusOK {
					b.Fatalf("status %d: %s", rec.Code, rec.Body.String())
				}
			}
		})
		b.Run(fmt.Sprintf("Hit/%d", flagCount), func(b *testing.B) {
			_, mux := benchOFREPHandler(flagCount, benchExactCriterion)
			warm := httptest.NewRecorder()
			warmReq := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags", bytes.NewReader(body))
			warmReq.Header.Set("X-API-Key", "hlk_test")
			mux.ServeHTTP(warm, warmReq)
			if warm.Code != http.StatusOK {
				b.Fatalf("warm status %d: %s", warm.Code, warm.Body.String())
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				rec := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags", bytes.NewReader(body))
				req.Header.Set("X-API-Key", "hlk_test")
				mux.ServeHTTP(rec, req)
				if rec.Code != http.StatusOK {
					b.Fatalf("status %d: %s", rec.Code, rec.Body.String())
				}
			}
		})
	}
}

func BenchmarkTTLCache(b *testing.B) {
	value := cachedEvaluation{body: []byte(`{"flags":[]}`), etag: "abc123"}
	b.Run("Set", func(b *testing.B) {
		cache := newTTLCache(time.Minute)
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			cache.set("org-1:user-1:attrs", value)
		}
	})
	b.Run("GetHit", func(b *testing.B) {
		cache := newTTLCache(time.Minute)
		cache.set("org-1:user-1:attrs", value)
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			_, _ = cache.get("org-1:user-1:attrs")
		}
	})
	b.Run("GetMiss", func(b *testing.B) {
		cache := newTTLCache(time.Minute)
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_, _ = cache.get("missing")
		}
	})
}

func benchEvalStore(flagCount int, criterion json.RawMessage) (*MemoryStore, []FlagRecord) {
	store := NewMemoryStore("org-1")
	flags := make([]FlagRecord, flagCount)
	rows := make([]EvalRow, flagCount)
	for i := 0; i < flagCount; i++ {
		id := fmt.Sprintf("f-%d", i)
		flags[i] = FlagRecord{ID: id, Key: fmt.Sprintf("flag-%d", i), Kind: "experiment"}
		rows[i] = EvalRow{
			FlagID:       id,
			ExperimentID: fmt.Sprintf("exp-%d", i),
			Seed:         1,
			VariantKey:   "treatment",
			AllocStart:   0,
			AllocEnd:     9999,
			Enabled:      true,
			Payload:      []byte(`true`),
			Criterion:    criterion,
		}
	}
	store.SetFlags(flags)
	store.SetRows(rows)
	return store, flags
}

func benchOFREPHandler(flagCount int, criterion json.RawMessage) (*OFREPHandler, *http.ServeMux) {
	store, _ := benchEvalStore(flagCount, criterion)
	store.AddKey("hlk_test")
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)
	return handler, mux
}
