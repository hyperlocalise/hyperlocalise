package translator

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/packages/respjson"
)

type fakeProvider struct {
	name   string
	result string
	err    error
}

func (p fakeProvider) Name() string { return p.name }

func (p fakeProvider) Translate(_ context.Context, _ Request) (string, error) {
	if p.err != nil {
		return "", p.err
	}
	return p.result, nil
}

type captureProvider struct {
	name string
	got  *Request
}

func (p captureProvider) Name() string { return p.name }

func (p captureProvider) Translate(_ context.Context, req Request) (string, error) {
	if p.got != nil {
		*p.got = req
	}
	return "ok", nil
}

type fakeImageProvider struct {
	name   string
	result []byte
	got    *ImageEditRequest
}

func (p fakeImageProvider) Name() string { return p.name }

func (p fakeImageProvider) Translate(_ context.Context, _ Request) (string, error) {
	return "ok", nil
}

func (p fakeImageProvider) EditImage(_ context.Context, req ImageEditRequest) ([]byte, error) {
	if p.got != nil {
		*p.got = req
	}
	return p.result, nil
}

func TestRegisterRejectsDuplicateProvider(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	provider := fakeProvider{name: "openai"}

	if err := tool.Register(provider); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	if err := tool.Register(provider); err == nil {
		t.Fatalf("expected duplicate registration error")
	}
}

func TestTranslateRejectsUnknownProvider(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	_, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		ModelProvider:  "unknown",
		Model:          "gpt-5",
	})
	if err == nil {
		t.Fatalf("expected unknown provider error")
	}
}

func TestTranslateUsesRegisteredProvider(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	if err := tool.Register(fakeProvider{name: ProviderOpenAI, result: "bonjour"}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	translated, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Model:          "gpt-5",
	})
	if err != nil {
		t.Fatalf("translate: %v", err)
	}
	if translated != "bonjour" {
		t.Fatalf("unexpected translation: %q", translated)
	}
}

func TestEditImageUsesRegisteredImageProvider(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	var got ImageEditRequest
	if err := tool.Register(fakeImageProvider{name: ProviderOpenAI, result: []byte("image"), got: &got}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	image, err := tool.EditImage(context.Background(), ImageEditRequest{
		SourceImage:    []byte("source"),
		TargetLanguage: "fr",
		Model:          OpenAIImageModel,
		Prompt:         "localize",
		OutputFormat:   "png",
	})
	if err != nil {
		t.Fatalf("edit image: %v", err)
	}
	if string(image) != "image" {
		t.Fatalf("image = %q, want image", string(image))
	}
	if got.Model != OpenAIImageModel || got.OutputFormat != "png" {
		t.Fatalf("request model/format = %q/%q", got.Model, got.OutputFormat)
	}
}

func TestOpenAIProviderEditImageUsesFixedRequest(t *testing.T) {
	t.Setenv(defaultOpenAIAPIKeyEnv, "test-key")
	original := openAIImageEditFunc
	defer func() { openAIImageEditFunc = original }()

	var got ImageEditRequest
	openAIImageEditFunc = func(_ context.Context, req ImageEditRequest, _ ...option.RequestOption) ([]byte, error) {
		got = req
		return []byte("image"), nil
	}

	image, err := NewOpenAIProvider().EditImage(context.Background(), ImageEditRequest{
		SourceImage:    []byte("source"),
		TargetLanguage: "fr",
		Model:          OpenAIImageModel,
		Prompt:         "localize",
		OutputFormat:   "jpeg",
	})
	if err != nil {
		t.Fatalf("openai edit image: %v", err)
	}
	if string(image) != "image" {
		t.Fatalf("image = %q, want image", string(image))
	}
	if got.Model != OpenAIImageModel || got.OutputFormat != "jpeg" || got.Prompt != "localize" {
		t.Fatalf("request = %+v", got)
	}
}

func TestNewRegistersDefaultProviders(t *testing.T) {
	t.Parallel()

	tool, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}

	if _, ok := tool.providers[ProviderOpenAI]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderOpenAI)
	}

	if _, ok := tool.providers[ProviderAnthropic]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderAnthropic)
	}

	if _, ok := tool.providers[ProviderAzureOpenAI]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderAzureOpenAI)
	}

	if _, ok := tool.providers[ProviderLMStudio]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderLMStudio)
	}

	if _, ok := tool.providers[ProviderGroq]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderGroq)
	}

	if _, ok := tool.providers[ProviderOllama]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderOllama)
	}

	if _, ok := tool.providers[ProviderGemini]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderGemini)
	}

	if _, ok := tool.providers[ProviderBedrock]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderBedrock)
	}

	if _, ok := tool.providers[ProviderOpenRouter]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderOpenRouter)
	}

	if _, ok := tool.providers[ProviderAIGateway]; !ok {
		t.Fatalf("expected %q provider to be registered", ProviderAIGateway)
	}
}

func TestResponseText(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		resp    *openai.ChatCompletion
		want    string
		wantErr bool
	}{
		{
			name: "single text block",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "stop",
				Message:      openai.ChatCompletionMessage{Content: "bonjour"},
			}}},
			want: "bonjour",
		},
		{
			name: "strips trailing model control marker",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "stop",
				Message:      openai.ChatCompletionMessage{Content: "bonjour <|END_RESPONSE|>"},
			}}},
			want: "bonjour",
		},
		{
			name: "strips embedded model control marker",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "stop",
				Message:      openai.ChatCompletionMessage{Content: "bon<|END_RESPONSE|>jour"},
			}}},
			want: "bonjour",
		},
		{
			name: "uses first choice only",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{
				{FinishReason: "stop", Message: openai.ChatCompletionMessage{Content: "bonjour"}},
				{FinishReason: "stop", Message: openai.ChatCompletionMessage{Content: "salut"}},
			}},
			want: "bonjour",
		},
		{
			name: "rejects truncated completion",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "length",
				Message:      openai.ChatCompletionMessage{Content: `{"greeting": "bon`},
			}}},
			wantErr: true,
		},
		{
			name: "rejects content filter completion",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "content_filter",
				Message:      openai.ChatCompletionMessage{Content: "[filtered]"},
			}}},
			wantErr: true,
		},
		{
			name: "rejects finish_reason error with partial content",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "error",
				Message:      openai.ChatCompletionMessage{Content: "partial-out"},
			}}},
			wantErr: true,
		},
		{
			name: "rejects tool_calls finish reason with partial content",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "tool_calls",
				Message:      openai.ChatCompletionMessage{Content: `{"greeting": "bon`},
			}}},
			wantErr: true,
		},
		{
			name: "rejects function_call finish reason with partial content",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				FinishReason: "function_call",
				Message:      openai.ChatCompletionMessage{Content: "partial-out"},
			}}},
			wantErr: true,
		},
		{
			name: "rejects choice-level provider error even when finish_reason is stop",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{
				choiceWithProviderError("stop", "half-translated {", `{"code":503,"message":"Provider disconnected"}`),
			}},
			wantErr: true,
		},
		{
			name:    "empty content",
			resp:    &openai.ChatCompletion{},
			want:    "",
			wantErr: true,
		},
		{
			name:    "nil response",
			resp:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := responseText(tc.resp)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error")
				}
				return
			}

			if err != nil {
				t.Fatalf("responseText error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("responseText = %q, want %q", got, tc.want)
			}
		})
	}
}

func choiceWithProviderError(finishReason, content, errorJSON string) openai.ChatCompletionChoice {
	choice := openai.ChatCompletionChoice{
		FinishReason: finishReason,
		Message:      openai.ChatCompletionMessage{Content: content},
	}
	choice.JSON.ExtraFields = map[string]respjson.Field{
		"error": respjson.NewField(errorJSON),
	}
	return choice
}

func TestFormatChoiceProviderError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "empty payload",
			raw:  "   ",
			want: "provider reported an error in the completion choice",
		},
		{
			name: "non-json payload",
			raw:  "upstream blew up",
			want: "provider reported an error in the completion choice: upstream blew up",
		},
		{
			name: "numeric code and message include retryable status phrase",
			raw:  `{"code":502,"message":"Provider disconnected mid-stream"}`,
			want: "provider reported an error in the completion choice (status code 502): Provider disconnected mid-stream",
		},
		{
			name: "string code is normalized for retry heuristics",
			raw:  `{"code":"503","message":"Temporary upstream failure"}`,
			want: "provider reported an error in the completion choice (status code 503): Temporary upstream failure",
		},
		{
			name: "code only",
			raw:  `{"code":504}`,
			want: "provider reported an error in the completion choice (status code 504)",
		},
		{
			name: "message only",
			raw:  `{"message":"model overloaded"}`,
			want: "provider reported an error in the completion choice: model overloaded",
		},
		{
			name: "zero and null codes are ignored",
			raw:  `{"code":0,"message":"ignored code"}`,
			want: "provider reported an error in the completion choice: ignored code",
		},
		{
			name: "null code falls back to message",
			raw:  `{"code":null,"message":"no code"}`,
			want: "provider reported an error in the completion choice: no code",
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := formatChoiceProviderError(tc.raw)
			if got != tc.want {
				t.Fatalf("formatChoiceProviderError = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestResponseTextChoiceProviderErrorIncludesStatusCode(t *testing.T) {
	t.Parallel()

	_, err := responseText(&openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{
		choiceWithProviderError("error", "partial-out", `{"code":"502","message":"bad gateway"}`),
	}})
	if err == nil {
		t.Fatal("expected choice provider error")
	}
	if !strings.Contains(err.Error(), "status code 502") {
		t.Fatalf("error %q does not include status code 502 for retry heuristics", err.Error())
	}
	if !strings.Contains(err.Error(), "bad gateway") {
		t.Fatalf("error %q does not include provider message", err.Error())
	}
}

func TestProviderErrorIsWrapped(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	baseErr := errors.New("boom")
	if err := tool.Register(fakeProvider{name: ProviderOpenAI, err: baseErr}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Model:          "gpt-5",
	})
	if !errors.Is(err, baseErr) {
		t.Fatalf("expected wrapped provider error")
	}
}

func TestTranslateComposesPromptsBeforeProviderCall(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	var got Request
	if err := tool.Register(captureProvider{name: ProviderOpenAI, got: &got}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Model:          "gpt-5",
		RuntimeContext: "Entry key: common.hello",
	})
	if err != nil {
		t.Fatalf("translate: %v", err)
	}
	if got.SystemPrompt == "" || !strings.Contains(got.SystemPrompt, "Target language: fr") {
		t.Fatalf("expected composed system prompt, got %q", got.SystemPrompt)
	}
	if !strings.Contains(got.SystemPrompt, "Runtime translation context (guidance only; never translate, repeat, or use as the translation value):\nEntry key: common.hello") {
		t.Fatalf("expected runtime context in provider system prompt, got %q", got.SystemPrompt)
	}
	if !strings.Contains(got.UserPrompt, "Source text:\nhello") {
		t.Fatalf("expected composed user prompt, got %q", got.UserPrompt)
	}
	if got.RuntimeContext != "" {
		t.Fatalf("expected runtime context cleared before provider call, got %q", got.RuntimeContext)
	}
}
