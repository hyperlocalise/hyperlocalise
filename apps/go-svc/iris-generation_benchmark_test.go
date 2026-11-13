package main

import (
	"strings"
	"testing"
)

func BenchmarkValidateIrisGenerateRequest(b *testing.B) {
	asset := map[string]any{"kind": "asset", "id": irisTestAssetID}
	requests := []struct {
		name string
		req  irisGenerateRequest
	}{
		{name: "Image", req: irisGenerateRequest{"model": "flux-2-pro", "prompt": "a product photo"}},
		{name: "Voice", req: irisGenerateRequest{"model": "elevenlabs-v4", "prompt": "hello", "voice": "Roger"}},
		{name: "Tool", req: irisGenerateRequest{"model": "bria-rmbg-2.0", "image": asset}},
		{name: "RejectURL", req: irisGenerateRequest{"model": "flux-2-pro", "prompt": "hello", "image": map[string]any{"kind": "url", "url": "https://cdn.example.com/a.png"}}},
		{name: "Unknown", req: irisGenerateRequest{"model": "missing", "prompt": "hello"}},
	}
	for _, bm := range requests {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = validateIrisGenerateRequest(bm.req)
			}
		})
	}
}

func BenchmarkIrisModelByID(b *testing.B) {
	ids := []string{"flux-2-pro", "elevenlabs-v4", "qwen3.8-omni-flash", "missing"}
	b.ReportAllocs()
	for b.Loop() {
		for _, id := range ids {
			_, _ = irisModelByID(id)
		}
	}
}

func BenchmarkIsSHA256(b *testing.B) {
	values := []string{irisTestAssetID, strings.ToUpper(irisTestAssetID), "not-a-hash", ""}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			_ = isSHA256(value)
		}
	}
}
