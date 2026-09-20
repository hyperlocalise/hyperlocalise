package autumn

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func BenchmarkCheck(b *testing.B) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"allowed":true,"customer_id":"org_1"}`))
	}))
	b.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		res, err := client.Check(ctx, CheckRequest{CustomerID: "org_1", FeatureID: QueriesBoard})
		if err != nil || !res.Allowed {
			b.Fatal(err)
		}
	}
}

func BenchmarkIsBooleanFeatureEnabled(b *testing.B) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"allowed":true}`))
	}))
	b.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if !IsBooleanFeatureEnabled(ctx, client, "org_1", QueriesBoard) {
			b.Fatal("expected allowed")
		}
	}
}

func BenchmarkIsBooleanFeatureEnabledFailClosed(b *testing.B) {
	client, err := NewClient(Config{})
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	b.ReportAllocs()
	for b.Loop() {
		if IsBooleanFeatureEnabled(ctx, client, "org_1", QueriesBoard) {
			b.Fatal("expected deny")
		}
		if IsBooleanFeatureEnabled(ctx, nil, "org_1", QueriesBoard) {
			b.Fatal("expected deny")
		}
	}
}

func BenchmarkTrack(b *testing.B) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	b.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	req := TrackRequest{CustomerID: "org_1", FeatureID: "jobs", Value: 1, IdempotencyKey: "op:1"}
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if err := client.Track(ctx, req); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkTrackTokens(b *testing.B) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"value":0.01}`))
	}))
	b.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	req := TrackTokensRequest{
		CustomerID:   "org_1",
		FeatureID:    "ai_tokens",
		ModelID:      "openai/gpt-5.6-luna",
		InputTokens:  40,
		OutputTokens: 12,
	}
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if err := client.TrackTokens(ctx, req); err != nil {
			b.Fatal(err)
		}
	}
}
