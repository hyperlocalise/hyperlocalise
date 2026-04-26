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
