package translator

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
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
				Message: openai.ChatCompletionMessage{Content: "bonjour"},
			}}},
			want: "bonjour",
		},
		{
			name: "strips trailing model control marker",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				Message: openai.ChatCompletionMessage{Content: "bonjour <|END_RESPONSE|>"},
			}}},
			want: "bonjour",
		},
		{
			name: "strips embedded model control marker",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{{
				Message: openai.ChatCompletionMessage{Content: "bon<|END_RESPONSE|>jour"},
			}}},
			want: "bonjour",
		},
		{
			name: "uses first choice only",
			resp: &openai.ChatCompletion{Choices: []openai.ChatCompletionChoice{
				{Message: openai.ChatCompletionMessage{Content: "bonjour"}},
				{Message: openai.ChatCompletionMessage{Content: "salut"}},
			}},
			want: "bonjour",
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
	if !strings.Contains(got.SystemPrompt, "Runtime translation context (do not translate or repeat):\nEntry key: common.hello") {
		t.Fatalf("expected runtime context in provider system prompt, got %q", got.SystemPrompt)
	}
	if !strings.Contains(got.UserPrompt, "Source text:\nhello") {
		t.Fatalf("expected composed user prompt, got %q", got.UserPrompt)
	}
	if got.RuntimeContext != "" {
		t.Fatalf("expected runtime context cleared before provider call, got %q", got.RuntimeContext)
	}
}
