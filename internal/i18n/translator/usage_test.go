package translator

import (
	"encoding/json"
	"testing"

	"github.com/openai/openai-go/v3"
)

func TestUsageFromOpenAIChatPreservesDetails(t *testing.T) {
	t.Parallel()

	usage, ok := usageFromGenerateTextResponse(&openai.ChatCompletion{
		Usage: openai.CompletionUsage{
			PromptTokens:     100,
			CompletionTokens: 40,
			TotalTokens:      140,
			PromptTokensDetails: openai.CompletionUsagePromptTokensDetails{
				CachedTokens: 25,
				AudioTokens:  3,
			},
			CompletionTokensDetails: openai.CompletionUsageCompletionTokensDetails{
				ReasoningTokens:          9,
				AudioTokens:              2,
				AcceptedPredictionTokens: 4,
				RejectedPredictionTokens: 5,
			},
		},
	})
	if !ok {
		t.Fatal("expected usage")
	}
	if usage.InputTokens != 100 || usage.OutputTokens != 40 || usage.TotalTokens != 140 {
		t.Fatalf("unexpected totals: %+v", usage)
	}
	if usage.PromptTokens != 100 || usage.CompletionTokens != 40 {
		t.Fatalf("unexpected aliases: %+v", usage)
	}
	if usage.CachedInputTokens != 25 || usage.AudioInputTokens != 3 || usage.ReasoningTokens != 9 || usage.AudioOutputTokens != 2 {
		t.Fatalf("unexpected detail usage: %+v", usage)
	}
	if usage.AcceptedPredictionTokens != 4 || usage.RejectedPredictionTokens != 5 {
		t.Fatalf("unexpected prediction usage: %+v", usage)
	}
}

func TestUsageFromOpenAIImagePreservesModalityDetails(t *testing.T) {
	t.Parallel()

	usage, ok := usageFromImagesResponse(&openai.ImagesResponse{
		Usage: openai.ImagesResponseUsage{
			InputTokens:  50,
			OutputTokens: 20,
			TotalTokens:  70,
			InputTokensDetails: openai.ImagesResponseUsageInputTokensDetails{
				TextTokens:  10,
				ImageTokens: 40,
			},
			OutputTokensDetails: openai.ImagesResponseUsageOutputTokensDetails{
				TextTokens:  2,
				ImageTokens: 18,
			},
		},
	})
	if !ok {
		t.Fatal("expected usage")
	}
	if usage.InputTokens != 50 || usage.OutputTokens != 20 || usage.TotalTokens != 70 {
		t.Fatalf("unexpected totals: %+v", usage)
	}
	if usage.TextInputTokens != 10 || usage.ImageInputTokens != 40 || usage.TextOutputTokens != 2 || usage.ImageOutputTokens != 18 {
		t.Fatalf("unexpected modality usage: %+v", usage)
	}
}

func TestBedrockUsagePreservesCacheDetails(t *testing.T) {
	t.Parallel()

	body := []byte(`{
		"output":{"message":{"content":[{"text":"Bonjour"}]}},
		"usage":{
			"inputTokens":51,
			"outputTokens":12,
			"totalTokens":63,
			"cacheReadInputTokensCount":7,
			"cacheWriteInputTokensCount":5
		}
	}`)
	_, usage, err := responseTextFromBedrock(body)
	if err != nil {
		t.Fatal(err)
	}
	if usage.InputTokens != 51 || usage.OutputTokens != 12 || usage.TotalTokens != 63 {
		t.Fatalf("unexpected totals: %+v", usage)
	}
	if usage.CachedInputTokens != 7 || usage.CacheWriteInputTokens != 5 {
		t.Fatalf("unexpected cache usage: %+v", usage)
	}
	if !json.Valid(usage.RawProviderUsage) {
		t.Fatalf("raw usage is not valid json: %s", string(usage.RawProviderUsage))
	}
}

func TestAnthropicUsageDerivesTotalWithCache(t *testing.T) {
	t.Parallel()

	usage := UsageFromAnthropic(AnthropicUsageInput{
		InputTokens:              30,
		OutputTokens:             10,
		CacheCreationInputTokens: 4,
		CacheReadInputTokens:     6,
	})
	if usage.InputTokens != 30 || usage.OutputTokens != 10 || usage.TotalTokens != 50 {
		t.Fatalf("unexpected anthropic usage: %+v", usage)
	}
	if usage.CacheWriteInputTokens != 4 || usage.CachedInputTokens != 6 {
		t.Fatalf("unexpected anthropic cache usage: %+v", usage)
	}
}

func TestGeminiUsagePreservesThoughtsAndToolTokens(t *testing.T) {
	t.Parallel()

	usage := UsageFromGemini(GeminiUsageInput{
		PromptTokenCount:        100,
		CandidatesTokenCount:    30,
		TotalTokenCount:         145,
		CachedContentTokenCount: 20,
		ThoughtsTokenCount:      15,
		ToolUsePromptTokenCount: 8,
	})
	if usage.InputTokens != 100 || usage.OutputTokens != 30 || usage.TotalTokens != 145 {
		t.Fatalf("unexpected gemini usage: %+v", usage)
	}
	if usage.CachedInputTokens != 20 || usage.ReasoningTokens != 15 || usage.ToolInputTokens != 8 {
		t.Fatalf("unexpected gemini details: %+v", usage)
	}
}

func TestUsageHasValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		usage Usage
		want  bool
	}{
		{
			name:  "empty",
			usage: Usage{},
			want:  false,
		},
		{
			name:  "input tokens only",
			usage: Usage{InputTokens: 10},
			want:  true,
		},
		{
			name:  "output tokens only",
			usage: Usage{OutputTokens: 5},
			want:  true,
		},
		{
			name:  "total tokens only",
			usage: Usage{TotalTokens: 15},
			want:  true,
		},
		{
			name:  "prompt tokens alias",
			usage: Usage{PromptTokens: 10},
			want:  true,
		},
		{
			name:  "completion tokens alias",
			usage: Usage{CompletionTokens: 5},
			want:  true,
		},
		{
			name:  "cached input tokens",
			usage: Usage{CachedInputTokens: 100},
			want:  true,
		},
		{
			name:  "reasoning tokens",
			usage: Usage{ReasoningTokens: 50},
			want:  true,
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := UsageHasValues(tc.usage); got != tc.want {
				t.Errorf("UsageHasValues(%+v) = %v, want %v", tc.usage, got, tc.want)
			}
		})
	}
}

func TestNormalizeUsage(t *testing.T) {
	t.Parallel()

	// Helper to compare Usage structs ignoring RawProviderUsage which is non-comparable
	compareUsage := func(a, b Usage) bool {
		return a.InputTokens == b.InputTokens &&
			a.OutputTokens == b.OutputTokens &&
			a.TotalTokens == b.TotalTokens &&
			a.PromptTokens == b.PromptTokens &&
			a.CompletionTokens == b.CompletionTokens &&
			a.CachedInputTokens == b.CachedInputTokens &&
			a.CacheWriteInputTokens == b.CacheWriteInputTokens &&
			a.ReasoningTokens == b.ReasoningTokens &&
			a.TextInputTokens == b.TextInputTokens &&
			a.ImageInputTokens == b.ImageInputTokens &&
			a.AudioInputTokens == b.AudioInputTokens &&
			a.TextOutputTokens == b.TextOutputTokens &&
			a.ImageOutputTokens == b.ImageOutputTokens &&
			a.AudioOutputTokens == b.AudioOutputTokens &&
			a.ToolInputTokens == b.ToolInputTokens &&
			a.AcceptedPredictionTokens == b.AcceptedPredictionTokens &&
			a.RejectedPredictionTokens == b.RejectedPredictionTokens
	}

	tests := []struct {
		name     string
		in       Usage
		fallback UsageTotalFallback
		want     Usage
	}{
		{
			name: "populates input/output from aliases",
			in: Usage{
				PromptTokens:     10,
				CompletionTokens: 5,
			},
			fallback: UsageTotalFallbackInputOutput,
			want: Usage{
				InputTokens:      10,
				OutputTokens:     5,
				PromptTokens:     10,
				CompletionTokens: 5,
				TotalTokens:      15,
			},
		},
		{
			name: "populates aliases from input/output",
			in: Usage{
				InputTokens:  20,
				OutputTokens: 10,
			},
			fallback: UsageTotalFallbackInputOutput,
			want: Usage{
				InputTokens:      20,
				OutputTokens:     10,
				PromptTokens:     20,
				CompletionTokens: 10,
				TotalTokens:      30,
			},
		},
		{
			name: "anthropic total fallback includes cache",
			in: Usage{
				InputTokens:           100,
				OutputTokens:          50,
				CacheWriteInputTokens: 10,
				CachedInputTokens:     20,
			},
			fallback: UsageTotalFallbackAnthropic,
			want: Usage{
				InputTokens:           100,
				OutputTokens:          50,
				PromptTokens:          100,
				CompletionTokens:      50,
				CacheWriteInputTokens: 10,
				CachedInputTokens:     20,
				TotalTokens:           180, // 100 + 50 + 10 + 20
			},
		},
		{
			name: "does not overwrite existing total",
			in: Usage{
				InputTokens:  10,
				OutputTokens: 10,
				TotalTokens:  999,
			},
			fallback: UsageTotalFallbackInputOutput,
			want: Usage{
				InputTokens:      10,
				OutputTokens:     10,
				PromptTokens:     10,
				CompletionTokens: 10,
				TotalTokens:      999,
			},
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := NormalizeUsage(tc.in, tc.fallback)

			if !compareUsage(got, tc.want) {
				t.Errorf("NormalizeUsage() = %+v, want %+v", got, tc.want)
			}
		})
	}
}
