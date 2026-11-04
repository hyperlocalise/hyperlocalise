package translator

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/openai/openai-go/v3"
)

const (
	benchShortSource    = "Save changes"
	benchLongSource     = "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>. User %1$s uploaded %2$d files on {date, date, medium}. Contact <a href=\"https://example.com/support\">support</a> if you need help."
	benchRuntimeContext = "Entry key: inbox.summary.description\nDescription: Shown under the inbox title when the user has unread messages.\nGlossary: inbox => boîte de réception; folder => dossier\nShared memory: Use informal tone (tu) for all French UI strings."
)

type benchProvider struct {
	output string
}

func (p benchProvider) Name() string { return "bench" }

func (p benchProvider) Translate(context.Context, Request) (string, error) {
	return p.output, nil
}

func BenchmarkBuildSystemPrompt(b *testing.B) {
	benchmarks := []struct {
		name string
		req  Request
	}{
		{"Default", Request{TargetLanguage: "fr-FR"}},
		{"DefaultWithRuntimeContext", Request{TargetLanguage: "fr-FR", RuntimeContext: benchRuntimeContext}},
		{"CustomWithRuntimeContext", Request{SystemPrompt: "Translate into formal German. Keep placeholders.", RuntimeContext: benchRuntimeContext}},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = buildSystemPrompt(bm.req)
			}
		})
	}
}

func BenchmarkBuildUserPrompt(b *testing.B) {
	benchmarks := []struct {
		name string
		req  Request
	}{
		{"ShortUI", Request{Source: benchShortSource, TargetLanguage: "fr-FR"}},
		{"LongICUHTML", Request{Source: benchLongSource, TargetLanguage: "de-DE"}},
		{"LongICUHTML_x20", Request{Source: strings.Repeat(benchLongSource+" ", 20), TargetLanguage: "ja-JP"}},
		{"Custom", Request{Source: benchShortSource, UserPrompt: "Translate: Save changes"}},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = buildUserPrompt(bm.req)
			}
		})
	}
}

func BenchmarkSanitizeGeneratedText(b *testing.B) {
	benchmarks := []struct {
		name string
		text string
	}{
		{"ShortClean", "Enregistrer les modifications"},
		{"LongClean", strings.Repeat(benchLongSource+" ", 5)},
		{"TrailingMarkers", "  Enregistrer les modifications<|eot_id|></s>\n"},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = sanitizeGeneratedText(bm.text)
			}
		})
	}
}

func BenchmarkResponseText(b *testing.B) {
	benchmarks := []struct {
		name    string
		payload string
	}{
		{
			name:    "Stop",
			payload: `{"id":"chatcmpl-1","object":"chat.completion","created":1,"model":"gpt-5","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Cliquez sur <link>{action}</link> pour voir {count, plural, one {un message} other {# messages}} dans votre <b>{folder}</b>."}}],"usage":{"prompt_tokens":120,"completion_tokens":40,"total_tokens":160}}`,
		},
		{
			name:    "ChoiceProviderError",
			payload: `{"id":"chatcmpl-2","object":"chat.completion","created":1,"model":"gpt-5","choices":[{"index":0,"finish_reason":"error","error":{"code":502,"message":"Upstream provider unavailable"},"message":{"role":"assistant","content":"Cliquez"}}]}`,
		},
		{
			name:    "Length",
			payload: `{"id":"chatcmpl-3","object":"chat.completion","created":1,"model":"gpt-5","choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":"Cliquez sur"}}]}`,
		},
	}

	for _, bm := range benchmarks {
		var resp openai.ChatCompletion
		if err := json.Unmarshal([]byte(bm.payload), &resp); err != nil {
			b.Fatal(err)
		}
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = responseText(&resp)
			}
		})
	}
}

func BenchmarkFormatChoiceProviderError(b *testing.B) {
	benchmarks := []struct {
		name string
		raw  string
	}{
		{"NumericCode", `{"code":502,"message":"Upstream provider unavailable"}`},
		{"StringCode", `{"code":"503","message":"Service temporarily overloaded"}`},
		{"NotJSON", `upstream timed out`},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = formatChoiceProviderError(bm.raw)
			}
		})
	}
}

func BenchmarkMaskSecrets(b *testing.B) {
	systemPrompt := buildSystemPrompt(Request{TargetLanguage: "fr-FR", RuntimeContext: benchRuntimeContext})
	benchmarks := []struct {
		name string
		text string
	}{
		{"ShortNoSecrets", benchShortSource},
		{"SystemPromptNoSecrets", systemPrompt},
		{"UserPromptLong", buildUserPrompt(Request{Source: strings.Repeat(benchLongSource+" ", 20), TargetLanguage: "fr-FR"})},
		{"WithSecrets", "api key sk-proj-abcdefghijklmnopqrstuvwxyz0123 and aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY0 in logs"},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = maskSecrets(bm.text)
			}
		})
	}
}

func BenchmarkToolTranslate(b *testing.B) {
	b.Setenv(envPromptDebugEnabled, "")
	b.Setenv(envGenericDebug, "")

	tool := &Tool{providers: map[string]Provider{}}
	tool.MustRegister(benchProvider{output: "  Cliquez sur <link>{action}</link> pour voir {count, plural, one {un message} other {# messages}}.  "})
	ctx := context.Background()

	benchmarks := []struct {
		name string
		req  Request
	}{
		{"ShortUI", Request{Source: benchShortSource, TargetLanguage: "fr-FR", ModelProvider: "bench", Model: "bench-model"}},
		{"LongWithRuntimeContext", Request{Source: benchLongSource, TargetLanguage: "fr-FR", ModelProvider: "bench", Model: "bench-model", RuntimeContext: benchRuntimeContext}},
		{"Long_x20WithRuntimeContext", Request{Source: strings.Repeat(benchLongSource+" ", 20), TargetLanguage: "fr-FR", ModelProvider: "bench", Model: "bench-model", RuntimeContext: benchRuntimeContext}},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = tool.Translate(ctx, bm.req)
			}
		})
	}
}

func BenchmarkNormalizeUsage(b *testing.B) {
	usage := Usage{PromptTokens: 1200, CompletionTokens: 340, CachedInputTokens: 800}
	b.ReportAllocs()
	for b.Loop() {
		_ = NormalizeUsage(usage, UsageTotalFallbackAnthropic)
	}
}
