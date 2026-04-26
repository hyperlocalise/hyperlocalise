package translator

import (
	"context"
	"encoding/json"
)

type Usage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int

	// PromptTokens and CompletionTokens are compatibility aliases for older
	// callers. New provider integrations should set InputTokens and OutputTokens.
	PromptTokens     int
	CompletionTokens int

	CachedInputTokens        int
	CacheWriteInputTokens    int
	ReasoningTokens          int
	TextInputTokens          int
	ImageInputTokens         int
	AudioInputTokens         int
	TextOutputTokens         int
	ImageOutputTokens        int
	AudioOutputTokens        int
	ToolInputTokens          int
	AcceptedPredictionTokens int
	RejectedPredictionTokens int
	RawProviderUsage         json.RawMessage
}

type UsageTotalFallback string

const (
	UsageTotalFallbackInputOutput UsageTotalFallback = "input_output"
	UsageTotalFallbackAnthropic   UsageTotalFallback = "anthropic"
)

type usageCollectorKey struct{}

func WithUsageCollector(ctx context.Context, usage *Usage) context.Context {
	if usage == nil {
		return ctx
	}
	return context.WithValue(ctx, usageCollectorKey{}, usage)
}

func SetUsage(ctx context.Context, usage Usage) {
	collector, ok := ctx.Value(usageCollectorKey{}).(*Usage)
	if !ok || collector == nil {
		return
	}
	*collector = NormalizeUsage(usage, UsageTotalFallbackInputOutput)
}

// NormalizeUsage fills compatibility aliases and derives total tokens when the
// provider did not return a total.
func NormalizeUsage(usage Usage, fallback UsageTotalFallback) Usage {
	if usage.InputTokens == 0 && usage.PromptTokens != 0 {
		usage.InputTokens = usage.PromptTokens
	}
	if usage.OutputTokens == 0 && usage.CompletionTokens != 0 {
		usage.OutputTokens = usage.CompletionTokens
	}
	if usage.PromptTokens == 0 && usage.InputTokens != 0 {
		usage.PromptTokens = usage.InputTokens
	}
	if usage.CompletionTokens == 0 && usage.OutputTokens != 0 {
		usage.CompletionTokens = usage.OutputTokens
	}
	if usage.TotalTokens == 0 {
		switch fallback {
		case UsageTotalFallbackAnthropic:
			usage.TotalTokens = usage.InputTokens + usage.OutputTokens + usage.CacheWriteInputTokens + usage.CachedInputTokens
		default:
			usage.TotalTokens = usage.InputTokens + usage.OutputTokens
		}
	}
	return usage
}

// UsageHasValues reports whether a normalized usage object has any token data.
func UsageHasValues(usage Usage) bool {
	usage = NormalizeUsage(usage, UsageTotalFallbackInputOutput)
	return usage.InputTokens != 0 ||
		usage.OutputTokens != 0 ||
		usage.TotalTokens != 0 ||
		usage.CachedInputTokens != 0 ||
		usage.CacheWriteInputTokens != 0 ||
		usage.ReasoningTokens != 0 ||
		usage.TextInputTokens != 0 ||
		usage.ImageInputTokens != 0 ||
		usage.AudioInputTokens != 0 ||
		usage.TextOutputTokens != 0 ||
		usage.ImageOutputTokens != 0 ||
		usage.AudioOutputTokens != 0 ||
		usage.ToolInputTokens != 0 ||
		usage.AcceptedPredictionTokens != 0 ||
		usage.RejectedPredictionTokens != 0
}

// AnthropicUsageInput captures Anthropic's native usage shape.
type AnthropicUsageInput struct {
	InputTokens              int
	OutputTokens             int
	CacheCreationInputTokens int
	CacheReadInputTokens     int
	RawProviderUsage         json.RawMessage
}

// UsageFromAnthropic maps Anthropic native usage to the shared usage model.
func UsageFromAnthropic(in AnthropicUsageInput) Usage {
	return NormalizeUsage(Usage{
		InputTokens:           in.InputTokens,
		OutputTokens:          in.OutputTokens,
		CacheWriteInputTokens: in.CacheCreationInputTokens,
		CachedInputTokens:     in.CacheReadInputTokens,
		RawProviderUsage:      in.RawProviderUsage,
	}, UsageTotalFallbackAnthropic)
}

// GeminiUsageInput captures Gemini's native UsageMetadata shape.
type GeminiUsageInput struct {
	PromptTokenCount        int
	CandidatesTokenCount    int
	TotalTokenCount         int
	CachedContentTokenCount int
	ThoughtsTokenCount      int
	ToolUsePromptTokenCount int
	RawProviderUsage        json.RawMessage
}

// UsageFromGemini maps Gemini native usage metadata to the shared usage model.
func UsageFromGemini(in GeminiUsageInput) Usage {
	return NormalizeUsage(Usage{
		InputTokens:       in.PromptTokenCount,
		OutputTokens:      in.CandidatesTokenCount,
		TotalTokens:       in.TotalTokenCount,
		CachedInputTokens: in.CachedContentTokenCount,
		ReasoningTokens:   in.ThoughtsTokenCount,
		ToolInputTokens:   in.ToolUsePromptTokenCount,
		RawProviderUsage:  in.RawProviderUsage,
	}, UsageTotalFallbackInputOutput)
}
